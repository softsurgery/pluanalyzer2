export interface DocumentItem {
  id: number | string
  title: string
  documentType: string
  commune?: string | null
  codeInsee?: string | null
  zoneCode?: string | null
  extractionStatus?: string | null
  pageCount?: number | null
  extractedText?: string | null
  filename?: string | null
  updatedAt: string
}

export interface UploadDocumentInput {
  file: File
  title?: string
  zoneCode: string
  codeInsee: string
  commune?: string
  projectId?: string
}
