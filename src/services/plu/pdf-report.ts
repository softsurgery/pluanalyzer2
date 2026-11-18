import { PDF_CONTENT_W, PdfDocumentBuilder } from '@/lib/pdf-builder'

export interface PluPdfReportInput {
  projectName: string
  summary?: string | null
  calculations: Record<string, unknown>
}

/**
 * PLU-specific PDF feasibility report inheriting from the general
 * abstract `PdfDocumentBuilder`.
 */
export class PluFeasibilityPdfReport extends PdfDocumentBuilder {
  constructor(private readonly input: PluPdfReportInput) {
    super()
  }

  protected override getFooterText(): string {
    return 'PLU Analyzer - Rapport genere automatiquement'
  }

  protected override renderBody(): void {
    const calc = this.input.calculations || {}

    this.drawHeaderBanner(
      this.input.projectName || 'Projet PLU',
      'PLU ANALYZER - RAPPORT DE FAISABILITE URBANISTIQUE',
    )

    this.drawSectionTitle('Calculs de Constructibilite')
    const metricRows: string[][] = [
      [
        'Surface parcelle',
        calc.parcelSurfaceM2 ? `${calc.parcelSurfaceM2} m2` : 'N/A',
      ],
      [
        'Emprise au sol maximale',
        calc.maxFootprintM2 ? `${calc.maxFootprintM2} m2` : 'N/A',
      ],
      [
        'Emprise constructible estimee (apres reculs)',
        calc.estimatedBuildableFootprintM2
          ? `${calc.estimatedBuildableFootprintM2} m2`
          : 'N/A',
      ],
      [
        'Hauteur maximale autorisee',
        calc.maxHeightM ? `${calc.maxHeightM} m` : 'N/A',
      ],
      [
        'Niveaux estimes',
        calc.estimatedStoreys ? `R+${Number(calc.estimatedStoreys) - 1}` : 'N/A',
      ],
      [
        'Surface de plancher (SDP) max estimee',
        calc.maxFloorAreaSdpM2 ? `${calc.maxFloorAreaSdpM2} m2` : 'N/A',
      ],
      [
        'Volume maximal estime',
        calc.maxVolumeM3 ? `${calc.maxVolumeM3} m3` : 'N/A',
      ],
      [
        'Pleine terre minimale',
        calc.minGreenSpaceM2 ? `${calc.minGreenSpaceM2} m2` : 'N/A',
      ],
    ]
    this.drawTable(
      ['Parametre de constructibilite', 'Valeur estimee'],
      metricRows.map(([k, v]) => [k, `**${v}**`]),
      [PDF_CONTENT_W * 0.65, PDF_CONTENT_W * 0.35],
      ['left', 'right'],
    )

    this.drawSectionTitle('Synthese Reglementaire')
    this.drawMarkdown(this.input.summary || 'Aucune synthese disponible.')
  }
}

export function buildPluPdfReport(input: PluPdfReportInput): Buffer {
  return new PluFeasibilityPdfReport(input).build()
}
