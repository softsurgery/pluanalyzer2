import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PdfExtractor } from "@/services/pdf/PdfExtractor";
import type { PdfDownloadResult, PdfExtractionJob } from "@/types/pdf";

const DEFAULT_MAX_PDF_BYTES = 100 * 1024 * 1024;
const DEFAULT_FETCH_TIMEOUT_MS = 120000;
const DEFAULT_PARALLEL_CHUNKS = 4;
const DEFAULT_CHUNK_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

function sanitizeFilename(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

/**
 * Service for downloading, disk-caching (`/tmp/gpupdf_*` and `/tmp/pluipdf_*`),
 * parallel-chunk downloading, and managing background extraction jobs keyed by
 * document identity + zone code.
 */
export class PdfDownloadService {
  private static readonly zoneResultCache = new Map<string, unknown>();
  private static readonly backgroundJobs = new Map<string, PdfExtractionJob>();

  static buildZoneCacheKey(docIdentity: string, zoneCode?: string): string {
    return `${docIdentity.trim()}::${(zoneCode || "__ALL__").trim().toUpperCase()}`;
  }

  static getCachedZoneResult<T>(docIdentity: string, zoneCode?: string): T | undefined {
    const key = PdfDownloadService.buildZoneCacheKey(docIdentity, zoneCode);
    return PdfDownloadService.zoneResultCache.get(key) as T | undefined;
  }

  static setCachedZoneResult<T>(
    docIdentity: string,
    zoneCode: string | undefined,
    value: T,
  ): void {
    const key = PdfDownloadService.buildZoneCacheKey(docIdentity, zoneCode);
    if (PdfDownloadService.zoneResultCache.size >= 50) {
      const oldest = PdfDownloadService.zoneResultCache.keys().next().value;
      if (oldest) PdfDownloadService.zoneResultCache.delete(oldest);
    }
    PdfDownloadService.zoneResultCache.set(key, value);
  }

  static getBackgroundJob<T = unknown>(
    jobKey: string,
  ): PdfExtractionJob<T> | undefined {
    return PdfDownloadService.backgroundJobs.get(jobKey) as
      | PdfExtractionJob<T>
      | undefined;
  }

  static startBackgroundJob<T>(
    jobKey: string,
    runner: () => Promise<T>,
  ): PdfExtractionJob<T> {
    const existing = PdfDownloadService.backgroundJobs.get(jobKey);
    if (existing && (existing.status === "pending" || existing.status === "completed")) {
      return existing as PdfExtractionJob<T>;
    }

    const now = new Date().toISOString();
    const job: PdfExtractionJob<T> = {
      jobKey,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    PdfDownloadService.backgroundJobs.set(jobKey, job);

    void runner()
      .then((result) => {
        job.status = "completed";
        job.result = result;
        job.updatedAt = new Date().toISOString();
      })
      .catch((err) => {
        job.status = "failed";
        job.error = err instanceof Error ? err.message : String(err);
        job.updatedAt = new Date().toISOString();
      });

    return job;
  }

  static getGpuPdfCachePath(filename: string): string {
    return path.join(os.tmpdir(), `gpupdf_${sanitizeFilename(filename)}`);
  }

  static getPluiPdfCachePath(url: string): string {
    const cleanUrl = url.split("#")[0];
    const hash = crypto.createHash("sha256").update(cleanUrl).digest("hex").slice(0, 16);
    return path.join(os.tmpdir(), `pluipdf_${hash}.pdf`);
  }

  /**
   * Download an official GPU PDF (or reuse `/tmp/gpupdf_<filename>` if already cached on disk).
   */
  static async downloadGpuPdf(params: {
    urls: string[];
    filename: string;
    maxBytes?: number;
    timeoutMs?: number;
  }): Promise<PdfDownloadResult> {
    const maxBytes = params.maxBytes ?? DEFAULT_MAX_PDF_BYTES;
    const timeoutMs = params.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    const filePath = PdfDownloadService.getGpuPdfCachePath(params.filename);

    // Reuse cached file on disk if non-empty
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile() && stat.size > 0 && stat.size <= maxBytes) {
        const buffer = await fs.readFile(filePath);
        return {
          filePath,
          buffer,
          cached: true,
          sourceUrl: params.urls[0] || filePath,
          bytes: buffer.byteLength,
        };
      }
    } catch {
      // Cache miss
    }

    let lastError = "Failed to download GPU PDF";
    for (const url of params.urls) {
      const cleanUrl = url.split("#")[0];
      const pageHint = PdfExtractor.parsePageHintFromUrl(url);
      try {
        const response = await fetch(cleanUrl, {
          method: "GET",
          headers: { Accept: "application/pdf,*/*" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          lastError = `HTTP ${response.status} fetching GPU PDF`;
          continue;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) {
          lastError = `GPU PDF size out of bounds (${buffer.byteLength} bytes)`;
          continue;
        }
        await fs.writeFile(filePath, buffer).catch(() => {});
        return {
          filePath,
          buffer,
          cached: false,
          sourceUrl: cleanUrl,
          pageHint,
          bytes: buffer.byteLength,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Failed to fetch GPU PDF";
      }
    }

    throw new Error(lastError);
  }

  /**
   * Download a Territory / PLUi PDF into `/tmp/pluipdf_<hash>.pdf` using parallel HTTP Range requests
   * when supported by the server, falling back to a standard GET if Range requests are unsupported.
   */
  static async downloadBufferParallel(
    url: string,
    options: {
      concurrency?: number;
      chunkSizeBytes?: number;
      maxBytes?: number;
      timeoutMs?: number;
    } = {},
  ): Promise<PdfDownloadResult> {
    const cleanUrl = url.split("#")[0];
    const pageHint = PdfExtractor.parsePageHintFromUrl(url);
    const filePath = PdfDownloadService.getPluiPdfCachePath(cleanUrl);
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_PDF_BYTES;
    const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    const concurrency = Math.max(1, options.concurrency ?? DEFAULT_PARALLEL_CHUNKS);
    const chunkSize = Math.max(256 * 1024, options.chunkSizeBytes ?? DEFAULT_CHUNK_SIZE_BYTES);

    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile() && stat.size > 0 && stat.size <= maxBytes) {
        const buffer = await fs.readFile(filePath);
        return {
          filePath,
          buffer,
          cached: true,
          sourceUrl: cleanUrl,
          pageHint,
          bytes: buffer.byteLength,
        };
      }
    } catch {
      // Cache miss
    }

    // Probe server for Content-Length & Accept-Ranges
    let totalSize = 0;
    let supportsRanges = false;
    try {
      const headRes = await fetch(cleanUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(Math.min(15000, timeoutMs)),
      });
      if (headRes.ok) {
        const lenHeader = headRes.headers.get("content-length");
        const acceptRanges = headRes.headers.get("accept-ranges");
        totalSize = lenHeader ? Number.parseInt(lenHeader, 10) : 0;
        supportsRanges =
          Boolean(acceptRanges && acceptRanges.toLowerCase().includes("bytes")) &&
          Number.isFinite(totalSize) &&
          totalSize > chunkSize &&
          totalSize <= maxBytes;
      }
    } catch {
      // Fall back to single GET below
    }

    let buffer: Buffer;
    if (supportsRanges && totalSize > 0) {
      const ranges: Array<{ start: number; end: number; index: number }> = [];
      for (let start = 0, index = 0; start < totalSize; start += chunkSize, index++) {
        ranges.push({
          start,
          end: Math.min(totalSize - 1, start + chunkSize - 1),
          index,
        });
      }

      const chunks = new Array<Buffer>(ranges.length);
      let cursor = 0;
      const worker = async () => {
        while (cursor < ranges.length) {
          const item = ranges[cursor++];
          const res = await fetch(cleanUrl, {
            method: "GET",
            headers: {
              Accept: "application/pdf,*/*",
              Range: `bytes=${item.start}-${item.end}`,
            },
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!res.ok && res.status !== 206) {
            throw new Error(`HTTP ${res.status} fetching chunk ${item.index}`);
          }
          chunks[item.index] = Buffer.from(await res.arrayBuffer());
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(concurrency, ranges.length) }, () => worker()),
      );
      buffer = Buffer.concat(chunks);
    } else {
      const res = await fetch(cleanUrl, {
        method: "GET",
        headers: { Accept: "application/pdf,*/*" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching PLUi PDF`);
      }
      buffer = Buffer.from(await res.arrayBuffer());
    }

    if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) {
      throw new Error(`PLUi PDF size out of bounds (${buffer.byteLength} bytes)`);
    }

    await fs.writeFile(filePath, buffer).catch(() => {});
    return {
      filePath,
      buffer,
      cached: false,
      sourceUrl: cleanUrl,
      pageHint,
      bytes: buffer.byteLength,
    };
  }
}
