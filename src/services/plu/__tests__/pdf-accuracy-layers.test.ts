import { describe, expect, it } from 'vitest'
import { PdfDownloadService, PdfExtractor } from '@/services/pdf'
import {
  chunkZoneArticles,
  filterSubZoneArticles,
  isolateZoneSection,
  isMonoZonePdf,
  matchArticlesByTitle,
} from '@/services/plu/article-selection'
import {
  extractDeterministicRulesFromArticles,
  MAX_AI_CALLS_PER_FLOW,
  runTargetedRecoveryPasses,
  verifyVerbatimCitation,
} from '@/services/plu/regulatory-recovery'
import { calculateConstructibility } from '@/services/plu/constructibility'
import type { OllamaService } from '@/services/ollama/OllamaService'
import {
  mergeGraphicRules,
  OFFICIAL_PDF_FALLBACK,
  validateAndSanitizeExtractedRules,
  validateRule,
} from '@/services/plu/regulatory-validator'
import type { ExtractedArticle, StructuredRegulatoryRules } from '@/services/plu/types'

describe('PDF Extraction, Zone Isolation & 6-Layer Accuracy Pipeline', () => {
  it('parses #page= hints and computes targeted page windows (pageHint - 10 to +60)', () => {
    expect(PdfExtractor.parsePageHintFromUrl('https://example.fr/plui.pdf#page=42')).toBe(42)
    expect(PdfExtractor.parsePageHintFromUrl('https://example.fr/plui.pdf')).toBeUndefined()

    expect(PdfExtractor.resolvePageWindow({ pageHint: 42 })).toEqual({
      firstPage: 32,
      lastPage: 102,
    })
    expect(PdfExtractor.resolvePageWindow({ pageHint: 5 })).toEqual({
      firstPage: 1,
      lastPage: 65,
    })
  })

  it('caches zone-keyed results and manages background extraction jobs', async () => {
    PdfDownloadService.setCachedZoneResult('doc-123', 'UA', { ok: true })
    expect(PdfDownloadService.getCachedZoneResult<{ ok: boolean }>('doc-123', 'ua')).toEqual({
      ok: true,
    })

    const job = PdfDownloadService.startBackgroundJob('job-test-1', async () => ({ count: 3 }))
    expect(['pending', 'completed']).toContain(job.status)
    await new Promise((r) => setTimeout(r, 20))
    const done = PdfDownloadService.getBackgroundJob<{ count: number }>('job-test-1')
    expect(done?.status).toBe('completed')
    expect(done?.result).toEqual({ count: 3 })
  })

  it('detects mono-zone vs multi-zone PDFs and skips TOC to isolate target zone', () => {
    const monoText = `
DISPOSITIONS APPLICABLES À LA ZONE UA
ARTICLE UA 1 : Occupations interdites
ARTICLE UA 10 : Hauteur maximale de 12 mètres.
`
    expect(isMonoZonePdf(monoText)).toBe(true)

    const multiZoneText = `
SOMMAIRE
ZONE UA ........................ 4
ZONE UB ........................ 25

DISPOSITIONS APPLICABLES À LA ZONE UA
ARTICLE UA 1 : Usages interdits
Interdit les industries.
ARTICLE UA 9 : Emprise au sol
L'emprise au sol maximale est fixée à 40 %.
ARTICLE UA 10 : Hauteur
La hauteur maximale est de 12 mètres.

DISPOSITIONS APPLICABLES À LA ZONE UB
ARTICLE UB 1 : Usages interdits
Zone UB spécifique.
ARTICLE UB 10 : Hauteur
La hauteur maximale est de 9 mètres.
`
    expect(isMonoZonePdf(multiZoneText)).toBe(false)

    const isolated = isolateZoneSection(multiZoneText, 'UA')
    expect(isolated.isMonoZone).toBe(false)
    expect(isolated.text).toContain('ARTICLE UA 9')
    expect(isolated.text).toContain('40 %')
    expect(isolated.text).not.toContain('ARTICLE UB 10')
    expect(isolated.text).not.toContain('Zone UB spécifique')
  })

  it('filters out other sub-zone articles and chunks into <= 22,000 char batches', () => {
    const articles: ExtractedArticle[] = [
      { articleNumber: 'Article UA1 4', title: 'Emprise UA1', content: 'Emprise UA1 40%' },
      { articleNumber: 'Article UA2 4', title: 'Emprise UA2', content: 'Emprise UA2 25%' },
      { articleNumber: 'Article 10', title: 'Hauteur', content: 'Hauteur 12m' },
    ]
    const filtered = filterSubZoneArticles(articles, 'UA1')
    expect(filtered.map((a) => a.articleNumber)).toEqual(['Article UA1 4', 'Article 10'])

    const longZoneText = Array.from({ length: 6 }, (_, i) =>
      `ARTICLE UA ${i + 1} : Titre ${i + 1}\n${'Disposition réglementaire détaillée. '.repeat(200)}`,
    ).join('\n\n')
    const { chunks } = chunkZoneArticles(longZoneText, 'UA', 22000)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      const totalChars = chunk.reduce(
        (acc, a) => acc + a.articleNumber.length + a.title.length + a.content.length + 32,
        0,
      )
      expect(totalChars).toBeLessThanOrEqual(22000)
    }
  })

  it('matches non-standard numbering (e.g. Pays d Aix UI3/UI7) via TITLE_PATTERNS', () => {
    const aixArticles: ExtractedArticle[] = [
      {
        articleNumber: 'UI3',
        title: 'Implantation des constructions par rapport aux voies',
        content: 'Recul minimal de 4 mètres.',
      },
      {
        articleNumber: 'UI7',
        title: 'Stationnement des véhicules et vélos',
        content: '2 places de stationnement par logement.',
      },
    ]
    expect(matchArticlesByTitle(aixArticles, 'recul')).toHaveLength(1)
    expect(matchArticlesByTitle(aixArticles, 'stationnement')).toHaveLength(1)
  })

  it('verifies >= 20-word verbatim citations programmatically', () => {
    const articleText =
      "Dans la bande de constructibilité de 20 mètres mesurée à compter de l'alignement de la voie publique, l'emprise au sol maximale des constructions est fixée à 40 % de la surface totale de l'unité foncière."
    const validCitation =
      "Dans la bande de constructibilité de 20 mètres mesurée à compter de l'alignement de la voie publique, l'emprise au sol maximale des constructions est fixée à 40 %"
    const shortCitation = "l'emprise au sol maximale est fixée à 40 %"
    const fakeCitation =
      'Dans cette zone urbaine la hauteur maximale de toutes les constructions nouvelles est strictement limitée à quinze mètres au faîtage.'

    expect(verifyVerbatimCitation(articleText, validCitation).valid).toBe(true)
    expect(verifyVerbatimCitation(articleText, shortCitation).valid).toBe(false)
    expect(verifyVerbatimCitation(articleText, fakeCitation).valid).toBe(false)
  })

  it('extracts deterministic regex fallbacks for complex clauses (Article 4 emprise, Article 5 facade height)', () => {
    const articles: ExtractedArticle[] = [
      {
        articleNumber: 'Article UA 4',
        title: 'Emprise au sol',
        content:
          "Dans une bande de constructibilité de 20 mètres, l'emprise au sol maximale est fixée à 45 % de la superficie du terrain.",
      },
      {
        articleNumber: 'Article UA 5',
        title: 'Hauteur des constructions',
        content:
          'La hauteur de façade ne peut excéder 11,5 mètres au point le plus haut. Gabarit R+3.',
      },
      {
        articleNumber: 'Article UA 12',
        title: 'Stationnement',
        content: 'Il est exigé 1,5 place de stationnement par logement.',
      },
    ]
    const res = extractDeterministicRulesFromArticles(articles)
    expect(res.rules.maxCoverageRatio).toBe(0.45)
    expect(res.rules.maxEavesHeightM).toBe(11.5)
    expect(res.rules.maxHeightM).toBe(11.5)
    expect(res.rules.maxStoreys).toBe(4)
    expect(res.rules.parkingPerDwelling).toBe(1.5)
  })

  it('enforces validateRule unit/category/exception guards and replaces suspicious values with "Voir PDF officiel"', () => {
    expect(validateRule('emprise', 0.4, '40 % maximum').valid).toBe(true)
    expect(validateRule('emprise', 12, '12 mètres maximum').valid).toBe(false)
    expect(
      validateRule('hauteur', 10, 'Pour les équipements publics, hauteur libre').valid,
    ).toBe(false)

    const baseRules: StructuredRegulatoryRules = {
      maxHeightM: 12,
      maxEavesHeightM: null,
      maxStoreys: null,
      maxCoverageRatio: 15, // invalid > 1
      frontSetbackM: null,
      sideSetbackM: null,
      rearSetbackM: null,
      minGreenRatio: null,
      parkingPerDwelling: null,
    }
    const sanitized = validateAndSanitizeExtractedRules({
      rules: baseRules,
      details: {
        emprise: '15 mètres',
        hauteur_totale: '12 m',
      },
    })
    expect(sanitized.rules.maxCoverageRatio).toBeNull()
    expect(sanitized.details?.emprise).toBe(OFFICIAL_PDF_FALLBACK)
    expect(sanitized.rules.maxHeightM).toBe(12)
  })

  it('overlays official ArcGIS graphic rules via mergeGraphicRules', () => {
    const baseRules: StructuredRegulatoryRules = {
      maxHeightM: null,
      maxEavesHeightM: null,
      maxStoreys: null,
      maxCoverageRatio: 0.3,
      frontSetbackM: null,
      sideSetbackM: null,
      rearSetbackM: null,
      minGreenRatio: null,
      parkingPerDwelling: null,
    }
    const overlaid = mergeGraphicRules(baseRules, {
      arcgisFeatures: [{ HAUTEUR_MAX: 15, CES: 40, RECUL_VOIE: 5 }],
      details: {},
    })
    expect(overlaid.rules.maxHeightM).toBe(15)
    expect(overlaid.rules.maxCoverageRatio).toBe(0.4)
    expect(overlaid.rules.frontSetbackM).toBe(5)
    expect(overlaid.overlaidFields).toEqual(
      expect.arrayContaining(['maxHeightM', 'maxCoverageRatio', 'frontSetbackM']),
    )
  })

  it('keeps parent sub-zone articles (UAe -> UAe4), falls back to maxEavesHeightM, and caps recovery at 5 AI calls', async () => {
    const subZoneArticles: ExtractedArticle[] = [
      { articleNumber: 'Article UAe 10', title: 'Hauteur UAe', content: 'Hauteur maximale : 12 m' },
      { articleNumber: 'Article UAe4 9', title: 'Emprise UAe4', content: 'Emprise 30 %' },
      { articleNumber: 'Article UB 10', title: 'Hauteur UB', content: 'Hauteur 9 m' },
    ]
    const kept = filterSubZoneArticles(subZoneArticles, 'UAe4')
    expect(kept.map((a) => a.articleNumber)).toEqual(['Article UAe 10', 'Article UAe4 9'])

    // Short/tabular citation & colon-separated height extraction
    expect(verifyVerbatimCitation('UAe4 | Hauteur maximale : 12 m', 'Hauteur maximale : 12 m').valid).toBe(true)
    const det = extractDeterministicRulesFromArticles([kept[0]])
    expect(det.rules.maxHeightM).toBe(12)

    // maxEavesHeightM fallback avoids N/A in constructibility
    const calc = calculateConstructibility({
      parcelSurfaceM2: 256,
      rules: {
        maxHeightM: null,
        maxEavesHeightM: 12,
        maxStoreys: null,
        maxCoverageRatio: 0.3,
        frontSetbackM: null,
        sideSetbackM: null,
        rearSetbackM: null,
        minGreenRatio: 0.6,
        parkingPerDwelling: null,
      },
    })
    expect(calc.maxHeightM).toBe(12)
    expect(calc.estimatedStoreys).toBe(4)
    expect(calc.maxFloorAreaSdpM2).toBe(307.2)
    expect(calc.maxVolumeM3).toBe(921.6)

    // Strict max 5 AI calls per flow (1 primary + at most 4 recovery calls)
    let mockCalls = 0
    const fakeOllama = {
      generateJson: async () => {
        mockCalls += 1
        return { data: { value: null, detail: null, citation: null } }
      },
    } as unknown as OllamaService

    const allMissingArticles: ExtractedArticle[] = [
      { articleNumber: 'Article 4', title: 'Emprise au sol', content: 'Texte emprise.' },
      { articleNumber: 'Article 5', title: 'Hauteur des constructions', content: 'Texte hauteur.' },
      { articleNumber: 'Article 6', title: 'Implantation recul', content: 'Texte recul.' },
      { articleNumber: 'Article 11', title: 'Aspect extérieur', content: 'Texte aspect.' },
      { articleNumber: 'Article 12', title: 'Stationnement', content: 'Texte stationnement.' },
      { articleNumber: 'Article 13', title: 'Espaces verts', content: 'Texte espaces verts.' },
    ]
    const recoveryRes = await runTargetedRecoveryPasses({
      ollama: fakeOllama,
      model: 'test-model',
      zoneCode: 'UAe4',
      articles: allMissingArticles,
      currentRules: {
        maxHeightM: null,
        maxEavesHeightM: null,
        maxStoreys: null,
        maxCoverageRatio: null,
        frontSetbackM: null,
        sideSetbackM: null,
        rearSetbackM: null,
        minGreenRatio: null,
        parkingPerDwelling: null,
      },
      currentDetails: {},
      currentCitations: [],
      warnings: [],
      initialCallsUsed: 1,
      maxCalls: MAX_AI_CALLS_PER_FLOW,
    })
    expect(mockCalls).toBeLessThanOrEqual(4)
    expect(recoveryRes.callsUsed).toBeLessThanOrEqual(MAX_AI_CALLS_PER_FLOW)
  })
})
