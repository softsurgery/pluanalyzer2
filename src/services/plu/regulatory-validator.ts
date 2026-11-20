import type {
  StructuredRegulatoryRules,
  ValidationIssue,
  ValidationReport,
} from '@/services/plu/types'
import type { RegulatoryCategory } from '@/services/plu/article-selection'

export const OFFICIAL_PDF_FALLBACK = 'Voir PDF officiel'

const DESTINATION_EXCEPTION_REGEX =
  /^(?:par\s+exception|toutefois|pour\s+les\s+(?:[ée]quipements\s+publics|constructions?\s+agricoles?|annexes?|abris?\s+de\s+jardin|piscines?))/i

const CATEGORY_FORBIDDEN_MARKERS: Record<RegulatoryCategory, RegExp> = {
  emprise: /\b(?:stationnement|parking|place\s+par\s+logement|cl[ôo]ture|aspect\s+ext[ée]rieur)\b/i,
  hauteur: /\b(?:emprise\s+au\s+sol|stationnement|parking|pleine\s+terre)\b/i,
  espaces_verts: /\b(?:hauteur\s+maximale|stationnement|parking|fa[îi]tage)\b/i,
  recul: /\b(?:emprise\s+au\s+sol|stationnement|parking|pleine\s+terre)\b/i,
  stationnement: /\b(?:emprise\s+au\s+sol|hauteur\s+maximale|fa[îi]tage)\b/i,
  aspect_exterieur: /\b(?:emprise\s+au\s+sol|stationnement|parking)\b/i,
}

const CATEGORY_EXPECTED_MARKERS: Record<RegulatoryCategory, RegExp> = {
  emprise: /\b(?:emprise|ces|surface\s+du\s+terrain|superficie|%|pour\s*cent)\b/i,
  hauteur: /\b(?:hauteur|fa[îi]tage|[ée]gout|acrot[èe]re|m[èe]tres?|m\b|r\+\d)\b/i,
  espaces_verts: /\b(?:espaces?\s+(?:verts?|libres?)|pleine\s+terre|v[ée]g[ée]talis|plantation|%|biotope)\b/i,
  recul: /\b(?:recul|retrait|alignement|limite|voie|implantation|m[èe]tres?|m\b|prospect)\b/i,
  stationnement: /\b(?:stationnement|place|parking|logement|v[ée]lo|garage)\b/i,
  aspect_exterieur: /\b(?:aspect|fa[çc]ade|toiture|enduit|mat[ée]riau|cl[ôo]ture|teinte|menuiserie)\b/i,
}

export interface RuleValidationResult {
  valid: boolean
  fallbackText: typeof OFFICIAL_PDF_FALLBACK
  reason?: string
}

/**
 * Strict post-extraction validation (`validateRule`):
 * - Checks category-specific semantic markers and rejects values describing the wrong category.
 * - Blocks destination-specific exceptions from becoming general parcel rules.
 * - Enforces units (% / ratio 0..1 for emprise & espaces_verts, meters/alignment for hauteur & recul).
 */
