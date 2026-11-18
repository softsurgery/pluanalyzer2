import { describe, expect, it } from 'vitest'
import { buildPluPdfReport } from '@/services/plu/pdf-report'

describe('buildPluPdfReport', () => {
  it('generates a valid PDF 1.4 buffer with project title, Markdown, tables, and constructibility metrics', async () => {
    const markdownSummary = [
      '## Analyse des regles principales',
      '',
      'La parcelle est situee en **zone UA** avec une hauteur limitee a *15 m* (`Article UA 10`).',
      '',
      '> Attention : un recul de 4 m par rapport aux limites separatives est requis.',
      '',
      '- Coefficient d emprise au sol : **60 %**',
      '- Pleine terre minimale : **20 %**',
      '',
      '| Article | Regle | Valeur |',
      '| :--- | :--- | ---: |',
      '| UA 9 | Emprise au sol | 60 % |',
      '| UA 10 | Hauteur max | 15 m |',
      '| UA 13 | Espaces verts | 20 % |',
    ].join('\n')

    const buffer = buildPluPdfReport({
      projectName: 'Residence Les Oliviers',
      summary: markdownSummary,
      calculations: {
        parcelSurfaceM2: 1000,
        maxFootprintM2: 600,
        maxHeightM: 15,
        estimatedStoreys: 5,
      },
    })

    expect(buffer.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4')
    expect(buffer.toString('latin1')).toContain('%%EOF')

    const pdfParseModule = await import('pdf-parse')
    const pdfParse =
      pdfParseModule.default ||
      (pdfParseModule as unknown as (b: Uint8Array) => Promise<{ text: string }>)
    const parsed = await pdfParse(new Uint8Array(buffer) as Buffer)

    expect(parsed.text).toContain('Residence Les Oliviers')
    expect(parsed.text).toContain('PLU ANALYZER')
    expect(parsed.text).not.toContain("Prompt d'origine")
    expect(parsed.text).not.toContain('VERSION')
    expect(parsed.text).not.toContain('DATE')
    expect(parsed.text).toContain('1000 m2')
    expect(parsed.text).toContain('R+4')
    expect(parsed.text).toContain('Analyse des regles principales')
    expect(parsed.text).toContain('Emprise au sol')
    expect(parsed.text).toContain('UA 10')
    expect(parsed.text).toContain('Page 1 / 1')
  })
})
