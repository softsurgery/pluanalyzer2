import type { Payload } from 'payload'
import { fetchJsonWithTimeout } from '@/services/plu/http'
import { extractPdfTextAndArticles, parsePluArticles } from '@/services/plu/pdf-extractor'
import type { ExtractedArticle, GPUDocumentInfo, GPUDocumentsResult } from '@/services/plu/types'

const MAX_GPU_PDF_BYTES = 100 * 1024 * 1024
const GPU_PDF_FETCH_TIMEOUT_MS = 120000
const MAX_CACHED_GPU_PDFS = 10

// In-memory cache of extracted text & articles keyed by PDF URL to avoid re-downloading large (50+ MB) PLUi PDFs
const gpuPdfExtractionCache = new Map<
  string,
  { url: string; text: string; articles: ExtractedArticle[] }
>()

interface GpuApiDocument {
  id?: string
  name?: string
  type?: string
  status?: string
  partition?: string
  archiveUrl?: string
  files?: Array<{ name?: string; url?: string }>
}

/**
 * Retrieve official PLU/PLUi document metadata from Géoportail de l'Urbanisme (GPU).
 */
export async function fetchGpuDocuments(
  codeInsee: string,
  partition?: string,
): Promise<GPUDocumentsResult> {
  const baseUrl =
    process.env.GPU_API_BASE_URL || 'https://www.geoportail-urbanisme.gouv.fr/api'

  const cleanInsee = codeInsee.trim()
  if (!cleanInsee) {
    return { status: 'error', documents: [], error: 'Missing codeInsee' }
  }

  const url = partition
    ? `${baseUrl}/document?partition=${encodeURIComponent(partition)}`
    : `${baseUrl}/document?grid=${encodeURIComponent(cleanInsee)}`

  const res = await fetchJsonWithTimeout<GpuApiDocument[]>(url, { timeoutMs: 12000 })
  const docs = res.ok && Array.isArray(res.data) ? mapGpuDocs(res.data) : []

  // If partition lookup failed or returned no documents, fall back to the commune INSEE grid endpoint
  if (partition && (!res.ok || docs.length === 0)) {
    const gridUrl = `${baseUrl}/document?grid=${encodeURIComponent(cleanInsee)}`
    const gridRes = await fetchJsonWithTimeout<GpuApiDocument[]>(gridUrl, { timeoutMs: 12000 })
    if (gridRes.ok && Array.isArray(gridRes.data)) {
      const gridDocs = mapGpuDocs(gridRes.data)
      return {
        status: gridDocs.length > 0 ? 'ok' : 'not_found',
        communeInsee: cleanInsee,
        documents: gridDocs,
        raw: gridRes.data,
      }
    }
    return {
      status: 'error',
      communeInsee: cleanInsee,
      documents: [],
      error: gridRes.error || res.error || 'GPU API request failed',
    }
  }

  if (!res.ok) {
    return {
      status: 'error',
      communeInsee: cleanInsee,
      documents: [],
      error: res.error || 'GPU API request failed',
    }
  }

  return {
    status: docs.length > 0 ? 'ok' : 'not_found',
    communeInsee: cleanInsee,
    documents: docs,
    raw: res.data,
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function fetchGpuRegulationPdfText(params: {
  gpuDocId?: string
  nomfic?: string
  urlfic?: string
  partition?: string
  zoneCode?: string
  commune?: string
  codeInsee?: string
  payload?: Payload
}): Promise<{ url?: string; articles: ExtractedArticle[]; error?: string }> {
  const baseUrl =
    process.env.GPU_API_BASE_URL || 'https://www.geoportail-urbanisme.gouv.fr/api'

  const geopfDirectUrl =
    params.partition && params.gpuDocId && params.nomfic
      ? `https://data.geopf.fr/annexes/gpu/documents/${encodeURIComponent(params.partition)}/${encodeURIComponent(params.gpuDocId)}/${encodeURIComponent(params.nomfic)}`
      : undefined
  const gpuApiUrl =
    params.gpuDocId && params.nomfic
      ? `${baseUrl}/document/${encodeURIComponent(params.gpuDocId)}/files/${encodeURIComponent(params.nomfic)}`
      : undefined
  const externalUrl =
    params.urlfic && /^https?:\/\//i.test(params.urlfic)
      ? params.urlfic.split('#')[0]
      : undefined

  const candidateUrls = Array.from(
    new Set(
      [geopfDirectUrl, gpuApiUrl, externalUrl].filter((u): u is string =>
        Boolean(u),
      ),
    ),
  )

  if (candidateUrls.length === 0) {
    return { articles: [], error: 'No GPU regulation PDF URL available' }
  }

  let pdfUrl = candidateUrls[0]
  let cachedExtraction: { url: string; text: string; articles: ExtractedArticle[] } | undefined

  for (const candidateUrl of candidateUrls) {
    const hit = gpuPdfExtractionCache.get(candidateUrl)
    if (hit) {
      console.log(`[GPU PDF] Using cached extraction for ${candidateUrl}`)
      cachedExtraction = hit
      pdfUrl = hit.url
      break
    }
  }

  let pdfBuffer: Buffer | null = null
  let lastError = 'Failed to fetch GPU regulation PDF'

  // Check Payload `documents` collection (backed by S3/RustFS) before downloading from GPU
  if (!cachedExtraction && params.payload && params.gpuDocId) {
    try {
      const existingDocs = await params.payload.find({
        collection: 'documents',
        where: { gpuDocumentId: { equals: params.gpuDocId } },
        limit: 1,
        depth: 0,
      })
      const existing = existingDocs.docs[0]
      if (existing?.extractedText) {
        console.log(
          `[GPU PDF] Reusing Payload document #${existing.id} (gpuDocumentId=${params.gpuDocId})`,
        )
        cachedExtraction = {
          url: existing.sourceUrl || pdfUrl,
          text: existing.extractedText,
          articles: parsePluArticles(existing.extractedText),
        }
        pdfUrl = cachedExtraction.url
      }
    } catch (err) {
      console.warn(
        `[GPU PDF] Payload documents lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  if (!cachedExtraction) {
    for (const candidateUrl of candidateUrls) {
      pdfUrl = candidateUrl
      try {
        console.log(`[GPU PDF] Fetching regulation PDF: ${candidateUrl}`)
        const response = await fetch(candidateUrl, {
          method: 'GET',
          headers: { Accept: 'application/pdf,*/*' },
          signal: AbortSignal.timeout(GPU_PDF_FETCH_TIMEOUT_MS),
        })
        if (!response.ok) {
          lastError = `HTTP ${response.status} fetching GPU PDF`
          console.warn(`[GPU PDF] ${candidateUrl} failed: ${lastError}`)
          continue
        }

        const arrayBuf = await response.arrayBuffer()
        const buf = Buffer.from(arrayBuf)
        if (buf.byteLength === 0 || buf.byteLength > MAX_GPU_PDF_BYTES) {
          lastError = `GPU PDF size out of bounds (${buf.byteLength} bytes)`
          console.warn(`[GPU PDF] ${candidateUrl} skipped: ${lastError}`)
          continue
        }

        console.log(
          `[GPU PDF] Downloaded ${(buf.byteLength / (1024 * 1024)).toFixed(1)} MB from ${candidateUrl}`,
        )
        pdfBuffer = buf
        break
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Failed to fetch GPU regulation PDF'
        console.warn(`[GPU PDF] ${candidateUrl} error: ${lastError}`)
      }
    }
  }

  if (!cachedExtraction && !pdfBuffer) {
    return { url: pdfUrl, articles: [], error: lastError }
  }

  try {
    let extractionText: string
    let extractionArticles: ExtractedArticle[]

    if (cachedExtraction) {
      extractionText = cachedExtraction.text
      extractionArticles = cachedExtraction.articles
    } else {
      const extraction = await extractPdfTextAndArticles(pdfBuffer!)
      if (extraction.articles.length === 0 && !extraction.text) {
        return { url: pdfUrl, articles: [], error: extraction.error || 'No text extracted from GPU PDF' }
      }
      extractionText = extraction.text
      extractionArticles = extraction.articles

      if (gpuPdfExtractionCache.size >= MAX_CACHED_GPU_PDFS) {
        const oldestKey = gpuPdfExtractionCache.keys().next().value
        if (oldestKey) gpuPdfExtractionCache.delete(oldestKey)
      }
      gpuPdfExtractionCache.set(pdfUrl, {
        url: pdfUrl,
        text: extractionText,
        articles: extractionArticles,
      })

      // Persist downloaded PDF into `media` (stored in RustFS S3) and link from `documents`
      if (params.payload && pdfBuffer) {
        try {
          const fileName = params.nomfic || `${params.gpuDocId || 'reglement'}.pdf`
          const title = params.commune
            ? `Règlement PLU/PLUi — ${params.commune} (${fileName})`
            : `Règlement PLU/PLUi — ${fileName}`
          const mediaDoc = await params.payload.create({
            collection: 'media',
            file: {
              data: pdfBuffer,
              mimetype: 'application/pdf',
              name: fileName,
              size: pdfBuffer.byteLength,
            },
            data: {
              alt: title,
            },
          })
          const createdDoc = await params.payload.create({
            collection: 'documents',
            data: {
              title,
              media: mediaDoc.id,
              documentType: 'reglement',
              commune: params.commune,
              codeInsee: params.codeInsee,
              gpuDocumentId: params.gpuDocId,
              sourceUrl: pdfUrl,
              pageCount: extraction.pageCount,
              extractionStatus:
                extraction.status === 'ocr_completed' ? 'ocr_completed' : 'extracted',
              extractedText: extractionText,
            },
          })
          console.log(
            `[GPU PDF] Stored media #${mediaDoc.id} & document #${createdDoc.id} in Payload/RustFS (${fileName})`,
          )
        } catch (err) {
          console.warn(
            `[GPU PDF] Failed to persist document in Payload/RustFS: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }
    }

    if (params.zoneCode) {
      const zonePattern = escapeRegExp(params.zoneCode)
      const headerZoneRegex = new RegExp(`\\b${zonePattern}\\b`, 'i')
      const regKeywords = /(?:hauteur|emprise|recul|alignement|stationnement|pleine\s+terre|fa[îi]tage|m[èe]tres?|\d+\s*%)/i

      const scored = extractionArticles
        .map((a) => {
          let score = 0
          if (headerZoneRegex.test(a.articleNumber) || headerZoneRegex.test(a.title)) score += 12
          const contentMatches = a.content.match(new RegExp(`\\b${zonePattern}\\b`, 'gi'))?.length ?? 0
          if (contentMatches > 0) score += Math.min(contentMatches * 3, 12)
          if (a.content.length > 250) score += 2
          if (regKeywords.test(a.content)) score += 4
          return { article: a, score }
        })
        .filter((item) => item.score >= 5)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.article)

      // Also check for a dedicated "ZONE <code>" / "CHAPITRE <code>" or standalone "<code>" body section
      const zoneHeadingRegex = new RegExp(
        `(?:(?:ZONE|CHAPITRE|DISPOSITIONS\\s+APPLICABLES\\s+[ÀA]\\s+LA\\s+ZONE)\\s+${zonePattern}\\b|^\\s*${zonePattern}\\s*$)`,
        'gim',
      )
      const headingMatches = [...extractionText.matchAll(zoneHeadingRegex)]
      const bodyMatch =
        headingMatches.find((m) => {
          const idx = m.index ?? 0
          const preview = extractionText.slice(idx, idx + 1500)
          return regKeywords.test(preview)
        }) || headingMatches[Math.min(1, Math.max(0, headingMatches.length - 1))]

      const sectionArticles: ExtractedArticle[] = []
      if (bodyMatch && typeof bodyMatch.index === 'number') {
        const slice = extractionText.slice(bodyMatch.index, bodyMatch.index + 18000)
        sectionArticles.push(...parsePluArticles(slice))
      }

      const combined = [...sectionArticles, ...scored]
      const deduped: ExtractedArticle[] = []
      const seen = new Set<string>()
      for (const art of combined) {
        const key = `${art.articleNumber}::${art.content.slice(0, 80)}`
        if (!seen.has(key)) {
          seen.add(key)
          deduped.push(art)
        }
      }

      if (deduped.length > 0) {
        return { url: pdfUrl, articles: deduped.slice(0, 20) }
      }
    }

    return { url: pdfUrl, articles: extractionArticles.slice(0, 15) }
  } catch (err) {
    return {
      url: pdfUrl,
      articles: [],
      error: err instanceof Error ? err.message : 'Failed to fetch GPU regulation PDF',
    }
  }
}

function mapGpuDocs(rawDocs: GpuApiDocument[]): GPUDocumentInfo[] {
  return rawDocs.map((doc) => ({
    id: String(doc.id || doc.partition || doc.name || 'unknown'),
    name: doc.name,
    type: doc.type,
    status: doc.status,
    partition: doc.partition,
    archiveUrl: doc.archiveUrl,
    files: (doc.files || [])
      .filter((f): f is { name: string; url: string } => Boolean(f.name && f.url)),
  }))
}
