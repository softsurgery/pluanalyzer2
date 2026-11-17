import type {
  StructuredRegulatoryRules,
  ValidationIssue,
  ValidationReport,
} from './types'

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
