import fs from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { canExecuteAnalysis, getPayloadWithUser } from '@/lib/payload-auth'
import { extractPdfTextAndArticles } from '@/services/plu/pdf-extractor'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { payload, user } = await getPayloadWithUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    if (!canExecuteAnalysis(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await context.params
    const doc = await payload.findByID({
      collection: 'documents',
      id,
      depth: 1,
    })

    const media = doc.media && typeof doc.media === 'object' ? doc.media : null
    if (!media?.filename) {
      return NextResponse.json({ error: 'Document has no linked media file' }, { status: 400 })
    }

    let buffer: Buffer
    if (media.url && /^https?:\/\//i.test(media.url)) {
      const res = await fetch(media.url)
      if (!res.ok) {
        return NextResponse.json({ error: `Failed to fetch media file: HTTP ${res.status}` }, { status: 502 })
      }
      buffer = Buffer.from(await res.arrayBuffer())
    } else {
      const filePath = path.resolve(process.cwd(), 'uploads/media', media.filename)
      buffer = await fs.readFile(filePath)
    }
    const extraction = await extractPdfTextAndArticles(buffer)

    const updated = await payload.update({
      collection: 'documents',
      id,
      data: {
        pageCount: extraction.pageCount,
        extractionStatus: extraction.status,
        extractedText: extraction.text,
        extractionMetadata: {
          charCount: extraction.charCount,
          articleCount: extraction.articles.length,
          ocrAttempted: extraction.ocrAttempted,
          error: extraction.error,
        },
      },
    })

    return NextResponse.json({
      document: updated,
      articles: extraction.articles,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
