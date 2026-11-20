export interface ProjectItem {
  id: number | string
  name: string
  commune: string
  codeInsee: string
  territory?: string | null
  status?: string | null
  updatedAt: string
}

export interface CreateProjectInput {
  name: string
  commune: string
  codeInsee: string
  territory: 'amp' | 'gpu'
  status?: string
}

export interface UpdateProjectInput {
  name: string
}

export interface DashboardStats {
  projects: number
  analyses: number
  snapshots: number
  documents: number
}
