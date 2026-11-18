import type { PdfFontStyle } from './types'

export const PDF_PAGE_W = 595
export const PDF_PAGE_H = 842
export const PDF_MARGIN_X = 44
export const PDF_CONTENT_W = PDF_PAGE_W - PDF_MARGIN_X * 2 // 507 pt
export const PDF_TOP_Y = 790
export const PDF_BOTTOM_Y = 58

export const PDF_FONT_MAP: Record<PdfFontStyle, string> = {
  normal: '/F1',
  bold: '/F2',
  italic: '/F3',
  code: '/F4',
}

export const PDF_COLORS = {
  navy: '0.118 0.227 0.541',
  blue: '0.145 0.388 0.922',
  bannerSubtitle: '0.749 0.859 0.996',
  text: '0.059 0.090 0.165',
  muted: '0.392 0.455 0.545',
  surface: '0.957 0.969 0.984',
  headerBg: '0.902 0.933 0.988',
  border: '0.820 0.855 0.902',
  white: '1 1 1',
} as const
