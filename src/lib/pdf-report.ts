import {
  getTableAlignments,
  isTableSeparator,
  splitTableRow,
} from '@/components/shared/md-reader/parser'
import type { TableAlignment } from '@/components/shared/md-reader/types'

/**
 * Pure-TypeScript PDF 1.4 report generator with Markdown & table rendering,
 * branded header, styled callouts, and page footers.
 */

export interface PluPdfReportInput {
  projectName: string
  summary?: string | null
  calculations: Record<string, unknown>
}

type FontStyle = 'normal' | 'bold' | 'italic' | 'code'

interface InlineSpan {
  text: string
  style: FontStyle
}

const PAGE_W = 595
const PAGE_H = 842
const MARGIN_X = 44
const CONTENT_W = PAGE_W - MARGIN_X * 2 // 507 pt
const TOP_Y = 790
const BOTTOM_Y = 58

const FONT_MAP: Record<FontStyle, string> = {
  normal: '/F1',
  bold: '/F2',
  italic: '/F3',
  code: '/F4',
}

// Colors (RGB 0..1)
const C_NAVY = '0.118 0.227 0.541'
const C_BLUE = '0.145 0.388 0.922'
const C_TEXT = '0.059 0.090 0.165'
const C_MUTED = '0.392 0.455 0.545'
const C_SURFACE = '0.957 0.969 0.984'
const C_HEADER_BG = '0.902 0.933 0.988'
const C_BORDER = '0.820 0.855 0.902'
const C_WHITE = '1 1 1'

function toWinAnsiSafe(input: string): string {
  return input
    .replace(/\u2014|\u2013/g, '-')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
}

