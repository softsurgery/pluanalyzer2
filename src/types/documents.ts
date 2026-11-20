export interface DocumentItem {
  id: number | string
  title: string
  documentType: string
  commune?: string | null
  codeInsee?: string | null
  zoneCode?: string | null
  sourceUrl?: string | null
  gpuDocumentId?: string | null
  extractionStatus?: string | null
  pageCount?: number | null
  extractedText?: string | null
  filename?: string | null
  media?:
    | {
        id: number | string
        filename?: string | null
        url?: string | null
        filesize?: number | null
      }
    | number
    | string
    | null
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