export function validateRule(
  category: RegulatoryCategory,
  numericValue: number | null | undefined,
  detailText?: string | null,
): RuleValidationResult {
  const detail = (detailText || '').trim()

  if (detail && DESTINATION_EXCEPTION_REGEX.test(detail)) {
    return {
      valid: false,
      fallbackText: OFFICIAL_PDF_FALLBACK,
      reason: `${category}: destination-specific exception cannot be used as general parcel rule`,
    }
  }

  if (detail) {
    const expected = CATEGORY_EXPECTED_MARKERS[category]
    const forbidden = CATEGORY_FORBIDDEN_MARKERS[category]
    if (forbidden.test(detail) && !expected.test(detail)) {
      return {
        valid: false,
        fallbackText: OFFICIAL_PDF_FALLBACK,
        reason: `${category}: detail describes a different regulatory category`,
      }
    }
  }

  if (category === 'emprise') {
    if (detail && /\d+\s*m(?:[èe]tres?)?\b/i.test(detail) && !/%|pour\s*cent/i.test(detail)) {
      return {
        valid: false,
        fallbackText: OFFICIAL_PDF_FALLBACK,
        reason: 'emprise: unit must be %, never meters',
      }
    }
    if (typeof numericValue === 'number' && (numericValue <= 0 || numericValue > 1)) {
      return {
        valid: false,
        fallbackText: OFFICIAL_PDF_FALLBACK,
        reason: `emprise ratio (${numericValue}) out of valid range (0, 1]`,
      }
    }
  }

  if (category === 'espaces_verts') {
    if (typeof numericValue === 'number' && (numericValue < 0 || numericValue > 1)) {
      return {
        valid: false,
        fallbackText: OFFICIAL_PDF_FALLBACK,
        reason: `minGreenRatio (${numericValue}) out of valid range [0, 1]`,
      }
    }
  }

  if (category === 'hauteur') {
    if (detail && /%/.test(detail) && !/\bm(?:[èe]tres?)?\b/i.test(detail)) {
      return {
        valid: false,
        fallbackText: OFFICIAL_PDF_FALLBACK,
        reason: 'hauteur: unit must be meters, not percentage',
      }
    }
    if (typeof numericValue === 'number' && (numericValue <= 0 || numericValue > 100)) {
      return {
        valid: false,
        fallbackText: OFFICIAL_PDF_FALLBACK,
        reason: `maxHeightM (${numericValue}) out of valid range (0, 100]`,
      }
    }
  }

  if (category === 'recul') {
    if (detail && /%/.test(detail) && !/\bm(?:[èe]tres?)?\b|alignement/i.test(detail)) {
      return {
        valid: false,
        fallbackText: OFFICIAL_PDF_FALLBACK,
        reason: 'recul: unit must be meters or alignment, not percentage',
      }
    }
    if (typeof numericValue === 'number' && (numericValue < 0 || numericValue > 60)) {
      return {
        valid: false,
        fallbackText: OFFICIAL_PDF_FALLBACK,
        reason: `setback (${numericValue}) out of valid range [0, 60]`,
      }
    }
  }

  if (category === 'stationnement') {
    if (typeof numericValue === 'number' && (numericValue < 0 || numericValue > 10)) {
      return {
        valid: false,
        fallbackText: OFFICIAL_PDF_FALLBACK,
        reason: `parkingPerDwelling (${numericValue}) out of valid range [0, 10]`,
      }
    }
  }

  return { valid: true, fallbackText: OFFICIAL_PDF_FALLBACK }
}

/**
 * Sanitize extracted `rules` and `details` using `validateRule`, replacing suspicious values
 * with `null` / `"Voir PDF officiel"` rather than displaying hallucinated numbers.
 */
export function validateAndSanitizeExtractedRules(params: {
  rules: StructuredRegulatoryRules
  details?: Record<string, string>
  warnings?: string[]
}): {
  rules: StructuredRegulatoryRules
  details: Record<string, string> | undefined
  warnings: string[]
} {
  const rules: StructuredRegulatoryRules = { ...params.rules }
  const details: Record<string, string> | undefined = params.details
    ? { ...params.details }
    : undefined
  const warnings = [...(params.warnings || [])]

  const checks: Array<{
    category: RegulatoryCategory
    ruleKey?: keyof StructuredRegulatoryRules
    detailKey: string
  }> = [
    { category: 'emprise', ruleKey: 'maxCoverageRatio', detailKey: 'emprise' },
    { category: 'hauteur', ruleKey: 'maxHeightM', detailKey: 'hauteur_totale' },
    { category: 'hauteur', ruleKey: 'maxEavesHeightM', detailKey: 'hauteur_facade' },
    { category: 'espaces_verts', ruleKey: 'minGreenRatio', detailKey: 'espaces_vegetalises' },
    { category: 'recul', ruleKey: 'frontSetbackM', detailKey: 'recul_voies' },
    { category: 'recul', ruleKey: 'sideSetbackM', detailKey: 'limites_separatives' },
    { category: 'stationnement', ruleKey: 'parkingPerDwelling', detailKey: 'stationnement' },
    { category: 'aspect_exterieur', detailKey: 'aspect_exterieur' },
  ]

  for (const check of checks) {
    const val = check.ruleKey ? rules[check.ruleKey] : undefined
    const detailVal = details?.[check.detailKey]
    if (val === null && !detailVal) continue

    const res = validateRule(check.category, val, detailVal)
    if (!res.valid) {
      if (check.ruleKey) {
        rules[check.ruleKey] = null
      }
      if (details && detailVal) {
        details[check.detailKey] = res.fallbackText
      }
      if (res.reason) {
        warnings.push(`Validation rejected (${check.detailKey}): ${res.reason}`)
      }
    }
  }

  return { rules, details, warnings }
}

function parseGraphicNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const match = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)/)
    if (match) {
      const parsed = Number.parseFloat(match[1])
      return Number.isFinite(parsed) ? parsed : null
    }
  }
  return null
}

/**
 * Overlay official ArcGIS graphic rules onto extracted `StructuredRegulatoryRules` when available.
 */
export function mergeGraphicRules(
  rules: StructuredRegulatoryRules,
  options: {
    arcgisFeatures?: Array<Record<string, unknown>>
    details?: Record<string, string>
    warnings?: string[]
  } = {},
): {
  rules: StructuredRegulatoryRules
  details: Record<string, string> | undefined
  overlaidFields: string[]
} {
  const merged: StructuredRegulatoryRules = { ...rules }
  const details = options.details ? { ...options.details } : undefined
  const overlaidFields: string[] = []
  const features = options.arcgisFeatures || []
  if (features.length === 0) {
    return { rules: merged, details, overlaidFields }
  }

  for (const feat of features) {
    const entries = Object.entries(feat)
    for (const [rawKey, rawVal] of entries) {
      if (rawVal === null || rawVal === undefined || rawVal === '') continue
      const key = rawKey.toUpperCase()

      // Height overlay (e.g. HAUTEUR, H_MAX, HAUTEUR_MAX)
      if (/^(?:HAUTEUR|H_MAX|HAUTEUR_MAX|HAUT_MAX)$/.test(key)) {
        const h = parseGraphicNumber(rawVal)
        if (h !== null && h > 0 && h <= 100) {
          merged.maxHeightM = h
          overlaidFields.push('maxHeightM')
          if (details) details.hauteur_totale = `${h} m (Règlement graphique ArcGIS)`
        }
      }

      // Coverage / CES overlay (e.g. EMPRISE, CES, EMPRISE_SOL, EMPRISE_MAX)
      if (/^(?:EMPRISE|CES|EMPRISE_SOL|EMPRISE_MAX|CES_MAX)$/.test(key)) {
        const rawEmp = parseGraphicNumber(rawVal)
        if (rawEmp !== null && rawEmp > 0) {
          const ratio = rawEmp > 1 && rawEmp <= 100 ? rawEmp / 100 : rawEmp
          if (ratio > 0 && ratio <= 1) {
            merged.maxCoverageRatio = Math.round(ratio * 1000) / 1000
            overlaidFields.push('maxCoverageRatio')
            if (details) {
              details.emprise = `${Math.round(ratio * 100)} % (Règlement graphique ArcGIS)`
            }
          }
        }
      }

      // Front setback overlay (e.g. RECUL, RECUL_VOIE, MARGE_RECUL)
      if (/^(?:RECUL|RECUL_VOIE|MARGE_RECUL)$/.test(key)) {
        const r = parseGraphicNumber(rawVal)
        if (r !== null && r >= 0 && r <= 60) {
          merged.frontSetbackM = r
          overlaidFields.push('frontSetbackM')
          if (details) details.recul_voies = `${r} m (Règlement graphique ArcGIS)`
        }
      }

      // Green space overlay (e.g. PLEINE_TERRE, ESP_VERTS, CBS)
      if (/^(?:PLEINE_TERRE|ESP_VERTS|ESPACES_VERTS|CBS)$/.test(key)) {
        const rawGreen = parseGraphicNumber(rawVal)
        if (rawGreen !== null && rawGreen >= 0) {
          const ratio = rawGreen > 1 && rawGreen <= 100 ? rawGreen / 100 : rawGreen
          if (ratio >= 0 && ratio <= 1) {
            merged.minGreenRatio = Math.round(ratio * 1000) / 1000
            overlaidFields.push('minGreenRatio')
            if (details) {
              details.espaces_vegetalises = `${Math.round(ratio * 100)} % (Règlement graphique ArcGIS)`
            }
          }
        }
      }
    }
  }

  return {
    rules: merged,
    details,
    overlaidFields: Array.from(new Set(overlaidFields)),
  }
}