function escapePdfString(text: string): string {
  return toWinAnsiSafe(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function estimateCharWidth(ch: string, size: number, style: FontStyle): number {
  if (style === 'code') return size * 0.6
  if ('iIl1!|.,:;\'"` '.includes(ch)) return size * 0.28
  if ('mwMW@#%&'.includes(ch)) return size * 0.78
  if (ch >= 'A' && ch <= 'Z') return size * 0.64
  return size * (style === 'bold' ? 0.54 : 0.5)
}

function estimateTextWidth(text: string, size: number, style: FontStyle): number {
  let w = 0
  for (const ch of text) {
    w += estimateCharWidth(ch, size, style)
  }
  return w
}

function parseInlineSpans(raw: string): InlineSpan[] {
  // Normalize links [label](url) -> label before splitting inline styles
  const normalized = raw.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  const spans: InlineSpan[] = []
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

function wrapInlineSpans(
  spans: InlineSpan[],
  maxWidth: number,
  fontSize: number,
): InlineSpan[][] {
  const lines: InlineSpan[][] = []
  let currentLine: InlineSpan[] = []
  let currentWidth = 0

  const pushToken = (word: string, style: FontStyle) => {
    const w = estimateTextWidth(word, fontSize, style)
    if (currentWidth > 0 && currentWidth + w > maxWidth) {
      lines.push(currentLine)
      currentLine = []
      currentWidth = 0
      const trimmed = word.replace(/^\s+/, '')
      if (!trimmed) return
      currentLine.push({ text: trimmed, style })
      currentWidth = estimateTextWidth(trimmed, fontSize, style)
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

function wrapPlainText(
  text: string,
  maxWidth: number,
  fontSize: number,
  style: FontStyle = 'normal',
): string[] {
  const paragraphs = text.split(/\r?\n/)
  const out: string[] = []
  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) {
      out.push('')
      continue
    }
    const wrapped = wrapInlineSpans([{ text: trimmed, style }], maxWidth, fontSize)
    for (const line of wrapped) {
      out.push(line.map((s) => s.text).join(''))
    }
  }
  return out
}

class PdfCanvas {
  pages: string[][] = [[]]
  y = TOP_Y

  private get ops(): string[] {
    return this.pages[this.pages.length - 1]
  }

  newPage() {
    this.pages.push([])
    this.y = TOP_Y
  }

  ensureSpace(height: number) {
    if (this.y - height < BOTTOM_Y) {
      this.newPage()
    }
  }

  fillRect(x: number, y: number, w: number, h: number, rgb: string) {
    this.ops.push(`${rgb} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`)
  }

  strokeRect(
    x: number,
    y: number,
    w: number,
    h: number,
    rgb: string,
    lineWidth = 0.6,
  ) {
    this.ops.push(
      `${lineWidth} w ${rgb} RG ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`,
    )
  }

  drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    rgb: string,
    lineWidth = 0.6,
  ) {
    this.ops.push(
      `${lineWidth} w ${rgb} RG ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`,
    )
  }

  drawText(
    x: number,
    y: number,
    text: string,
    size: number,
    style: FontStyle = 'normal',
    rgb: string = C_TEXT,
  ) {
    if (!text) return
    this.ops.push(
      `BT ${FONT_MAP[style]} ${size} Tf ${rgb} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfString(text)}) Tj ET`,
    )
  }

  drawInlineLine(
    x: number,
    y: number,
    spans: InlineSpan[],
    size: number,
    rgb: string = C_TEXT,
    alignment: TableAlignment = 'left',
    boxWidth = 0,
  ) {
    const totalW = spans.reduce(
      (acc, s) => acc + estimateTextWidth(s.text, size, s.style),
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
      cursorX += estimateTextWidth(span.text, size, span.style)
    }
  }

  drawSectionTitle(title: string) {
    this.ensureSpace(28)
    this.y -= 6
    this.fillRect(MARGIN_X, this.y - 3, 3, 14, C_BLUE)
    this.drawText(MARGIN_X + 9, this.y, title, 12, 'bold', C_NAVY)
    this.drawLine(MARGIN_X, this.y - 7, MARGIN_X + CONTENT_W, this.y - 7, C_BORDER, 0.6)
    this.y -= 20
  }

  drawTable(
    headers: string[],
    rows: string[][],
    colWidths: number[],
    alignments?: TableAlignment[],
  ) {
    const fontSize = 9
    const lineHeight = 12.5
    const padX = 7
    const padY = 5

    const measureRow = (cells: string[], isHeader: boolean) => {
      const wrappedCells = cells.map((cell, idx) => {
        const w = Math.max(20, (colWidths[idx] ?? 80) - padX * 2)
        const spans = isHeader
          ? [{ text: cell, style: 'bold' as FontStyle }]
          : parseInlineSpans(cell)
        return wrapInlineSpans(spans, w, fontSize)
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
        this.fillRect(MARGIN_X, rowBottom, CONTENT_W, rowH, bgRgb)
      }
      this.strokeRect(MARGIN_X, rowBottom, CONTENT_W, rowH, C_BORDER, 0.5)

      let colX = MARGIN_X
      for (let i = 0; i < colWidths.length; i++) {
        const cw = colWidths[i]
        if (i > 0) {
          this.drawLine(colX, rowBottom, colX, this.y, C_BORDER, 0.5)
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
            isHeader ? C_NAVY : C_TEXT,
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
    renderRow(headerMeasured, C_HEADER_BG, true)

    rows.forEach((row, rIdx) => {
      const measured = measureRow(row, false)
      if (this.y - measured.height < BOTTOM_Y) {
        this.newPage()
        renderRow(headerMeasured, C_HEADER_BG, true)
      }
      renderRow(measured, rIdx % 2 === 1 ? C_SURFACE : null, false)
    })

    this.y -= 10
  }
}

function renderMarkdownToPdf(canvas: PdfCanvas, markdown: string) {
  const lines = markdown.split(/\r?\n/)
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      canvas.y -= 5
      i++
      continue
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      const wrapped = codeLines.flatMap((cl) =>
        wrapPlainText(cl || ' ', CONTENT_W - 20, 8.5, 'code'),
      )
      const boxH = Math.max(1, wrapped.length) * 12 + 12
      canvas.ensureSpace(boxH + 6)
      canvas.fillRect(MARGIN_X, canvas.y - boxH, CONTENT_W, boxH, C_SURFACE)
      canvas.strokeRect(MARGIN_X, canvas.y - boxH, CONTENT_W, boxH, C_BORDER, 0.5)
      let cy = canvas.y - 14
      for (const wl of wrapped) {
        canvas.drawText(MARGIN_X + 10, cy, wl, 8.5, 'code', C_TEXT)
        cy -= 12
      }
      canvas.y -= boxH + 8
      continue
    }

    // Markdown Table
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
      const colW = CONTENT_W / colCount
      const colWidths = Array.from({ length: colCount }, () => colW)
      canvas.drawTable(headers, bodyRows, colWidths, alignments)
      continue
    }

    // Headings
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (headingMatch) {
      const level = headingMatch[1].length
      const size = level === 1 ? 12.5 : level === 2 ? 11 : 10
      const wrapped = wrapInlineSpans(
        [{ text: headingMatch[2], style: 'bold' }],
        CONTENT_W,
        size,
      )
      canvas.ensureSpace(wrapped.length * (size + 4) + 8)
      canvas.y -= 4
      for (const wLine of wrapped) {
        canvas.drawInlineLine(MARGIN_X, canvas.y, wLine, size, C_NAVY)
        canvas.y -= size + 4
      }
      canvas.y -= 2
      i++
      continue
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      const wrapped = wrapInlineSpans(
        parseInlineSpans(quoteLines.join(' ')),
        CONTENT_W - 22,
        9.5,
      )
      const boxH = wrapped.length * 13.5 + 10
      canvas.ensureSpace(boxH + 6)
      canvas.fillRect(MARGIN_X, canvas.y - boxH, CONTENT_W, boxH, C_SURFACE)
      canvas.fillRect(MARGIN_X, canvas.y - boxH, 2.5, boxH, C_BLUE)
      let qy = canvas.y - 13
      for (const wLine of wrapped) {
        canvas.drawInlineLine(MARGIN_X + 12, qy, wLine, 9.5, C_MUTED)
        qy -= 13.5
      }
      canvas.y -= boxH + 6
      continue
    }

    // Bullet or Ordered List
    const listMatch = /^([-*]|\d+\.)\s+(.+)$/.exec(trimmed)
    if (listMatch) {
      const marker = listMatch[1] === '-' || listMatch[1] === '*' ? '-' : listMatch[1]
      const wrapped = wrapInlineSpans(
        parseInlineSpans(listMatch[2]),
        CONTENT_W - 18,
        9.5,
      )
      canvas.ensureSpace(wrapped.length * 13.5 + 3)
      canvas.drawText(MARGIN_X + 4, canvas.y, marker, 9.5, 'bold', C_BLUE)
      for (const wLine of wrapped) {
        canvas.drawInlineLine(MARGIN_X + 16, canvas.y, wLine, 9.5, C_TEXT)
        canvas.y -= 13.5
      }
      canvas.y -= 1.5
      i++
      continue
    }

    // Paragraph
    const paraLines: string[] = [trimmed]
    i++
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3}\s|>|[-*]\s|\d+\.\s|```)/.test(lines[i].trim()) &&
      !(lines[i].trim().includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(lines[i].trim())
      i++
    }
    const wrapped = wrapInlineSpans(
      parseInlineSpans(paraLines.join(' ')),
      CONTENT_W,
      9.5,
    )
    for (const wLine of wrapped) {
      canvas.ensureSpace(14)
      canvas.drawInlineLine(MARGIN_X, canvas.y, wLine, 9.5, C_TEXT)
      canvas.y -= 13.5
    }
    canvas.y -= 4
  }
}

export function buildPluPdfReport(input: PluPdfReportInput): Buffer {
  const canvas = new PdfCanvas()
  const calc = input.calculations || {}

  // 1. Branded Header Banner (project name at the top)
  const titleLines = wrapPlainText(input.projectName || 'Projet PLU', CONTENT_W, 16, 'bold').slice(0, 2)
  const bannerH = titleLines.length > 1 ? 96 : 82
  canvas.fillRect(0, PAGE_H - bannerH, PAGE_W, bannerH, C_NAVY)
  canvas.fillRect(0, PAGE_H - bannerH - 4, PAGE_W, 4, C_BLUE)
  let titleY = PAGE_H - 34
  for (const tl of titleLines) {
    canvas.drawText(MARGIN_X, titleY, tl, 16, 'bold', C_WHITE)
    titleY -= 20
  }
  canvas.drawText(
    MARGIN_X,
    PAGE_H - bannerH + 16,
    'PLU ANALYZER - RAPPORT DE FAISABILITE URBANISTIQUE',
    8.5,
    'bold',
    '0.749 0.859 0.996',
  )

  canvas.y = PAGE_H - bannerH - 22

  // 2. Calculs de Constructibilite Table
  canvas.drawSectionTitle('Calculs de Constructibilite')
  const metricRows: string[][] = [
    ['Surface parcelle', calc.parcelSurfaceM2 ? `${calc.parcelSurfaceM2} m2` : 'N/A'],
    ['Emprise au sol maximale', calc.maxFootprintM2 ? `${calc.maxFootprintM2} m2` : 'N/A'],
    [
      'Emprise constructible estimee (apres reculs)',
      calc.estimatedBuildableFootprintM2
        ? `${calc.estimatedBuildableFootprintM2} m2`
        : 'N/A',
    ],
    ['Hauteur maximale autorisee', calc.maxHeightM ? `${calc.maxHeightM} m` : 'N/A'],
    [
      'Niveaux estimes',
      calc.estimatedStoreys ? `R+${Number(calc.estimatedStoreys) - 1}` : 'N/A',
    ],
    [
      'Surface de plancher (SDP) max estimee',
      calc.maxFloorAreaSdpM2 ? `${calc.maxFloorAreaSdpM2} m2` : 'N/A',
    ],
    ['Volume maximal estime', calc.maxVolumeM3 ? `${calc.maxVolumeM3} m3` : 'N/A'],
    ['Pleine terre minimale', calc.minGreenSpaceM2 ? `${calc.minGreenSpaceM2} m2` : 'N/A'],
  ]
  canvas.drawTable(
    ['Parametre de constructibilite', 'Valeur estimee'],
    metricRows.map(([k, v]) => [k, `**${v}**`]),
    [CONTENT_W * 0.65, CONTENT_W * 0.35],
    ['left', 'right'],
  )

  // 5. Synthese Reglementaire (Markdown)
  canvas.drawSectionTitle('Synthese Reglementaire')
  renderMarkdownToPdf(
    canvas,
    input.summary || 'Aucune synthese disponible.',
  )

  // 6. Add Footer to every page
  const totalPages = canvas.pages.length
  const pageStreams = canvas.pages.map((ops, idx) => {
    const footerOps = [
      `0.6 w ${C_BORDER} RG ${MARGIN_X} 42 m ${MARGIN_X + CONTENT_W} 42 l S`,
      `BT /F1 8 Tf ${C_MUTED} rg ${MARGIN_X} 28 Td (${escapePdfString('PLU Analyzer - Rapport genere automatiquement')}) Tj ET`,
      `BT /F1 8 Tf ${C_MUTED} rg ${MARGIN_X + CONTENT_W - 48} 28 Td (${escapePdfString(`Page ${idx + 1} / ${totalPages}`)}) Tj ET`,
    ]
    return [...ops, ...footerOps].join('\n')
  })

  return serializePdf(pageStreams)
}

function serializePdf(pageStreams: string[]): Buffer {
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
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
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
