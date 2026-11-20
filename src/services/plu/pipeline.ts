import type { Payload } from "payload";
import { geocodeFrenchAddress } from "@/services/plu/geocoding";
import { fetchIgnCadastreParcel } from "@/services/plu/cadastre";
import { fetchIgnApicartoGpu } from "@/services/plu/apicarto";
import { fetchMetropoleArcgisZoning } from "@/services/plu/metropole-arcgis";
import {
  fetchGpuDocuments,
  fetchGpuRegulationPdfText,
  selectArticlesForZone,
} from "@/services/plu/gpu-documents";
import { PdfExtractor } from "@/services/pdf";
import { interpretRegulationsWithOllama } from "@/services/plu/ollama-interpreter";
import { validateRegulatoryRules } from "@/services/plu/regulatory-validator";
import { calculateConstructibility } from "@/services/plu/constructibility";
import { buildArchicadExport } from "@/services/plu/archicad-export";
import type {
  ExtractedArticle,
  GeoJSONGeometry,
  GeoPoint,
  PipelineStepLog,
  StructuredRegulatoryRules,
} from "@/services/plu/types";
import { DEFAULT_OLLAMA_MODEL } from "@/services/ollama/OllamaService";

export const DEFAULT_PLU_EXTRACTION_PROMPT =
  "Extraire l'ensemble des règles d'urbanisme applicables à la parcelle (implantation, reculs, hauteur, emprise au sol, espaces verts, pleine terre, stationnement, aspect extérieur, réseaux, servitudes, risques et OAP) à partir du règlement officiel.";

export interface RunAnalysisInput {
  projectId: number | string;
  analysisId?: number | string;
  prompt?: string;
  aiModel?: string;
  address?: string;
  parcelId?: number | string;
  idu?: string;
  codeInsee?: string;
  section?: string;
  numero?: string;
  lat?: number;
  lng?: number;
  replayedFromSnapshotId?: number | string;
}

const EMPTY_RULES: StructuredRegulatoryRules = {
  maxHeightM: null,
  maxEavesHeightM: null,
  maxStoreys: null,
  maxCoverageRatio: null,
  frontSetbackM: null,
  sideSetbackM: null,
  rearSetbackM: null,
  minGreenRatio: null,
  parkingPerDwelling: null,
};

function mergeRules(
  regulations: Array<{
    structuredRules?: Partial<StructuredRegulatoryRules> | null;
  }>,
): StructuredRegulatoryRules {
  const merged: StructuredRegulatoryRules = { ...EMPTY_RULES };
  for (const reg of regulations) {
    if (!reg.structuredRules) continue;
    for (const key of Object.keys(EMPTY_RULES) as Array<
      keyof StructuredRegulatoryRules
    >) {
      const val = reg.structuredRules[key];
      if (typeof val === "number" && merged[key] === null) {
        merged[key] = val;
      }
    }
  }
  return merged;
}

