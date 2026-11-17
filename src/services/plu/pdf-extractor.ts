import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { ExtractedArticle, PDFExtractionResult } from './types'

const execFileAsync = promisify(execFile)

/**
 * Split French PLU regulatory text into structured articles (Article 1 .. Article 14, etc.).
 */
export function parsePluArticles(text: string): ExtractedArticle[] {
  if (!text.trim()) return []

  const articleRegex =
    /(?:^|\n)\s*(ARTICLE\s+[A-Z0-9.\-]+(?:\s*[:\-–]\s*[^\n]+)?)/gi
  const matches = [...text.matchAll(articleRegex)]

  if (matches.length === 0) {
    return [
      {
        articleNumber: 'GENERAL',
        title: 'Extrait réglementaire complet',
        content: text.trim().slice(0, 12000),
      },
    ]
  }

  const articles: ExtractedArticle[] = []
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]
    const next = matches[i + 1]
    const startIdx = current.index ?? 0
    const endIdx = next?.index ?? text.length
    const headerLine = current[1].trim()
    const numMatch = headerLine.match(/ARTICLE\s+([A-Z0-9.\-]+)/i)
    const articleNumber = numMatch ? `Article ${numMatch[1]}` : headerLine.slice(0, 32)
    const content = text.slice(startIdx, endIdx).trim()

    articles.push({
      articleNumber,
      title: headerLine.slice(0, 120),
      content: content.slice(0, 10000),
    })
  }

  return articles
}

/**
 * Extract text from a PDF buffer using pdf-parse, with optional OCR fallback
 * when OCR_ENABLED=true and the PDF appears to be scanned (< 80 chars extracted).
 */
export async function extractPdfTextAndArticles(
  buffer: Buffer,
): Promise<PDFExtractionResult> {
  try {
    const pdfParseModule = await import('pdf-parse')
    const pdfParse = pdfParseModule.default || (pdfParseModule as unknown as (b: Buffer) => Promise<{ numpages: number; text: string }>)
    const parsed = await pdfParse(buffer)
    const rawText = (parsed.text || '').trim()
    const pageCount = parsed.numpages || 1

    if (rawText.length >= 80) {
      return {
        status: 'extracted',
        pageCount,
        charCount: rawText.length,
        text: rawText,
        articles: parsePluArticles(rawText),
        ocrAttempted: false,
      }
    }

    // Check if OCR is configured for scanned PDFs
    if (process.env.OCR_ENABLED === 'true') {
      const ocrCmd = process.env.OCR_COMMAND || 'tesseract'
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plu-ocr-'))
      const pdfPath = path.join(tmpDir, 'input.pdf')
      try {
        await fs.writeFile(pdfPath, buffer)
        const { stdout } = await execFileAsync(ocrCmd, [pdfPath, 'stdout', '-l', 'fra'], {
          timeout: 30000,
        })
        const ocrText = stdout.trim()
        if (ocrText.length > 0) {
          return {
            status: 'ocr_completed',
            pageCount,
            charCount: ocrText.length,
            text: ocrText,
            articles: parsePluArticles(ocrText),
            ocrAttempted: true,
          }
        }
      } catch (ocrErr) {
        return {
          status: 'ocr_required',
          pageCount,
          charCount: rawText.length,
          text: rawText,
          articles: parsePluArticles(rawText),
          ocrAttempted: true,
          error: `OCR failed: ${ocrErr instanceof Error ? ocrErr.message : 'Unknown error'}`,
        }
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      }
    }

    return {
      status: 'ocr_required',
      pageCount,
      charCount: rawText.length,
      text: rawText,
      articles: parsePluArticles(rawText),
      ocrAttempted: false,
      error: 'PDF contains minimal selectable text; OCR is required for scanned document.',
    }
  } catch (err) {
    return {
      status: 'failed',
      pageCount: 0,
      charCount: 0,
      text: '',
      articles: [],
      ocrAttempted: false,
      error: err instanceof Error ? err.message : 'PDF extraction failed',
    }
  }
}
