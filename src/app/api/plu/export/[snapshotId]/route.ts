import { NextResponse } from 'next/server'
import { getPayloadWithUser } from '@/lib/payload-auth'
import { buildPluPdfReport } from '@/lib/pdf-report'

export async function GET(
  request: Request,
  context: { params: Promise<{ snapshotId: string }> },
) {
  try {
    const { payload, user } = await getPayloadWithUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { snapshotId } = await context.params
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'json'

    const snapshot = await payload.findByID({
      collection: 'analysis-snapshots',
      id: snapshotId,
      depth: 1,
    })

    if (format === 'archicad') {
      return new NextResponse(JSON.stringify(snapshot.archicadExport || {}, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="archicad-plu-snapshot-${snapshotId}.json"`,
        },
      })
    }

    if (format === 'pdf') {
      const calc = (snapshot.constructibilityCalculations || {}) as Record<string, unknown>
      const interp = (snapshot.regulatoryInterpretation || {}) as Record<string, unknown>
      const projectName =
        typeof snapshot.project === 'object' &&
        snapshot.project !== null &&
        'name' in snapshot.project
          ? String(snapshot.project.name)
          : 'Projet PLU'
      const pdfBuffer = buildPluPdfReport({
        projectName,
        summary: typeof interp.summary === 'string' ? interp.summary : null,
        calculations: calc,
      })

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="plu-report-snapshot-${snapshotId}.pdf"`,
        },
      })
    }

    if (format === 'markdown') {
      const calc = (snapshot.constructibilityCalculations || {}) as Record<string, unknown>
      const interp = (snapshot.regulatoryInterpretation || {}) as Record<string, unknown>
      const md = [
        `# Rapport de Faisabilité PLU — ${snapshot.snapshotLabel}`,
        '',
        `- **Version**: v${snapshot.version}`,
        `- **Date**: ${snapshot.createdAt}`,
        `- **Zone PLU**: ${snapshot.zoneCode || 'Non identifiée'}`,
        `- **Validation**: ${snapshot.validationStatus}`,
        '',
        `## Prompt d'origine`,
        snapshot.originalPrompt,
        '',
        `## Synthèse Réglementaire`,
        String(interp.summary || 'Aucune synthèse disponible.'),
        '',
        `## Calculs de Constructibilité`,
        `- Surface parcelle: ${calc.parcelSurfaceM2 ?? 'N/A'} m²`,
        `- Emprise au sol max: ${calc.maxFootprintM2 ?? 'N/A'} m²`,
        `- Emprise constructible estimée (après reculs): ${calc.estimatedBuildableFootprintM2 ?? 'N/A'} m²`,
        `- Hauteur max: ${calc.maxHeightM ?? 'N/A'} m`,
        `- Niveaux estimés: ${calc.estimatedStoreys ?? 'N/A'}`,
        `- SDP maximale estimée: ${calc.maxFloorAreaSdpM2 ?? 'N/A'} m²`,
        `- Volume maximal estimé: ${calc.maxVolumeM3 ?? 'N/A'} m³`,
        `- Pleine terre min: ${calc.minGreenSpaceM2 ?? 'N/A'} m²`,
      ].join('\n')

      return new NextResponse(md, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="plu-report-snapshot-${snapshotId}.md"`,
        },
      })
    }

    return new NextResponse(JSON.stringify(snapshot, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="plu-snapshot-${snapshotId}.json"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