/**
 * Validate regulatory rules for physical, legal, and completeness consistency.
 */
export function validateRegulatoryRules(params: {
  rules: StructuredRegulatoryRules
  hasOfficialZoning: boolean
  hasOfficialRegulations: boolean
}): ValidationReport {
  const issues: ValidationIssue[] = []
  const { rules } = params

  if (!params.hasOfficialZoning) {
    issues.push({
      severity: 'warning',
      field: 'zoneCode',
      message: 'Official PLU zoning could not be confirmed from IGN API Carto or AMP ArcGIS.',
    })
  }

  if (!params.hasOfficialRegulations) {
    issues.push({
      severity: 'warning',
      field: 'regulations',
      message: 'No official PLU written regulation articles are linked to this analysis.',
    })
  }

  if (
    rules.maxCoverageRatio !== null &&
    (rules.maxCoverageRatio <= 0 || rules.maxCoverageRatio > 1)
  ) {
    issues.push({
      severity: 'error',
      field: 'maxCoverageRatio',
      message: `maxCoverageRatio (${rules.maxCoverageRatio}) must be between 0 and 1.`,
    })
  }

  if (
    rules.minGreenRatio !== null &&
    (rules.minGreenRatio < 0 || rules.minGreenRatio > 1)
  ) {
    issues.push({
      severity: 'error',
      field: 'minGreenRatio',
      message: `minGreenRatio (${rules.minGreenRatio}) must be between 0 and 1.`,
    })
  }

  if (
    rules.maxCoverageRatio !== null &&
    rules.minGreenRatio !== null &&
    rules.maxCoverageRatio + rules.minGreenRatio > 1.0001
  ) {
    issues.push({
      severity: 'warning',
      field: 'maxCoverageRatio',
      message: `Coverage ratio (${rules.maxCoverageRatio}) + green ratio (${rules.minGreenRatio}) exceeds 1.0.`,
    })
  }

  if (rules.maxHeightM !== null && rules.maxHeightM <= 0) {
    issues.push({
      severity: 'error',
      field: 'maxHeightM',
      message: 'maxHeightM must be positive.',
    })
  }

  if (
    rules.maxHeightM !== null &&
    rules.maxStoreys !== null &&
    rules.maxStoreys * 2.5 > rules.maxHeightM + 0.5
  ) {
    issues.push({
      severity: 'warning',
      field: 'maxStoreys',
      message: `maxStoreys (${rules.maxStoreys}) may be inconsistent with maxHeightM (${rules.maxHeightM}m).`,
    })
  }

  const ruleKeys: Array<keyof StructuredRegulatoryRules> = [
    'maxHeightM',
    'maxCoverageRatio',
    'frontSetbackM',
    'sideSetbackM',
    'rearSetbackM',
    'minGreenRatio',
  ]
  const populatedCount = ruleKeys.filter((k) => rules[k] !== null).length
  const completenessScore = Math.round((populatedCount / ruleKeys.length) * 100)

  const hasErrors = issues.some((i) => i.severity === 'error')
  const hasWarnings = issues.some((i) => i.severity === 'warning')

  let status: ValidationReport['status'] = 'valid'
  if (hasErrors) status = 'invalid'
  else if (!params.hasOfficialZoning || !params.hasOfficialRegulations || populatedCount === 0)
    status = 'incomplete'
  else if (hasWarnings) status = 'warnings'

  return {
    status,
    issues,
    hasOfficialZoning: params.hasOfficialZoning,
    hasOfficialRegulations: params.hasOfficialRegulations,
    completenessScore,
  }
}
