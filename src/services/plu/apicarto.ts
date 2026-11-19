import { fetchJsonWithTimeout } from "@/services/plu/http";
import type {
  ApicartoResult,
  ApicartoZoningFeature,
  GeoJSONGeometry,
  GeoPoint,
} from "@/services/plu/types";

interface ApicartoCollectionResponse<T = Record<string, unknown>> {
  features?: Array<{
    geometry?: unknown;
    properties?: T;
  }>;
}

/**
 * Query IGN API Carto GPU endpoints for zoning and urban-planning prescriptions.
 */
export async function fetchIgnApicartoGpu(
  geometryOrPoint: GeoJSONGeometry | GeoPoint,
): Promise<ApicartoResult> {
  const baseUrl =
    process.env.IGN_APICARTO_BASE_URL || "https://apicarto.ign.fr/api";

  const geomObj: GeoJSONGeometry =
    "lng" in geometryOrPoint
      ? {
          type: "Point",
          coordinates: [geometryOrPoint.lng, geometryOrPoint.lat],
        }
      : geometryOrPoint;

  const geomParam = encodeURIComponent(JSON.stringify(geomObj));

  const [zoneRes, surfRes, linRes, pctRes, infoRes] = await Promise.all([
    fetchJsonWithTimeout<ApicartoCollectionResponse<ApicartoZoningFeature>>(
      `${baseUrl}/gpu/zone-urba?geom=${geomParam}`,
    ),
    fetchJsonWithTimeout<ApicartoCollectionResponse>(
      `${baseUrl}/gpu/prescription-surf?geom=${geomParam}`,
    ),
    fetchJsonWithTimeout<ApicartoCollectionResponse>(
      `${baseUrl}/gpu/prescription-lin?geom=${geomParam}`,
    ),
    fetchJsonWithTimeout<ApicartoCollectionResponse>(
      `${baseUrl}/gpu/prescription-pct?geom=${geomParam}`,
    ),
    fetchJsonWithTimeout<ApicartoCollectionResponse>(
      `${baseUrl}/gpu/info-surf?geom=${geomParam}`,
    ),
  ]);

  if (!zoneRes.ok && !surfRes.ok && !linRes.ok && !pctRes.ok && !infoRes.ok) {
    return {
      status: "error",
      zones: [],
      prescriptions: { surf: [], lin: [], pct: [], infoSurf: [] },
      error: zoneRes.error || "IGN API Carto GPU unavailable",
    };
  }

  const zones = (zoneRes.data?.features || [])
    .map((f) => f.properties)
    .filter((p): p is ApicartoZoningFeature => Boolean(p));

  const primaryZone = zones[0];

  return {
    status: zones.length > 0 ? "ok" : "not_found",
    zoneCode: primaryZone?.libelle,
    zoneLabel: primaryZone?.libelong,
    zoneType: primaryZone?.typezone,
    partition: primaryZone?.partition,
    zones,
    prescriptions: {
      surf: (surfRes.data?.features || []).map((f) => f.properties),
      lin: (linRes.data?.features || []).map((f) => f.properties),
      pct: (pctRes.data?.features || []).map((f) => f.properties),
      infoSurf: (infoRes.data?.features || []).map((f) => f.properties),
    },
    raw: {
      zoneUrba: zoneRes.data,
      prescriptionSurf: surfRes.data,
      prescriptionLin: linRes.data,
      prescriptionPct: pctRes.data,
      infoSurf: infoRes.data,
    },
  };
}
