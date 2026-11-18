export interface LoginInput {
  email: string
  password: string
}

export interface UpdateProfileInput {
  fullName?: string
  email?: string
  organization?: string
  territoryFocus?: string
  password?: string
}
