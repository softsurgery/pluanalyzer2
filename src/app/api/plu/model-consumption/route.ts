import { NextRequest, NextResponse } from "next/server";
import { getPayloadWithUser } from "@/lib/payload-auth";
import { getOllamaService } from "@/services/ollama/OllamaService";
import type {
  OllamaAccountConsumptionResult,
  OllamaUsageRange,
} from "@/types/ollama";

const VALID_RANGES = new Set<OllamaUsageRange>(["24h", "7d", "30d"]);
const DEFAULT_LIMIT = 5;

export async function GET(req: NextRequest) {
  const rawRange = req.nextUrl.searchParams.get("range") || "7d";
  const range: OllamaUsageRange = VALID_RANGES.has(
    rawRange as OllamaUsageRange,
  )
    ? (rawRange as OllamaUsageRange)
    : "7d";

  const rawLimit = Number(req.nextUrl.searchParams.get("limit"));
  const rawOffset = Number(req.nextUrl.searchParams.get("offset"));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 100)
      : DEFAULT_LIMIT;
  const offset =
    Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

  try {
    const { user } = await getPayloadWithUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    if (user.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    const result = await getOllamaService().getAccountConsumption(range, {
      limit,
      offset,
    });

    if (!result.ok) {
      return NextResponse.json(result, {
        status: result.error?.includes("non configurée") ? 400 : 502,
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      {
        ok: false,
        range,
        fetchedAt: new Date().toISOString(),
        error: message,
      } satisfies OllamaAccountConsumptionResult,
      { status: 500 },
    );
  }
}
