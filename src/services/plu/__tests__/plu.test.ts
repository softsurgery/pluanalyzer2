import { describe, expect, it } from 'vitest'
import { parsePluArticles } from '@/services/plu/pdf-extractor'
import { validateRegulatoryRules } from '@/services/plu/regulatory-validator'
import { calculateConstructibility } from '@/services/plu/constructibility'
import { buildArchicadExport } from '@/services/plu/archicad-export'
import { interpretRegulationsWithOllama } from '@/services/plu/ollama-interpreter'
import { compareAnalysisSnapshots } from '@/services/plu/pipeline'
import type { StructuredRegulatoryRules } from '@/services/plu/types'

const SAMPLE_RULES: StructuredRegulatoryRules = {
  maxHeightM: 15,
  maxEavesHeightM: 12,
  maxStoreys: 4,
  maxCoverageRatio: 0.6,
  frontSetbackM: 0,
  sideSetbackM: 3,
  rearSetbackM: 4,
  minGreenRatio: 0.2,
  parkingPerDwelling: 1.5,
}

describe('PLU Analysis Modules', () => {
  it('parses French PLU articles from extracted text', () => {
    const text = `
ARTICLE UA 6 : Implantation par rapport aux voies
Alignement obligatoire.

ARTICLE UA 9 : Emprise au sol
L'emprise au sol maximale est de 60%.

ARTICLE UA 10 : Hauteur maximale
La hauteur maximale est de 15 mètres.
`
    const articles = parsePluArticles(text)
    expect(articles).toHaveLength(3)
    expect(articles[0].articleNumber).toBe('Article UA')
    expect(articles[1].content).toContain('60%')
  })

  it('validates regulatory rules and detects invalid ratios', () => {
    const valid = validateRegulatoryRules({
      rules: SAMPLE_RULES,
      hasOfficialZoning: true,
      hasOfficialRegulations: true,
    })
    expect(valid.status).toBe('valid')
    expect(valid.completenessScore).toBe(100)

    const invalid = validateRegulatoryRules({
      rules: { ...SAMPLE_RULES, maxCoverageRatio: 1.4 },
      hasOfficialZoning: true,
      hasOfficialRegulations: true,
    })
    expect(invalid.status).toBe('invalid')
    expect(invalid.issues.some((i) => i.severity === 'error')).toBe(true)
  })

  it('calculates constructibility metrics deterministically', () => {
    const res = calculateConstructibility({
      parcelSurfaceM2: 1000,
      rules: SAMPLE_RULES,
    })
    expect(res.status).toBe('computed')
    expect(res.maxFootprintM2).toBe(600)
    expect(res.minGreenSpaceM2).toBe(200)
    expect(res.estimatedStoreys).toBe(4)
    expect(res.maxFloorAreaSdpM2).toBeGreaterThan(0)
    expect(res.maxVolumeM3).toBeGreaterThan(0)
  })

  it('returns insufficient_data when parcel surface is missing', () => {
    const res = calculateConstructibility({
      parcelSurfaceM2: null,
      rules: SAMPLE_RULES,
    })
    expect(res.status).toBe('insufficient_data')
    expect(res.missingParameters).toContain('parcelSurfaceM2')
  })

  it('builds Archicad export with local metric outline', () => {
    const calc = calculateConstructibility({ parcelSurfaceM2: 1000, rules: SAMPLE_RULES })
    const exported = buildArchicadExport({
      project: { id: 1, name: 'Test AMP', commune: 'Aix-en-Provence', codeInsee: '13001' },
      parcel: {
        idu: '13001000AB0123',
        surfaceM2: 1000,
        centroid: { lng: 5.44235, lat: 43.52635 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [5.4421, 43.5262],
              [5.4426, 43.5262],
              [5.4426, 43.5265],
              [5.4421, 43.5265],
              [5.4421, 43.5262],
            ],
          ],
        },
      },
      zoning: { zoneCode: 'UA', zoneLabel: 'Urbaine centrale', zoneType: 'U' },
      rules: SAMPLE_RULES,
      constructibility: calc,
    })
    expect(exported.schemaVersion).toBe('1.0.0')
    expect(exported.parcel.localOutlineMeters).toHaveLength(5)
    expect(exported.envelopeConstraints.maxHeightM).toBe(15)
  })

  it('never fabricates regulatory rules when articles are missing or Ollama is disabled', async () => {
    const emptyRes = await interpretRegulationsWithOllama({
      prompt: 'Test',
      zoneCode: 'UA',
      articles: [],
    })
    expect(emptyRes.status).toBe('insufficient_data')
    expect(emptyRes.rules.maxHeightM).toBeNull()

    const prevDisabled = process.env.OLLAMA_DISABLED
    process.env.OLLAMA_DISABLED = 'true'
    const unconfiguredRes = await interpretRegulationsWithOllama({
      prompt: 'Test',
      zoneCode: 'UA',
      articles: [{ articleNumber: 'Article 10', title: 'Hauteur', content: 'Hauteur max 12m' }],
    })
    expect(unconfiguredRes.status).toBe('unconfigured')
    if (prevDisabled !== undefined) {
      process.env.OLLAMA_DISABLED = prevDisabled
    } else {
      delete process.env.OLLAMA_DISABLED
    }
  })

  it('compares two historical snapshots accurately', () => {
    const diff = compareAnalysisSnapshots(
      {
        id: 1,
        version: 1,
        snapshotLabel: 'v1',
        zoneCode: 'UA',
        originalPrompt: 'Prompt 1',
        constructibilityCalculations: { maxFloorAreaSdpM2: 2000, maxHeightM: 12 },
      },
      {
        id: 2,
        version: 2,
        snapshotLabel: 'v2',
        zoneCode: 'UB',
        originalPrompt: 'Prompt 2',
        constructibilityCalculations: { maxFloorAreaSdpM2: 2400, maxHeightM: 15 },
      },
    )
    expect(diff.promptChanged).toBe(true)
    expect(diff.zoneChanged).toBe(true)
    const sdpRow = diff.constructibilityDiff.find((d) => d.metric === 'maxFloorAreaSdpM2')
    expect(sdpRow?.delta).toBe(400)
  })
})
