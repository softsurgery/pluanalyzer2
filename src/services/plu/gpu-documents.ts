import axios from 'axios'
import { fetchJsonWithTimeout } from '@/services/plu/http'
import { extractPdfTextAndArticles, parsePluArticles } from '@/services/plu/pdf-extractor'
import type { ExtractedArticle, GPUDocumentInfo, GPUDocumentsResult } from '@/services/plu/types'

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

  if (!res.ok) {
    // Fallback to municipality documents endpoint
    const fallbackUrl = `${baseUrl}/municipality/${encodeURIComponent(cleanInsee)}/documents`
    const fallbackRes = await fetchJsonWithTimeout<GpuApiDocument[]>(fallbackUrl, {
      timeoutMs: 12000,
    })

    if (!fallbackRes.ok) {
      return {
        status: 'error',
        communeInsee: cleanInsee,
        documents: [],
        error: fallbackRes.error || res.error || 'GPU API request failed',
      }
    }

    const docs = mapGpuDocs(fallbackRes.data || [])
    return {
      status: docs.length > 0 ? 'ok' : 'not_found',
      communeInsee: cleanInsee,
      documents: docs,
      raw: fallbackRes.data,
    }
  }

  const docs = mapGpuDocs(Array.isArray(res.data) ? res.data : [])
  if (docs.length === 0 && partition) {
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

const MAX_GPU_PDF_BYTES = 100 * 1024 * 1024

export async function fetchGpuRegulationPdfText(params: {
  gpuDocId?: string
  nomfic?: string
  urlfic?: string
  partition?: string
  zoneCode?: string
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
  let pdfBuffer: Buffer | null = null
  let lastError = 'Failed to fetch GPU regulation PDF'

  for (const candidateUrl of candidateUrls) {
    pdfUrl = candidateUrl
    try {
      console.log(`[GPU PDF] Fetching regulation PDF: ${candidateUrl}`)
      const response = await axios.get<ArrayBuffer>(candidateUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: { Accept: 'application/pdf,*/*' },
        validateStatus: () => true,
      })
      if (response.status < 200 || response.status >= 300) {
        lastError = `HTTP ${response.status} fetching GPU PDF`
        console.warn(`[GPU PDF] ${candidateUrl} failed: ${lastError}`)
        continue
      }

      const buf = Buffer.isBuffer(response.data)
        ? response.data
        : Buffer.from(response.data)
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

  if (!pdfBuffer) {
    return { url: pdfUrl, articles: [], error: lastError }
  }

  try {
    const extraction = await extractPdfTextAndArticles(pdfBuffer)
    if (extraction.articles.length === 0 && !extraction.text) {
      return { url: pdfUrl, articles: [], error: extraction.error || 'No text extracted from GPU PDF' }
    }

    if (params.zoneCode) {
      const zonePattern = escapeRegExp(params.zoneCode)
      const zoneRegex = new RegExp(`\\b${zonePattern}\\b`, 'i')
      const headerZoneRegex = new RegExp(`\\b${zonePattern}\\b`, 'i')
      const regKeywords = /(?:hauteur|emprise|recul|alignement|stationnement|pleine\s+terre|fa[îi]tage|m[èe]tres?|\d+\s*%)/i

      const scored = extraction.articles
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
      const headingMatches = [...extraction.text.matchAll(zoneHeadingRegex)]
      const bodyMatch =
        headingMatches.find((m) => {
          const idx = m.index ?? 0
          const preview = extraction.text.slice(idx, idx + 1500)
          return regKeywords.test(preview)
        }) || headingMatches[Math.min(1, Math.max(0, headingMatches.length - 1))]

      const sectionArticles: ExtractedArticle[] = []
      if (bodyMatch && typeof bodyMatch.index === 'number') {
        const slice = extraction.text.slice(bodyMatch.index, bodyMatch.index + 18000)
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

    return { url: pdfUrl, articles: extraction.articles.slice(0, 15) }
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
