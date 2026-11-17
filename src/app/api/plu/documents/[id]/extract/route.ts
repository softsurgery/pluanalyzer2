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
    })

    if (!doc.filename) {
      return NextResponse.json({ error: 'Document has no uploaded file' }, { status: 400 })
    }

    const filePath = path.resolve(process.cwd(), 'uploads/documents', doc.filename)
    const buffer = await fs.readFile(filePath)
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
