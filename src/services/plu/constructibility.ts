import type { ConstructibilityResult, StructuredRegulatoryRules } from './types'

const DEFAULT_FLOOR_HEIGHT_M = 3.0
const AVG_DWELLING_SDP_M2 = 65

/**
 * Deterministic constructibility & 3D volume calculation based solely on
 * parcel surface and validated regulatory parameters.
 */
export function calculateConstructibility(params: {
  parcelSurfaceM2?: number | null
  rules: StructuredRegulatoryRules
}): ConstructibilityResult {
  const surface = params.parcelSurfaceM2 ?? null
  const { rules } = params
  const missingParameters: string[] = []
  const assumptions: string[] = []

  if (surface === null || surface <= 0) {
    missingParameters.push('parcelSurfaceM2')
  }
  if (rules.maxCoverageRatio === null) missingParameters.push('maxCoverageRatio')
  if (rules.maxHeightM === null && rules.maxStoreys === null) {
    missingParameters.push('maxHeightM / maxStoreys')
  }

  if (surface === null || surface <= 0) {
    return {
      status: 'insufficient_data',
      parcelSurfaceM2: null,
      maxFootprintM2: null,
      estimatedBuildableFootprintM2: null,
      minGreenSpaceM2: null,
      maxHeightM: rules.maxHeightM,
      estimatedStoreys: rules.maxStoreys,
      floorHeightAssumedM: DEFAULT_FLOOR_HEIGHT_M,
      maxFloorAreaSdpM2: null,
      maxVolumeM3: null,
      estimatedDwellings: null,
      requiredParkingSpaces: null,
      assumptions,
      missingParameters,
    }
  }

  const maxFootprintM2 =
    rules.maxCoverageRatio !== null
      ? Number((surface * rules.maxCoverageRatio).toFixed(2))
      : null

  const minGreenSpaceM2 =
    rules.minGreenRatio !== null
      ? Number((surface * rules.minGreenRatio).toFixed(2))
      : null

  // Approximate setback reduction factor if parcel is modeled as a square with front/side/rear setbacks
  let estimatedBuildableFootprintM2 = maxFootprintM2
  if (
    rules.frontSetbackM !== null ||
    rules.sideSetbackM !== null ||
    rules.rearSetbackM !== null
  ) {
    const approxSide = Math.sqrt(surface)
    const widthAfterSides = Math.max(0, approxSide - 2 * (rules.sideSetbackM ?? 0))
    const depthAfterFrontRear = Math.max(
      0,
      approxSide - (rules.frontSetbackM ?? 0) - (rules.rearSetbackM ?? 0),
    )
    const setbackArea = Number((widthAfterSides * depthAfterFrontRear).toFixed(2))
    assumptions.push(
      `Setback-constrained footprint approximated on √surface (${approxSide.toFixed(1)}m × ${approxSide.toFixed(1)}m) parcel.`,
    )
    estimatedBuildableFootprintM2 =
      maxFootprintM2 !== null ? Math.min(maxFootprintM2, setbackArea) : setbackArea
  }

  const estimatedStoreys =
    rules.maxStoreys !== null
      ? rules.maxStoreys
      : rules.maxHeightM !== null
        ? Math.max(1, Math.floor(rules.maxHeightM / DEFAULT_FLOOR_HEIGHT_M))
        : null

  if (rules.maxStoreys === null && rules.maxHeightM !== null) {
    assumptions.push(
      `Storey count derived from maxHeightM (${rules.maxHeightM}m) / ${DEFAULT_FLOOR_HEIGHT_M}m floor-to-floor.`,
    )
  }

  const effectiveFootprint = estimatedBuildableFootprintM2 ?? maxFootprintM2
  const maxFloorAreaSdpM2 =
    effectiveFootprint !== null && estimatedStoreys !== null
      ? Number((effectiveFootprint * estimatedStoreys).toFixed(2))
      : null

  const maxVolumeM3 =
    effectiveFootprint !== null && rules.maxHeightM !== null
      ? Number((effectiveFootprint * rules.maxHeightM).toFixed(2))
      : null

  const estimatedDwellings =
    maxFloorAreaSdpM2 !== null
      ? Math.max(1, Math.floor(maxFloorAreaSdpM2 / AVG_DWELLING_SDP_M2))
      : null

  if (estimatedDwellings !== null) {
    assumptions.push(`Estimated dwellings based on ${AVG_DWELLING_SDP_M2} m² average SDP per unit.`)
  }

  const requiredParkingSpaces =
    estimatedDwellings !== null && rules.parkingPerDwelling !== null
      ? Math.ceil(estimatedDwellings * rules.parkingPerDwelling)
      : null

  return {
    status: effectiveFootprint !== null ? 'computed' : 'insufficient_data',
    parcelSurfaceM2: surface,
    maxFootprintM2,
    estimatedBuildableFootprintM2,
    minGreenSpaceM2,
    maxHeightM: rules.maxHeightM,
    estimatedStoreys,
    floorHeightAssumedM: DEFAULT_FLOOR_HEIGHT_M,
    maxFloorAreaSdpM2,
    maxVolumeM3,
    estimatedDwellings,
    requiredParkingSpaces,
    assumptions,
    missingParameters,
  }
}
