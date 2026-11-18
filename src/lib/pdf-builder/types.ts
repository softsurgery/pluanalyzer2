export type PdfFontStyle = 'normal' | 'bold' | 'italic' | 'code'

export interface PdfInlineSpan {
  text: string
  style: PdfFontStyle
}
