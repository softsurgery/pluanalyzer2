import {
  getTableAlignments,
  isTableSeparator,
  splitTableRow,
} from '@/components/shared/md-reader/parser'
import type { TableAlignment } from '@/components/shared/md-reader/types'
import {
  PDF_BOTTOM_Y,
  PDF_COLORS,
  PDF_CONTENT_W,
  PDF_FONT_MAP,
  PDF_MARGIN_X,
  PDF_PAGE_H,
  PDF_PAGE_W,
  PDF_TOP_Y,
} from './constants'
import type { PdfFontStyle, PdfInlineSpan } from './types'

/**
 * Abstract PDF 1.4 document builder providing layout primitives, pagination,
 * Markdown/table rendering, and binary PDF serialization.
 * Subclasses implement `renderBody()` (and optionally override footer text)
 * for domain-specific reports.
 */
export abstract class PdfDocumentBuilder {
  protected pages: string[][] = [[]]
  protected y = PDF_TOP_Y

  private get ops(): string[] {
    return this.pages[this.pages.length - 1]
  }

  /** Subclasses implement this to draw the report's header and body content. */
  protected abstract renderBody(): void

  /** Override in subclasses to customize the left footer label. */
  protected getFooterText(): string {
    return 'Document genere automatiquement'
  }

  /** Build and serialize the complete PDF 1.4 document as a Buffer. */
  public build(): Buffer {
    this.pages = [[]]
    this.y = PDF_TOP_Y

    this.renderBody()

    const totalPages = this.pages.length
    const footerText = this.getFooterText()
    const pageStreams = this.pages.map((ops, idx) => {
      const footerOps = [
        `0.6 w ${PDF_COLORS.border} RG ${PDF_MARGIN_X} 42 m ${PDF_MARGIN_X + PDF_CONTENT_W} 42 l S`,
        `BT /F1 8 Tf ${PDF_COLORS.muted} rg ${PDF_MARGIN_X} 28 Td (${this.escapePdfString(footerText)}) Tj ET`,
        `BT /F1 8 Tf ${PDF_COLORS.muted} rg ${PDF_MARGIN_X + PDF_CONTENT_W - 48} 28 Td (${this.escapePdfString(`Page ${idx + 1} / ${totalPages}`)}) Tj ET`,
      ]
      return [...ops, ...footerOps].join('\n')
    })

    return this.serializePdf(pageStreams)
  }

  protected newPage(): void {
    this.pages.push([])
    this.y = PDF_TOP_Y
  }

  protected ensureSpace(height: number): void {
    if (this.y - height < PDF_BOTTOM_Y) {
      this.newPage()
    }
  }

  protected fillRect(
    x: number,
    y: number,
    w: number,
    h: number,
    rgb: string,
  ): void {
    this.ops.push(
      `${rgb} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`,
    )
  }

  protected strokeRect(
    x: number,
    y: number,
    w: number,
    h: number,
    rgb: string,
    lineWidth = 0.6,
  ): void {
    this.ops.push(
      `${lineWidth} w ${rgb} RG ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`,
    )
  }