export async function runPluAnalysisPipeline(
  payload: Payload,
  input: RunAnalysisInput,
  userId: number | string,
) {
  const startedAt = new Date();
  const effectivePrompt = input.prompt?.trim() || DEFAULT_PLU_EXTRACTION_PROMPT;
  const executionCode = `EXEC-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const steps: PipelineStepLog[] = [];
  const errors: Array<{ step: string; error: string }> = [];
  const gisRecordIds: Array<number | string> = [];

  const logStep = (
    step: string,
    status: PipelineStepLog["status"],
    stepStart: number,
    message: string,
  ) => {
    const durationMs = Date.now() - stepStart;
    const logLine = `[PLU Pipeline] [${executionCode}] [${status.toUpperCase()}] ${step} (${durationMs}ms): ${message}`;
    if (status === "error") {
      console.error(logLine);
    } else if (status === "warning") {
      console.warn(logLine);
    } else {
      console.log(logLine);
    }
    steps.push({
      step,
      status,
      durationMs,
      message,
      timestamp: new Date().toISOString(),
    });
  };

  console.log(
    `[PLU Pipeline] [${executionCode}] Starting analysis for projectId=${input.projectId} address="${input.address || ""}" idu="${input.idu || ""}" prompt="${effectivePrompt.slice(0, 80)}"`,
  );

  // 1. Load Project
  const project = await payload.findByID({
    collection: "projects",
    id: input.projectId,
  });

  // Create initial Execution record
  const execution = await payload.create({
    collection: "executions",
    data: {
      executionCode,
      status: "running",
      startedAt: startedAt.toISOString(),
      triggeredBy: Number(userId),
      steps: [],
      logs: [],
      errors: [],
    },
  });

  try {
    // 2. Geocoding (if address provided)
    const geoStart = Date.now();
    let geocodingResult = null;
    let targetPoint: GeoPoint | undefined;

    if (typeof input.lat === "number" && typeof input.lng === "number") {
      targetPoint = { lat: input.lat, lng: input.lng };
      logStep(
        "geocoding",
        "ok",
        geoStart,
        `Map coordinates: ${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}`,
      );
    } else if (input.address && input.address.trim()) {
      geocodingResult = await geocodeFrenchAddress(input.address);
      if (geocodingResult.status === "ok" && geocodingResult.coordinates) {
        targetPoint = geocodingResult.coordinates;
        logStep(
          "geocoding",
          "ok",
          geoStart,
          `Geocoded: ${geocodingResult.label}`,
        );

        const gisGeo = await payload.create({
          collection: "gis-data",
          data: {
            provider: "ign_geocoding",
            layerName: "BAN / Géoplateforme Geocoding",
            commune: geocodingResult.city || project.commune,
            codeInsee: geocodingResult.citycode || project.codeInsee,
            rawResponse: geocodingResult as unknown as Record<string, unknown>,
            retrievedAt: new Date().toISOString(),
          },
        });
        gisRecordIds.push(gisGeo.id);
      } else {
        logStep(
          "geocoding",
          "warning",
          geoStart,
          geocodingResult.error || "Address not found",
        );
        if (geocodingResult.error) {
          errors.push({ step: "geocoding", error: geocodingResult.error });
        }
      }
    } else {
      logStep("geocoding", "skipped", geoStart, "No address query provided");
    }

    // 3. Parcel retrieval (existing Parcel ID or IGN Cadastre lookup)
    const cadStart = Date.now();
    let parcelDoc = input.parcelId
      ? await payload.findByID({ collection: "parcels", id: input.parcelId })
      : null;

    if (
      !parcelDoc &&
      (targetPoint ||
        input.idu ||
        (input.codeInsee && input.section && input.numero))
    ) {
      const cadastre = await fetchIgnCadastreParcel({
        point: targetPoint,
        idu: input.idu,
        codeInsee: input.codeInsee || project.codeInsee,
        section: input.section,
        numero: input.numero,
      });

      if (cadastre.status === "ok" && cadastre.idu) {
        const existing = await payload.find({
          collection: "parcels",
          where: { idu: { equals: cadastre.idu } },
          limit: 1,
        });

        if (existing.docs.length > 0) {
          parcelDoc = existing.docs[0];
        } else {
          parcelDoc = await payload.create({
            collection: "parcels",
            data: {
              idu: cadastre.idu,
              codeInsee: cadastre.codeInsee || project.codeInsee,
              commune: cadastre.commune || project.commune,
              section: cadastre.section || "00",
              numero: cadastre.numero || "0000",
              prefixe: cadastre.prefixe || "000",
              surfaceM2: cadastre.surfaceM2,
              address: geocodingResult?.label || input.address,
              centroid: cadastre.centroid,
              geometry: cadastre.geometry as unknown as Record<string, unknown>,
              rawCadastre: cadastre.raw as Record<string, unknown>,
              source: "IGN API Carto Cadastre",
            },
          });
        }

        const gisCad = await payload.create({
          collection: "gis-data",
          data: {
            provider: "ign_apicarto_cadastre",
            layerName: "Cadastre Parcelle",
            parcel: parcelDoc.id,
            commune: parcelDoc.commune || project.commune,
            codeInsee: parcelDoc.codeInsee,
            rawResponse: (cadastre.raw || {}) as Record<string, unknown>,
            retrievedAt: new Date().toISOString(),
          },
        });
        gisRecordIds.push(gisCad.id);

        logStep(
          "cadastre",
          "ok",
          cadStart,
          `Parcel ${cadastre.idu} (${cadastre.surfaceM2 ?? "?"} m²)`,
        );
      } else {
        logStep(
          "cadastre",
          "warning",
          cadStart,
          cadastre.error || "Parcel not found in IGN Cadastre",
        );
        if (cadastre.error)
          errors.push({ step: "cadastre", error: cadastre.error });
      }
    } else if (parcelDoc) {
      logStep(
        "cadastre",
        "ok",
        cadStart,
        `Using existing parcel ${parcelDoc.idu}`,
      );
    } else {
      logStep(
        "cadastre",
        "skipped",
        cadStart,
        "Insufficient parcel parameters",
      );
    }

    // Determine point/geometry for GIS queries
    const parcelCentroid =
      parcelDoc?.centroid?.lng && parcelDoc?.centroid?.lat
        ? { lng: parcelDoc.centroid.lng, lat: parcelDoc.centroid.lat }
        : targetPoint;
    const parcelGeometry = parcelDoc?.geometry as GeoJSONGeometry | undefined;

    // 4. IGN API Carto GPU Zoning & Prescriptions
    const gpuGisStart = Date.now();
    let apicartoResult = null;
    if (parcelGeometry || parcelCentroid) {
      apicartoResult = await fetchIgnApicartoGpu(
        parcelGeometry || parcelCentroid!,
      );
      if (apicartoResult.status === "ok") {
        const gisGpu = await payload.create({
          collection: "gis-data",
          data: {
            provider: "ign_apicarto_gpu",
            layerName: "IGN API Carto GPU (zone-urba + prescriptions)",
            parcel: parcelDoc?.id,
            commune: parcelDoc?.commune || project.commune,
            codeInsee: parcelDoc?.codeInsee || project.codeInsee,
            zoneCode: apicartoResult.zoneCode,
            zoneType: apicartoResult.zoneType,
            prescriptions: apicartoResult.prescriptions as unknown as Record<
              string,
              unknown
            >,
            rawResponse: (apicartoResult.raw || {}) as Record<string, unknown>,
            retrievedAt: new Date().toISOString(),
          },
        });
        gisRecordIds.push(gisGpu.id);
        logStep(
          "apicarto_gpu",
          "ok",
          gpuGisStart,
          `Zone ${apicartoResult.zoneCode || "unknown"} retrieved`,
        );
      } else {
        logStep(
          "apicarto_gpu",
          "warning",
          gpuGisStart,
          apicartoResult.error || "No GPU zoning found",
        );
        if (apicartoResult.error)
          errors.push({ step: "apicarto_gpu", error: apicartoResult.error });
      }
    } else {
      logStep(
        "apicarto_gpu",
        "skipped",
        gpuGisStart,
        "No geometry or coordinates available",
      );
    }

    // 5. Métropole Aix-Marseille-Provence ArcGIS Zoning
    const ampStart = Date.now();
    let arcgisResult = null;
    if (parcelCentroid) {
      arcgisResult = await fetchMetropoleArcgisZoning(parcelCentroid);
      if (arcgisResult.status === "ok") {
        const gisAmp = await payload.create({
          collection: "gis-data",
          data: {
            provider: "amp_arcgis",
            layerName: "Métropole AMP ArcGIS PLUi",
            parcel: parcelDoc?.id,
            commune: parcelDoc?.commune || project.commune,
            codeInsee: parcelDoc?.codeInsee || project.codeInsee,
            zoneCode: arcgisResult.zoneCode,
            rawResponse: (arcgisResult.raw || {}) as Record<string, unknown>,
            retrievedAt: new Date().toISOString(),
          },
        });
        gisRecordIds.push(gisAmp.id);
        logStep(
          "metropole_arcgis",
          "ok",
          ampStart,
          `AMP ArcGIS zone: ${arcgisResult.zoneCode || "found"}`,
        );
      } else {
        logStep(
          "metropole_arcgis",
          "warning",
          ampStart,
          arcgisResult.error || `AMP ArcGIS: ${arcgisResult.status}`,
        );
      }
    } else {
      logStep(
        "metropole_arcgis",
        "skipped",
        ampStart,
        "No coordinates for ArcGIS spatial query",
      );
    }

    const resolvedZoneCode =
      apicartoResult?.zoneCode || arcgisResult?.zoneCode || undefined;
    const resolvedZoneLabel =
      apicartoResult?.zoneLabel || arcgisResult?.zoneLabel || undefined;
    const resolvedCodeInsee =
      parcelDoc?.codeInsee || input.codeInsee || project.codeInsee;

    // 6. GPU Document Metadata Retrieval
    const gpuDocsStart = Date.now();
    const gpuDocs = await fetchGpuDocuments(
      resolvedCodeInsee,
      apicartoResult?.partition,
    );
    if (gpuDocs.status === "ok") {
      logStep(
        "gpu_documents",
        "ok",
        gpuDocsStart,
        `Found ${gpuDocs.documents.length} GPU document(s)`,
      );
    } else {
      logStep(
        "gpu_documents",
        "warning",
        gpuDocsStart,
        gpuDocs.error || `GPU documents: ${gpuDocs.status}`,
      );
    }

    // Load workspace settings (default AI model + PDF-to-AI context budgets)
    let globalDefaultModel: string | undefined;
    let maxPdfCharsToAi = 90000;
    let maxPdfArticlesToAi = 40;
    try {
      const workspaceSettings = await payload.findGlobal({
        slug: "workspace-settings",
        depth: 1,
      });
      const rel = workspaceSettings?.defaultAiModel;
      if (
        rel &&
        typeof rel === "object" &&
        "model" in rel &&
        typeof rel.model === "string"
      ) {
        globalDefaultModel = rel.model;
      }
      if (
        typeof workspaceSettings?.maxPdfCharsToAi === "number" &&
        workspaceSettings.maxPdfCharsToAi >= 5000
      ) {
        maxPdfCharsToAi = workspaceSettings.maxPdfCharsToAi;
      }
      if (
        typeof workspaceSettings?.maxPdfArticlesToAi === "number" &&
        workspaceSettings.maxPdfArticlesToAi >= 5
      ) {
        maxPdfArticlesToAi = workspaceSettings.maxPdfArticlesToAi;
      }
    } catch {
      // Ignore if workspace-settings global is not yet initialized
    }

    // 7. Load Stored Documents & Regulations from Payload CMS
    const regStart = Date.now();
    const matchingDocs = await payload.find({
      collection: "documents",
      where: {
        or: [
          { project: { equals: project.id } },
          { codeInsee: { equals: resolvedCodeInsee } },
          ...(resolvedZoneCode
            ? [
                {
                  and: [
                    { codeInsee: { equals: resolvedCodeInsee } },
                    { zoneCode: { equals: resolvedZoneCode } },
                  ],
                },
              ]
            : []),
        ],
      },
      limit: 20,
    });

    const matchingRegs = await payload.find({
      collection: "regulations",
      where: resolvedZoneCode
        ? {
            and: [
              { zoneCode: { equals: resolvedZoneCode } },
              {
                or: [
                  { codeInsee: { equals: resolvedCodeInsee } },
                  { codeInsee: { exists: false } },
                ],
              },
            ],
          }
        : { codeInsee: { equals: resolvedCodeInsee } },
      limit: 50,
    });

    const extractedArticles: ExtractedArticle[] = [];
    for (const reg of matchingRegs.docs) {
      extractedArticles.push({
        articleNumber: reg.articleNumber,
        title: reg.title,
        content: reg.rawText,
      });
    }
    for (const doc of matchingDocs.docs) {
      if (doc.extractedText && doc.extractedText.trim().length > 0) {
        const cleanedText = PdfExtractor.cleanAndCondenseText(
          doc.extractedText,
        );
        const parsed = PdfExtractor.parseArticles(cleanedText);

        if (cleanedText !== doc.extractedText) {
          await payload
            .update({
              collection: "documents",
              id: doc.id,
              data: {
                extractedText: cleanedText,
              },
            })
            .catch(() => {});
        }

        extractedArticles.push(
          ...selectArticlesForZone(cleanedText, parsed, resolvedZoneCode, {
            maxArticles: maxPdfArticlesToAi,
            prompt: effectivePrompt,
          }),
        );
      }
    }
    logStep(
      "regulations_lookup",
      extractedArticles.length > 0 ? "ok" : "warning",
      regStart,
      `Loaded ${matchingRegs.docs.length} regulation(s) and ${matchingDocs.docs.length} document(s)`,
    );

    // 7b. Auto-discover, download, extract & persist official GPU regulation PDF when not yet stored in `documents`
    const primaryZone = apicartoResult?.zones?.[0];
    const fallbackGpuDoc = gpuDocs.documents.find((d) =>
      d.files?.some((f) => /\.pdf$/i.test(f.name)),
    );
    const fallbackPdfFile =
      fallbackGpuDoc?.files?.find(
        (f) => /reglement/i.test(f.name) && /\.pdf$/i.test(f.name),
      ) || fallbackGpuDoc?.files?.find((f) => /\.pdf$/i.test(f.name));

    const targetGpuDocId = primaryZone?.gpu_doc_id || fallbackGpuDoc?.id;
    const targetNomfic = primaryZone?.nomfic || fallbackPdfFile?.name;
    const targetUrlfic = primaryZone?.urlfic || fallbackPdfFile?.url;
    const targetPartition = primaryZone?.partition || fallbackGpuDoc?.partition;

    const alreadyStoredInDocs = matchingDocs.docs.some(
      (d) =>
        (targetGpuDocId && d.gpuDocumentId === targetGpuDocId) ||
        (targetUrlfic && d.sourceUrl === targetUrlfic),
    );

    if (
      !alreadyStoredInDocs &&
      (targetUrlfic || (targetGpuDocId && targetNomfic))
    ) {
      const pdfStart = Date.now();
      const gpuPdf = await fetchGpuRegulationPdfText({
        gpuDocId: targetGpuDocId,
        nomfic: targetNomfic,
        urlfic: targetUrlfic,
        partition: targetPartition,
        zoneCode: resolvedZoneCode,
        commune: parcelDoc?.commune || project.commune,
        codeInsee: resolvedCodeInsee,
        projectId: project.id,
        payload,
      });
      if (gpuPdf.articles.length > 0) {
        const seenArticles = new Set(
          extractedArticles.map(
            (a) => `${a.articleNumber}::${a.content.slice(0, 80)}`,
          ),
        );
        for (const art of gpuPdf.articles) {
          const key = `${art.articleNumber}::${art.content.slice(0, 80)}`;
          if (!seenArticles.has(key)) {
            seenArticles.add(key);
            extractedArticles.push(art);
          }
        }
        const mapSummary = gpuPdf.contentMap
          ? ` [mapped: ${gpuPdf.contentMap.metadata.pageCount} pages, ${gpuPdf.contentMap.sections.length} sections, ${gpuPdf.contentMap.articles.length} articles, ${gpuPdf.contentMap.topics.length} topics]`
          : "";
        logStep(
          "gpu_pdf_extraction",
          "ok",
          pdfStart,
          `Extracted ${gpuPdf.articles.length} article(s) from official GPU PDF (${targetNomfic || gpuPdf.url})${mapSummary}`,
        );
      } else {
        logStep(
          "gpu_pdf_extraction",
          "warning",
          pdfStart,
          gpuPdf.error || "Could not extract articles from GPU PDF",
        );
      }
    }

    // 8. Ollama Regulatory Interpretation
    const aiStart = Date.now();
    const baseRules = mergeRules(matchingRegs.docs);
    const activeModelsResult = await payload.find({
      collection: "ai-models",
      where: { isActive: { equals: true } },
      sort: "-isDefault,createdAt",
      limit: 20,
    });
    const activeModelSlugs = activeModelsResult.docs.map((m) => m.model);
    const defaultActiveModel =
      globalDefaultModel ||
      activeModelsResult.docs.find((m) => m.isDefault)?.model ||
      activeModelSlugs[0];
    const resolvedModel =
      input.aiModel?.trim() ||
      defaultActiveModel ||
      process.env.OLLAMA_MODEL ||
      DEFAULT_OLLAMA_MODEL;
    const fallbackModels = activeModelSlugs.filter((m) => m !== resolvedModel);

    console.log(
      `[PLU Pipeline] [${executionCode}] Invoking Ollama AI Pipeline: model=${resolvedModel} fallbacks=${fallbackModels.length} articles=${extractedArticles.length} zone=${resolvedZoneCode || "unknown"} surfaceM2=${parcelDoc?.surfaceM2 ?? "null"}`,
    );

    const extractLabel = (item: unknown): string | undefined => {
      if (!item || typeof item !== "object") return undefined;
      const obj = item as Record<string, unknown>;
      const props =
        obj.properties && typeof obj.properties === "object"
          ? (obj.properties as Record<string, unknown>)
          : obj;
      const label =
        props.libelle ||
        props.lib_id ||
        props.typepsc ||
        props.typeinf ||
        props.txt;
      return typeof label === "string" && label.trim()
        ? label.trim()
        : undefined;
    };

    const gisContextParts: string[] = [];
    const prescGroups = apicartoResult?.prescriptions;
    if (prescGroups) {
      const prescItems = [
        ...prescGroups.surf,
        ...prescGroups.lin,
        ...prescGroups.pct,
      ]
        .map(extractLabel)
        .filter((v): v is string => Boolean(v));
      if (prescItems.length > 0) {
        gisContextParts.push(
          `Prescriptions graphiques: ${Array.from(new Set(prescItems)).slice(0, 10).join("; ")}`,
        );
      }
      const infoItems = prescGroups.infoSurf
        .map(extractLabel)
        .filter((v): v is string => Boolean(v));
      if (infoItems.length > 0) {
        gisContextParts.push(
          `Informations (DPU, RLPi, périmètres): ${Array.from(new Set(infoItems)).slice(0, 10).join("; ")}`,
        );
      }
    }
    if (arcgisResult?.zoneLabel) {
      gisContextParts.push(`Zonage ArcGIS: ${arcgisResult.zoneLabel}`);
    }

    const interpretation = await interpretRegulationsWithOllama({
      prompt: effectivePrompt,
      model: resolvedModel,
      fallbackModels,
      parcelSurfaceM2: parcelDoc?.surfaceM2 ?? null,
      zoneCode: resolvedZoneCode,
      commune: parcelDoc?.commune || project.commune,
      articles: extractedArticles,
      existingRules: baseRules,
      gisContext: gisContextParts.join(" | ") || undefined,
      maxContextChars: maxPdfCharsToAi,
      maxArticles: maxPdfArticlesToAi,
    });
    console.log(
      `[PLU Pipeline] [${executionCode}] Ollama AI Pipeline finished: status=${interpretation.status} model=${interpretation.model} citations=${interpretation.citations.length} warnings=${interpretation.warnings.length}`,
    );
    if (interpretation.warnings.length > 0) {
      console.warn(
        `[PLU Pipeline] [${executionCode}] Ollama AI Pipeline warnings:`,
        interpretation.warnings,
      );
    }
    logStep(
      "ollama_interpretation",
      interpretation.status === "ok" ? "ok" : "warning",
      aiStart,
      interpretation.summary,
    );

    // 9. Regulatory Validation
    const valStart = Date.now();
    const validationReport = validateRegulatoryRules({
      rules: interpretation.rules,
      hasOfficialZoning: Boolean(resolvedZoneCode),
      hasOfficialRegulations: extractedArticles.length > 0,
    });
    logStep(
      "regulatory_validation",
      validationReport.status === "invalid" ? "error" : "ok",
      valStart,
      `Validation: ${validationReport.status} (${validationReport.completenessScore}% complete)`,
    );

    // 10. Constructibility & Archicad Export
    const calcStart = Date.now();
    const constructibility = calculateConstructibility({
      parcelSurfaceM2: parcelDoc?.surfaceM2 ?? null,
      rules: interpretation.rules,
    });
    const archicadExport = buildArchicadExport({
      project: {
        id: project.id,
        name: project.name,
        commune: project.commune,
        codeInsee: resolvedCodeInsee,
      },
      parcel: {
        idu: parcelDoc?.idu,
        surfaceM2: parcelDoc?.surfaceM2,
        centroid: parcelCentroid,
        geometry: parcelGeometry,
      },
      zoning: {
        zoneCode: resolvedZoneCode,
        zoneLabel: resolvedZoneLabel,
        zoneType: apicartoResult?.zoneType,
      },
      rules: interpretation.rules,
      constructibility,
    });
    logStep(
      "constructibility_archicad",
      "ok",
      calcStart,
      `Constructibility status: ${constructibility.status}`,
    );

    // 11. Create or update Analyses container (never overwrite snapshots!)
    let analysisDoc = input.analysisId
      ? await payload.findByID({ collection: "analyses", id: input.analysisId })
      : null;

    const nextVersion = analysisDoc ? (analysisDoc.currentVersion || 0) + 1 : 1;
    if (!analysisDoc) {
      analysisDoc = await payload.create({
        collection: "analyses",
        data: {
          title: `${project.name} — ${parcelDoc?.idu || input.address || "Étude PLU"}`,
          project: project.id,
          parcel: parcelDoc?.id,
          status: errors.length > 0 ? "partial" : "completed",
          currentVersion: 1,
          createdBy: Number(userId),
        },
      });
    }

    // 12. Create Immutable AnalysisSnapshot
    const snapshot = await payload.create({
      collection: "analysis-snapshots",
      data: {
        snapshotLabel: `v${nextVersion} — ${resolvedZoneCode || "Sans zonage"} (${new Date().toLocaleDateString("fr-FR")})`,
        analysis: analysisDoc.id,
        project: project.id,
        parcel: parcelDoc?.id,
        version: nextVersion,
        replayedFrom: input.replayedFromSnapshotId
          ? Number(input.replayedFromSnapshotId)
          : undefined,
        originalPrompt: effectivePrompt,
        submittedPayload: input as unknown as Record<string, unknown>,
        addressQuery: input.address,
        cadastralReferences: {
          idu: parcelDoc?.idu || input.idu,
          codeInsee: resolvedCodeInsee,
          section: parcelDoc?.section || input.section,
          numero: parcelDoc?.numero || input.numero,
          surfaceM2: parcelDoc?.surfaceM2,
          commune: parcelDoc?.commune || project.commune,
        },
        geocodingResult: geocodingResult as unknown as Record<string, unknown>,
        zoneCode: resolvedZoneCode,
        zoningAndGis: {
          apicarto: apicartoResult,
          ampArcgis: arcgisResult,
          gpuDocuments: gpuDocs,
        } as unknown as Record<string, unknown>,
        gisRecords: gisRecordIds.map((id) => Number(id)),
        documents: matchingDocs.docs.map((d) => d.id),
        extractedArticles: extractedArticles as unknown as Record<
          string,
          unknown
        >[],
        regulations: matchingRegs.docs.map((r) => r.id),
        regulatoryInterpretation: interpretation as unknown as Record<
          string,
          unknown
        >,
        validationStatus: validationReport.status,
        validationReport: validationReport as unknown as Record<
          string,
          unknown
        >,
        constructibilityCalculations: constructibility as unknown as Record<
          string,
          unknown
        >,
        archicadExport: archicadExport as unknown as Record<string, unknown>,
        aiResponses: {
          model: interpretation.model,
          status: interpretation.status,
          rawResponse: interpretation.rawResponse,
        },
        execution: execution.id,
        executionLogs: steps as unknown as Record<string, unknown>[],
        executionErrors: errors as unknown as Record<string, unknown>[],
        createdBy: Number(userId),
      },
    });

    // 13. Create Immutable PromptHistory Entry
    const promptHistory = await payload.create({
      collection: "prompt-history",
      data: {
        promptPreview: effectivePrompt.slice(0, 120),
        promptText: effectivePrompt,
        submittedPayload: input as unknown as Record<string, unknown>,
        version: nextVersion,
        isReplay: Boolean(input.replayedFromSnapshotId),
        project: project.id,
        analysis: analysisDoc.id,
        snapshot: snapshot.id,
        execution: execution.id,
        createdBy: Number(userId),
      },
    });

    // 14. Update Analysis pointer & Execution final status
    const finalStatus = errors.length > 0 ? "partial" : "completed";
    await payload.update({
      collection: "analyses",
      id: analysisDoc.id,
      data: {
        parcel: parcelDoc?.id,
        currentVersion: nextVersion,
        latestSnapshot: snapshot.id,
        status: finalStatus,
      },
    });

    const completedAt = new Date();
    const totalDurationMs = completedAt.getTime() - startedAt.getTime();
    console.log(
      `[PLU Pipeline] [${executionCode}] Completed with status=${finalStatus} snapshotId=${snapshot.id} executionId=${execution.id} durationMs=${totalDurationMs}`,
    );
    await payload.update({
      collection: "executions",
      id: execution.id,
      data: {
        status: finalStatus,
        analysis: analysisDoc.id,
        completedAt: completedAt.toISOString(),
        durationMs: totalDurationMs,
        steps: steps as unknown as Record<string, unknown>[],
        logs: steps as unknown as Record<string, unknown>[],
        errors: errors as unknown as Record<string, unknown>[],
      },
    });

    return {
      analysis: analysisDoc,
      snapshot,
      promptHistory,
      executionId: execution.id,
    };
  } catch (err) {
    const completedAt = new Date();
    const message =
      err instanceof Error ? err.message : "Unexpected pipeline failure";
    console.error(`[PLU Pipeline] [${executionCode}] FAILED:`, message);
    errors.push({ step: "pipeline", error: message });

    await payload.update({
      collection: "executions",
      id: execution.id,
      data: {
        status: "failed",
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        steps: steps as unknown as Record<string, unknown>[],
        errors: errors as unknown as Record<string, unknown>[],
      },
    });
    throw err;
  }
}

export async function replaySnapshotPipeline(
  payload: Payload,
  snapshotId: number | string,
  userId: number | string,
  overridePrompt?: string,
) {
  const source = await payload.findByID({
    collection: "analysis-snapshots",
    id: snapshotId,
    depth: 0,
  });

  const submitted = (source.submittedPayload ||
    {}) as Partial<RunAnalysisInput>;
  const projectId =
    typeof source.project === "object"
      ? (source.project as { id: number }).id
      : source.project;
  const analysisId =
    typeof source.analysis === "object"
      ? (source.analysis as { id: number }).id
      : source.analysis;
  const parcelId =
    typeof source.parcel === "object" && source.parcel
      ? (source.parcel as { id: number }).id
      : (source.parcel as number | undefined);

  return runPluAnalysisPipeline(
    payload,
    {
      projectId,
      analysisId,
      parcelId,
      prompt: overridePrompt?.trim() || source.originalPrompt,
      aiModel: submitted.aiModel,
      address: submitted.address || source.addressQuery || undefined,
      idu: submitted.idu,
      codeInsee: submitted.codeInsee,
      section: submitted.section,
      numero: submitted.numero,
      replayedFromSnapshotId: source.id,
    },
    userId,
  );
}

export function compareAnalysisSnapshots(
  snapshotA: Record<string, unknown>,
  snapshotB: Record<string, unknown>,
) {
  const calcA = (snapshotA.constructibilityCalculations || {}) as Record<
    string,
    unknown
  >;
  const calcB = (snapshotB.constructibilityCalculations || {}) as Record<
    string,
    unknown
  >;
  const interpA = (snapshotA.regulatoryInterpretation || {}) as Record<
    string,
    unknown
  >;
  const interpB = (snapshotB.regulatoryInterpretation || {}) as Record<
    string,
    unknown
  >;

  const metricKeys = [
    "parcelSurfaceM2",
    "maxFootprintM2",
    "estimatedBuildableFootprintM2",
    "maxHeightM",
    "estimatedStoreys",
    "maxFloorAreaSdpM2",
    "maxVolumeM3",
    "minGreenSpaceM2",
  ];

  const constructibilityDiff = metricKeys.map((key) => {
    const a = calcA[key] ?? null;
    const b = calcB[key] ?? null;
    return {
      metric: key,
      snapshotA: a,
      snapshotB: b,
      changed: a !== b,
      delta:
        typeof a === "number" && typeof b === "number"
          ? Number((b - a).toFixed(2))
          : null,
    };
  });

  return {
    snapshotA: {
      id: snapshotA.id,
      version: snapshotA.version,
      label: snapshotA.snapshotLabel,
      zoneCode: snapshotA.zoneCode,
      validationStatus: snapshotA.validationStatus,
      prompt: snapshotA.originalPrompt,
      createdAt: snapshotA.createdAt,
    },
    snapshotB: {
      id: snapshotB.id,
      version: snapshotB.version,
      label: snapshotB.snapshotLabel,
      zoneCode: snapshotB.zoneCode,
      validationStatus: snapshotB.validationStatus,
      prompt: snapshotB.originalPrompt,
      createdAt: snapshotB.createdAt,
    },
    promptChanged: snapshotA.originalPrompt !== snapshotB.originalPrompt,
    zoneChanged: snapshotA.zoneCode !== snapshotB.zoneCode,
    constructibilityDiff,
    rulesA: interpA.rules || null,
    rulesB: interpB.rules || null,
  };
}
