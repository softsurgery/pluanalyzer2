import type { Payload } from 'payload'
import { calculateConstructibility } from '@/services/plu/constructibility'
import { validateRegulatoryRules } from '@/services/plu/regulatory-validator'
import { buildArchicadExport } from '@/services/plu/archicad-export'
import type { StructuredRegulatoryRules } from '@/services/plu/types'

export async function seedDatabase(payload: Payload) {
  // 1. Seed Users
  const usersToEnsure = [
    {
      email: 'admin@pluanalyzer.fr',
      password: 'PluAdmin2026!',
      fullName: 'Administrateur PLU',
      role: 'admin' as const,
      organization: 'Métropole Aix-Marseille-Provence',
    },
    {
      email: 'planner@pluanalyzer.fr',
      password: 'PluPlanner2026!',
      fullName: 'Claire Moreau (Urbaniste)',
      role: 'urban_planner' as const,
      organization: 'Agence d\'Urbanisme Pays d\'Aix',
    },
    {
      email: 'viewer@pluanalyzer.fr',
      password: 'PluViewer2026!',
      fullName: 'Observateur Collectivité',
      role: 'viewer' as const,
      organization: 'Ville d\'Aix-en-Provence',
    },
  ]

  let plannerUserId: number | string | null = null

  for (const u of usersToEnsure) {
    const existing = await payload.find({
      collection: 'users',
      where: { email: { equals: u.email } },
      limit: 1,
    })
    if (existing.docs.length === 0) {
      const created = await payload.create({
        collection: 'users',
        data: u,
      })
      if (u.role === 'urban_planner') plannerUserId = created.id
    } else if (u.role === 'urban_planner') {
      plannerUserId = existing.docs[0].id
    }
  }

  if (!plannerUserId) {
    const anyUser = await payload.find({ collection: 'users', limit: 1 })
    plannerUserId = anyUser.docs[0].id
  }

  // 2. Seed Sample Parcel (Aix-en-Provence)
  const sampleIdu = '13001000AB0123'
  const existingParcel = await payload.find({
    collection: 'parcels',
    where: { idu: { equals: sampleIdu } },
    limit: 1,
  })

  const parcelGeometry = {
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
  }

  const parcel =
    existingParcel.docs[0] ||
    (await payload.create({
      collection: 'parcels',
      data: {
        idu: sampleIdu,
        codeInsee: '13001',
        commune: 'Aix-en-Provence',
        section: 'AB',
        numero: '0123',
        prefixe: '000',
        surfaceM2: 1250,
        address: '12 Avenue Sextius, 13100 Aix-en-Provence',
        centroid: { lng: 5.44235, lat: 43.52635 },
        geometry: parcelGeometry,
        source: 'Seed Reference Parcel (Aix-en-Provence)',
      },
    }))

  // 3. Seed Sample Project
  const existingProject = await payload.find({
    collection: 'projects',
    where: { codeInsee: { equals: '13001' } },
    limit: 1,
  })

  const project =
    existingProject.docs[0] ||
    (await payload.create({
      collection: 'projects',
      data: {
        name: 'Étude Sextius-Mirabeau — Résidence Mixte',
        description:
          'Étude de faisabilité urbaine et calcul de constructibilité sur parcelle centrale à Aix-en-Provence (Métropole AMP).',
        territory: 'amp',
        commune: 'Aix-en-Provence',
        codeInsee: '13001',
        status: 'active',
        owner: Number(plannerUserId),
        parcels: [parcel.id],
      },
    }))

  // 4. Seed Sample Regulations for Zone UA (Aix-en-Provence)
  const existingReg = await payload.find({
    collection: 'regulations',
    where: {
      and: [{ zoneCode: { equals: 'UA' } }, { codeInsee: { equals: '13001' } }],
    },
    limit: 1,
  })

  const rules: StructuredRegulatoryRules = {
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

  const regulation =
    existingReg.docs[0] ||
    (await payload.create({
      collection: 'regulations',
      data: {
        title: 'Zone UA — Articles 6 à 13 (Règlement de référence)',
        zoneCode: 'UA',
        zoneLabel: 'Zone urbaine centrale dense',
        commune: 'Aix-en-Provence',
        codeInsee: '13001',
        articleNumber: 'Articles UA 6-13',
        sourceType: 'manual',
        rawText: [
          'ARTICLE UA 6 : Implantation par rapport aux voies et emprises publiques — Alignement sur voie (recul 0 m).',
          'ARTICLE UA 7 : Implantation par rapport aux limites séparatives — Retrait minimal de 3 m.',
          'ARTICLE UA 9 : Emprise au sol — L’emprise au sol maximale des constructions est fixée à 60 % de la surface du terrain.',
          'ARTICLE UA 10 : Hauteur maximale des constructions — La hauteur maximale est fixée à 15 mètres au faîtage (12 m à l’égout, R+3/4).',
          'ARTICLE UA 12 : Stationnement — 1,5 place de stationnement par logement.',
          'ARTICLE UA 13 : Espaces libres et plantations — Au moins 20 % de la surface du terrain doit rester en pleine terre.',
        ].join('\n'),
        structuredRules: rules,
      },
    }))

  // 5. Seed Initial Analysis + Snapshot + PromptHistory if none exist
  const existingAnalyses = await payload.find({
    collection: 'analyses',
    where: { project: { equals: project.id } },
    limit: 1,
  })

  if (existingAnalyses.docs.length === 0) {
    const promptText =
      'Analyser la constructibilité maximale pour un programme de logements collectifs avec commerces en rez-de-chaussée sur la parcelle AB 0123 à Aix-en-Provence.'

    const execution = await payload.create({
      collection: 'executions',
      data: {
        executionCode: 'EXEC-SEED-0001',
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 420,
        triggeredBy: Number(plannerUserId),
        steps: [
          {
            step: 'seed_baseline',
            status: 'ok',
            durationMs: 420,
            message: 'Baseline feasibility snapshot initialized from seed data.',
            timestamp: new Date().toISOString(),
          },
        ],
        logs: [],
        errors: [],
      },
    })

    const analysis = await payload.create({
      collection: 'analyses',
      data: {
        title: `${project.name} — ${sampleIdu}`,
        project: project.id,
        parcel: parcel.id,
        status: 'completed',
        currentVersion: 1,
        createdBy: Number(plannerUserId),
      },
    })

    const validationReport = validateRegulatoryRules({
      rules,
      hasOfficialZoning: true,
      hasOfficialRegulations: true,
    })

    const constructibility = calculateConstructibility({
      parcelSurfaceM2: parcel.surfaceM2,
      rules,
    })

    const archicadExport = buildArchicadExport({
      project: {
        id: project.id,
        name: project.name,
        commune: project.commune,
        codeInsee: project.codeInsee,
      },
      parcel: {
        idu: parcel.idu,
        surfaceM2: parcel.surfaceM2,
        centroid: { lng: 5.44235, lat: 43.52635 },
        geometry: parcelGeometry,
      },
      zoning: {
        zoneCode: 'UA',
        zoneLabel: 'Zone urbaine centrale dense',
        zoneType: 'U',
      },
      rules,
      constructibility,
    })

    const snapshot = await payload.create({
      collection: 'analysis-snapshots',
      data: {
        snapshotLabel: 'v1 — UA (Référence initiale)',
        analysis: analysis.id,
        project: project.id,
        parcel: parcel.id,
        version: 1,
        originalPrompt: promptText,
        submittedPayload: {
          projectId: project.id,
          parcelId: parcel.id,
          idu: sampleIdu,
          prompt: promptText,
        },
        addressQuery: parcel.address,
        cadastralReferences: {
          idu: parcel.idu,
          codeInsee: parcel.codeInsee,
          section: parcel.section,
          numero: parcel.numero,
          surfaceM2: parcel.surfaceM2,
          commune: parcel.commune,
        },
        zoneCode: 'UA',
        zoningAndGis: {
          zoneCode: 'UA',
          zoneLabel: 'Zone urbaine centrale dense',
          source: 'Seed baseline',
        },
        regulations: [regulation.id],
        extractedArticles: [
          {
            articleNumber: regulation.articleNumber,
            title: regulation.title,
            content: regulation.rawText,
          },
        ],
        regulatoryInterpretation: {
          status: 'ok',
          model: 'seed-baseline',
          zoneCode: 'UA',
          summary:
            'Parcelle de 1 250 m² en zone UA : emprise au sol max 60 % (750 m²), hauteur max 15 m (4 niveaux), recul latéral 3 m, pleine terre min 20 % (250 m²).',
          rules,
          citations: [
            { article: 'Article UA 9', excerpt: 'Emprise au sol maximale fixée à 60 %.' },
            { article: 'Article UA 10', excerpt: 'Hauteur maximale fixée à 15 mètres.' },
          ],
          warnings: [],
        },
        validationStatus: validationReport.status,
        validationReport: validationReport as unknown as Record<string, unknown>,
        constructibilityCalculations: constructibility as unknown as Record<string, unknown>,
        archicadExport: archicadExport as unknown as Record<string, unknown>,
        aiResponses: { model: 'seed-baseline', status: 'ok' },
        execution: execution.id,
        executionLogs: [
          {
            step: 'seed_baseline',
            status: 'ok',
            durationMs: 420,
            message: 'Baseline snapshot created',
          },
        ],
        executionErrors: [],
        createdBy: Number(plannerUserId),
      },
    })

    await payload.create({
      collection: 'prompt-history',
      data: {
        promptPreview: promptText.slice(0, 120),
        promptText,
        submittedPayload: {
          projectId: project.id,
          parcelId: parcel.id,
          idu: sampleIdu,
          prompt: promptText,
        },
        version: 1,
        isReplay: false,
        project: project.id,
        analysis: analysis.id,
        snapshot: snapshot.id,
        execution: execution.id,
        createdBy: Number(plannerUserId),
      },
    })

    await payload.update({
      collection: 'analyses',
      id: analysis.id,
      data: {
        latestSnapshot: snapshot.id,
      },
    })

    await payload.update({
      collection: 'executions',
      id: execution.id,
      data: {
        analysis: analysis.id,
      },
    })
  }

  return { seeded: true }
}