  protected drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    rgb: string,
    lineWidth = 0.6,
  ): void {
    this.ops.push(
      `${lineWidth} w ${rgb} RG ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`,
    )
  }

  protected drawText(
    x: number,
    y: number,
    text: string,
    size: number,
    style: PdfFontStyle = 'normal',
    rgb: string = PDF_COLORS.text,
  ): void {
    if (!text) return
    this.ops.push(
      `BT ${PDF_FONT_MAP[style]} ${size} Tf ${rgb} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${this.escapePdfString(text)}) Tj ET`,
    )
  }

  protected drawHeaderBanner(title: string, subtitle: string): void {
    const titleLines = this.wrapPlainText(title, PDF_CONTENT_W, 16, 'bold').slice(
      0,
      2,
    )
    const bannerH = titleLines.length > 1 ? 96 : 82
    this.fillRect(0, PDF_PAGE_H - bannerH, PDF_PAGE_W, bannerH, PDF_COLORS.navy)
    this.fillRect(0, PDF_PAGE_H - bannerH - 4, PDF_PAGE_W, 4, PDF_COLORS.blue)

    let titleY = PDF_PAGE_H - 34
    for (const tl of titleLines) {
      this.drawText(PDF_MARGIN_X, titleY, tl, 16, 'bold', PDF_COLORS.white)
      titleY -= 20
    }
    this.drawText(
      PDF_MARGIN_X,
      PDF_PAGE_H - bannerH + 16,
      subtitle,
      8.5,
      'bold',
      PDF_COLORS.bannerSubtitle,
    )

    this.y = PDF_PAGE_H - bannerH - 22
  }

  protected drawSectionTitle(title: string): void {
    this.ensureSpace(28)
    this.y -= 6
    this.fillRect(PDF_MARGIN_X, this.y - 3, 3, 14, PDF_COLORS.blue)
    this.drawText(PDF_MARGIN_X + 9, this.y, title, 12, 'bold', PDF_COLORS.navy)
    this.drawLine(
      PDF_MARGIN_X,
      this.y - 7,
      PDF_MARGIN_X + PDF_CONTENT_W,
      this.y - 7,
      PDF_COLORS.border,
      0.6,
    )
    this.y -= 20
  }

  protected drawTable(
    headers: string[],
    rows: string[][],
    colWidths: number[],
    alignments?: TableAlignment[],
  ): void {
    const fontSize = 9
    const lineHeight = 12.5
    const padX = 7
    const padY = 5

    const measureRow = (cells: string[], isHeader: boolean) => {
      const wrappedCells = cells.map((cell, idx) => {
        const w = Math.max(20, (colWidths[idx] ?? 80) - padX * 2)
        const spans = isHeader
          ? [{ text: cell, style: 'bold' as PdfFontStyle }]
          : this.parseInlineSpans(cell)
        return this.wrapInlineSpans(spans, w, fontSize)
      })
      const maxLines = Math.max(1, ...wrappedCells.map((l) => l.length))
      return {
        wrappedCells,
        height: maxLines * lineHeight + padY * 2,
      }
    }

    const renderRow = (
      measured: ReturnType<typeof measureRow>,
      bgRgb: string | null,
      isHeader: boolean,
    ) => {
      const rowH = measured.height
      const rowBottom = this.y - rowH

      if (bgRgb) {
        this.fillRect(PDF_MARGIN_X, rowBottom, PDF_CONTENT_W, rowH, bgRgb)
      }
      this.strokeRect(
        PDF_MARGIN_X,
        rowBottom,
        PDF_CONTENT_W,
        rowH,
        PDF_COLORS.border,
        0.5,
      )

      let colX = PDF_MARGIN_X
      for (let i = 0; i < colWidths.length; i++) {
        const cw = colWidths[i]
        if (i > 0) {
          this.drawLine(colX, rowBottom, colX, this.y, PDF_COLORS.border, 0.5)
        }
        const cellLines = measured.wrappedCells[i] ?? []
        const align = alignments?.[i] ?? 'left'
        let textY = this.y - padY - fontSize + 1
        for (const lineSpans of cellLines) {
          this.drawInlineLine(
            colX + padX,
            textY,
            lineSpans,
            fontSize,
            isHeader ? PDF_COLORS.navy : PDF_COLORS.text,
            align,
            cw - padX * 2,
          )
          textY -= lineHeight
        }
        colX += cw
      }

      this.y = rowBottom
    }

    const headerMeasured = measureRow(headers, true)
    this.ensureSpace(headerMeasured.height + 24)
    renderRow(headerMeasured, PDF_COLORS.headerBg, true)

    rows.forEach((row, rIdx) => {
      const measured = measureRow(row, false)
      if (this.y - measured.height < PDF_BOTTOM_Y) {
        this.newPage()
        renderRow(headerMeasured, PDF_COLORS.headerBg, true)
      }
      renderRow(measured, rIdx % 2 === 1 ? PDF_COLORS.surface : null, false)
    })

    this.y -= 10
  }

  protected drawMarkdown(markdown: string): void {
    const lines = markdown.split(/\r?\n/)
    let i = 0

    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()

      if (!trimmed) {
        this.y -= 5
        i++
        continue
      }

      if (trimmed.startsWith('```')) {
        const codeLines: string[] = []
        i++
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i])
          i++
        }
        i++
        const wrapped = codeLines.flatMap((cl) =>
          this.wrapPlainText(cl || ' ', PDF_CONTENT_W - 20, 8.5, 'code'),
        )
        const boxH = Math.max(1, wrapped.length) * 12 + 12
        this.ensureSpace(boxH + 6)
        this.fillRect(
          PDF_MARGIN_X,
          this.y - boxH,
          PDF_CONTENT_W,
          boxH,
          PDF_COLORS.surface,
        )
        this.strokeRect(
          PDF_MARGIN_X,
          this.y - boxH,
          PDF_CONTENT_W,
          boxH,
          PDF_COLORS.border,
          0.5,
        )
        let cy = this.y - 14
        for (const wl of wrapped) {
          this.drawText(PDF_MARGIN_X + 10, cy, wl, 8.5, 'code', PDF_COLORS.text)
          cy -= 12
        }
        this.y -= boxH + 8
        continue
      }

      if (
        trimmed.includes('|') &&
        i + 1 < lines.length &&
        isTableSeparator(lines[i + 1])
      ) {
        const headers = splitTableRow(trimmed)
        const alignments = getTableAlignments(lines[i + 1])
        i += 2
        const bodyRows: string[][] = []
        while (i < lines.length && lines[i].trim().includes('|')) {
          const cells = splitTableRow(lines[i])
          if (cells.length > 0) {
            while (cells.length < headers.length) cells.push('')
            bodyRows.push(cells.slice(0, headers.length))
          }
          i++
        }
        const colCount = Math.max(1, headers.length)
        const colW = PDF_CONTENT_W / colCount
        const colWidths = Array.from({ length: colCount }, () => colW)
        this.drawTable(headers, bodyRows, colWidths, alignments)
        continue
      }

      const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed)
      if (headingMatch) {
        const level = headingMatch[1].length
        const size = level === 1 ? 12.5 : level === 2 ? 11 : 10
        const wrapped = this.wrapInlineSpans(
          [{ text: headingMatch[2], style: 'bold' }],
          PDF_CONTENT_W,
          size,
        )
        this.ensureSpace(wrapped.length * (size + 4) + 8)
        this.y -= 4
        for (const wLine of wrapped) {
          this.drawInlineLine(PDF_MARGIN_X, this.y, wLine, size, PDF_COLORS.navy)
          this.y -= size + 4
        }
        this.y -= 2
        i++
        continue
      }

      if (trimmed.startsWith('>')) {
        const quoteLines: string[] = []
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
          i++
        }
        const wrapped = this.wrapInlineSpans(
          this.parseInlineSpans(quoteLines.join(' ')),
          PDF_CONTENT_W - 22,
          9.5,
        )
        const boxH = wrapped.length * 13.5 + 10
        this.ensureSpace(boxH + 6)
        this.fillRect(
          PDF_MARGIN_X,
          this.y - boxH,
          PDF_CONTENT_W,
          boxH,
          PDF_COLORS.surface,
        )
        this.fillRect(PDF_MARGIN_X, this.y - boxH, 2.5, boxH, PDF_COLORS.blue)
        let qy = this.y - 13
        for (const wLine of wrapped) {
          this.drawInlineLine(
            PDF_MARGIN_X + 12,
            qy,
            wLine,
            9.5,
            PDF_COLORS.muted,
          )
          qy -= 13.5
        }
        this.y -= boxH + 6
        continue
      }

      const listMatch = /^([-*]|\d+\.)\s+(.+)$/.exec(trimmed)
      if (listMatch) {
        const marker =
          listMatch[1] === '-' || listMatch[1] === '*' ? '-' : listMatch[1]
        const wrapped = this.wrapInlineSpans(
          this.parseInlineSpans(listMatch[2]),
          PDF_CONTENT_W - 18,
          9.5,
        )
        this.ensureSpace(wrapped.length * 13.5 + 3)
        this.drawText(
          PDF_MARGIN_X + 4,
          this.y,
          marker,
          9.5,
          'bold',
          PDF_COLORS.blue,
        )
        for (const wLine of wrapped) {
          this.drawInlineLine(
            PDF_MARGIN_X + 16,
            this.y,
            wLine,
            9.5,
            PDF_COLORS.text,
          )
          this.y -= 13.5
        }
        this.y -= 1.5
        i++
        continue
      }

      const paraLines: string[] = [trimmed]
      i++
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !/^(#{1,3}\s|>|[-*]\s|\d+\.\s|```)/.test(lines[i].trim()) &&
        !(
          lines[i].trim().includes('|') &&
          i + 1 < lines.length &&
          isTableSeparator(lines[i + 1])
        )
      ) {
        paraLines.push(lines[i].trim())
        i++
      }
      const wrapped = this.wrapInlineSpans(
        this.parseInlineSpans(paraLines.join(' ')),
        PDF_CONTENT_W,
        9.5,
      )
      for (const wLine of wrapped) {
        this.ensureSpace(14)
        this.drawInlineLine(
          PDF_MARGIN_X,
          this.y,
          wLine,
          9.5,
          PDF_COLORS.text,
        )
        this.y -= 13.5
      }
      this.y -= 4
    }
  }

  protected wrapPlainText(
    text: string,
    maxWidth: number,
    fontSize: number,
    style: PdfFontStyle = 'normal',
  ): string[] {
    const paragraphs = text.split(/\r?\n/)
    const out: string[] = []
    for (const para of paragraphs) {
      const trimmed = para.trim()
      if (!trimmed) {
        out.push('')
        continue
      }
      const wrapped = this.wrapInlineSpans(
        [{ text: trimmed, style }],
        maxWidth,
        fontSize,
      )
      for (const line of wrapped) {
        out.push(line.map((s) => s.text).join(''))
      }
    }
    return out
  }

  private drawInlineLine(
    x: number,
    y: number,
    spans: PdfInlineSpan[],
    size: number,
    rgb: string = PDF_COLORS.text,
    alignment: TableAlignment = 'left',
    boxWidth = 0,
  ): void {
    const totalW = spans.reduce(
      (acc, s) => acc + this.estimateTextWidth(s.text, size, s.style),
      0,
    )
    let cursorX = x
    if (alignment === 'right' && boxWidth > 0) {
      cursorX = x + Math.max(0, boxWidth - totalW)
    } else if (alignment === 'center' && boxWidth > 0) {
      cursorX = x + Math.max(0, (boxWidth - totalW) / 2)
    }

    for (const span of spans) {
      if (!span.text) continue
      this.drawText(cursorX, y, span.text, size, span.style, rgb)
      cursorX += this.estimateTextWidth(span.text, size, span.style)
    }
  }

  private parseInlineSpans(raw: string): PdfInlineSpan[] {
    const normalized = raw.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    const spans: PdfInlineSpan[] = []
    const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(normalized)) !== null) {
      if (match.index > lastIndex) {
        spans.push({
          text: normalized.slice(lastIndex, match.index),
          style: 'normal',
        })
      }
      const token = match[0]
      if (token.startsWith('**') && token.endsWith('**')) {
        spans.push({ text: token.slice(2, -2), style: 'bold' })
      } else if (token.startsWith('`') && token.endsWith('`')) {
        spans.push({ text: token.slice(1, -1), style: 'code' })
      } else if (token.startsWith('*') && token.endsWith('*')) {
        spans.push({ text: token.slice(1, -1), style: 'italic' })
      }
      lastIndex = regex.lastIndex
    }

    if (lastIndex < normalized.length) {
      spans.push({ text: normalized.slice(lastIndex), style: 'normal' })
    }

    return spans.length > 0 ? spans : [{ text: '', style: 'normal' }]
  }

  private wrapInlineSpans(
    spans: PdfInlineSpan[],
    maxWidth: number,
    fontSize: number,
  ): PdfInlineSpan[][] {
    const lines: PdfInlineSpan[][] = []
    let currentLine: PdfInlineSpan[] = []
    let currentWidth = 0

    const pushToken = (word: string, style: PdfFontStyle) => {
      const w = this.estimateTextWidth(word, fontSize, style)
      if (currentWidth > 0 && currentWidth + w > maxWidth) {
        lines.push(currentLine)
        currentLine = []
        currentWidth = 0
        const trimmed = word.replace(/^\s+/, '')
        if (!trimmed) return
        currentLine.push({ text: trimmed, style })
        currentWidth = this.estimateTextWidth(trimmed, fontSize, style)
        return
      }
      const last = currentLine[currentLine.length - 1]
      if (last && last.style === style) {
        last.text += word
      } else {
        currentLine.push({ text: word, style })
      }
      currentWidth += w
    }

    for (const span of spans) {
      const tokens = span.text.split(/(\s+)/)
      for (const token of tokens) {
        if (!token) continue
        pushToken(token, span.style)
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine)
    }

    return lines.length > 0 ? lines : [[{ text: '', style: 'normal' }]]
  }

  private estimateCharWidth(
    ch: string,
    size: number,
    style: PdfFontStyle,
  ): number {
    if (style === 'code') return size * 0.6
    if ('iIl1!|.,:;\'"` '.includes(ch)) return size * 0.28
    if ('mwMW@#%&'.includes(ch)) return size * 0.78
    if (ch >= 'A' && ch <= 'Z') return size * 0.64
    return size * (style === 'bold' ? 0.54 : 0.5)
  }

  private estimateTextWidth(
    text: string,
    size: number,
    style: PdfFontStyle,
  ): number {
    let w = 0
    for (const ch of text) {
      w += this.estimateCharWidth(ch, size, style)
    }
    return w
  }

  private toWinAnsiSafe(input: string): string {
    return input
      .replace(/\u2014|\u2013/g, '-')
      .replace(/\u2018|\u2019/g, "'")
      .replace(/\u201c|\u201d/g, '"')
      .replace(/\u2026/g, '...')
      .replace(/\u2022/g, '-')
      .replace(/\u00a0/g, ' ')
      .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
  }

  private escapePdfString(text: string): string {
    return this.toWinAnsiSafe(text)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
  }

  private serializePdf(pageStreams: string[]): Buffer {
    const objects: string[] = []
    const firstPageId = 7
    const pageObjIds = pageStreams.map((_, idx) => firstPageId + idx * 2)

    objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
    objects.push(
      `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>\nendobj\n`,
    )
    objects.push(
      '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
    )
    objects.push(
      '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n',
    )
    objects.push(
      '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>\nendobj\n',
    )
    objects.push(
      '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj\n',
    )

    for (let i = 0; i < pageStreams.length; i++) {
      const pageId = firstPageId + i * 2
      const contentId = pageId + 1
      const stream = pageStreams[i]
      const streamLen = Buffer.byteLength(stream, 'latin1')

      objects.push(
        `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_W} ${PDF_PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
      )
      objects.push(
        `${contentId} 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj\n`,
      )
    }

    const header = '%PDF-1.4\n'
    const chunks: Buffer[] = [Buffer.from(header, 'latin1')]
    const offsets: number[] = [0]
    let currentOffset = Buffer.byteLength(header, 'latin1')

    for (const obj of objects) {
      offsets.push(currentOffset)
      const buf = Buffer.from(obj, 'latin1')
      chunks.push(buf)
      currentOffset += buf.length
    }

    const xrefOffset = currentOffset
    const xrefLines = [
      `xref\n0 ${objects.length + 1}\n`,
      '0000000000 65535 f \n',
    ]
    for (let i = 1; i <= objects.length; i++) {
      xrefLines.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
    }

    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
    chunks.push(Buffer.from(xrefLines.join('') + trailer, 'latin1'))

    return Buffer.concat(chunks)
  }
}
