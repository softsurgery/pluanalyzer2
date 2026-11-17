export interface PaginatedResponse<T> {
  docs: T[]
  totalDocs: number
  limit: number
  page?: number
  totalPages?: number
}
