"use client";

import type React from "react";
import { cn } from "@/lib/utils";
import { getTableAlignments, isTableSeparator, splitTableRow } from "./parser";
import type { MdReaderProps } from "./types";
import { RenderInline } from "./RenderInline";

export function MdReader({ content, className }: MdReaderProps) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let orderedItems: string[] = [];

  const flushLists = (keyPrefix: string) => {
    if (listItems.length > 0) {
      blocks.push(
        <ul
          key={`${keyPrefix}-ul`}
          className="my-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground/90"
        >
          {listItems.map((item, i) => (
            <li key={i}>
              <RenderInline text={item} />
            </li>
          ))}
        </ul>,
      );
      listItems = [];
    }
    if (orderedItems.length > 0) {
      blocks.push(
        <ol
          key={`${keyPrefix}-ol`}
          className="my-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-foreground/90"
        >
          {orderedItems.map((item, i) => (
            <li key={i}>
              <RenderInline text={item} />
            </li>
          ))}
        </ol>,
      );
      orderedItems = [];
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();

    if (!line) {
      flushLists(`line-${idx}`);
      continue;
    }

    if (
      line.includes("|") &&
      idx + 1 < lines.length &&
      isTableSeparator(lines[idx + 1])
    ) {
      flushLists(`line-${idx}`);
      const headers = splitTableRow(line);
      const alignments = getTableAlignments(lines[idx + 1]);
      const rows: string[][] = [];
      let rowIdx = idx + 2;
      while (rowIdx < lines.length && lines[rowIdx].trim().includes("|")) {
        rows.push(splitTableRow(lines[rowIdx]));
        rowIdx++;
      }
      idx = rowIdx - 1;

      blocks.push(
        <div
          key={`table-${idx}`}
          className="my-3 overflow-x-auto rounded-lg border"
        >
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted/60">
              <tr className="border-b">
                {headers.map((h, cIdx) => (
                  <th
                    key={cIdx}
                    className={cn(
                      "px-3 py-2 font-semibold text-foreground",
                      alignments[cIdx] === "center" && "text-center",
                      alignments[cIdx] === "right" && "text-right",
                    )}
                  >
                    <RenderInline text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-muted/30">
                  {headers.map((_, cIdx) => (
                    <td
                      key={cIdx}
                      className={cn(
                        "px-3 py-2 text-foreground/90",
                        alignments[cIdx] === "center" && "text-center",
                        alignments[cIdx] === "right" && "text-right",
                      )}
                    >
                      <RenderInline text={row[cIdx] ?? ""} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (line.startsWith("### ")) {
      flushLists(`line-${idx}`);
      blocks.push(
        <h4
          key={`h4-${idx}`}
          className="mt-4 mb-1.5 text-sm font-semibold text-foreground"
        >
          <RenderInline text={line.slice(4)} />
        </h4>,
      );
      continue;
    }

    if (line.startsWith("## ")) {
      flushLists(`line-${idx}`);
      blocks.push(
        <h3
          key={`h3-${idx}`}
          className="mt-4 mb-2 border-b pb-1 text-base font-semibold text-foreground first:mt-0"
        >
          <RenderInline text={line.slice(3)} />
        </h3>,
      );
      continue;
    }

    if (line.startsWith("# ")) {
      flushLists(`line-${idx}`);
      blocks.push(
        <h2
          key={`h2-${idx}`}
          className="mt-4 mb-2 text-lg font-bold text-foreground first:mt-0"
        >
          <RenderInline text={line.slice(2)} />
        </h2>,
      );
      continue;
    }

    if (/^[-*•]\s+/.test(line)) {
      if (orderedItems.length > 0) flushLists(`line-${idx}`);
      listItems.push(line.replace(/^[-*•]\s+/, ""));
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      if (listItems.length > 0) flushLists(`line-${idx}`);
      orderedItems.push(line.replace(/^\d+\.\s+/, ""));
      continue;
    }

    if (line.startsWith("> ")) {
      flushLists(`line-${idx}`);
      blocks.push(
        <blockquote
          key={`bq-${idx}`}
          className="my-2 border-l-2 border-primary/50 pl-3 text-sm italic text-muted-foreground"
        >
          <RenderInline text={line.slice(2)} />
        </blockquote>,
      );
      continue;
    }

    flushLists(`line-${idx}`);
    blocks.push(
      <p
        key={`p-${idx}`}
        className="my-2 text-sm leading-relaxed text-foreground/90"
      >
        <RenderInline text={line} />
      </p>,
    );
  }

  flushLists("end");

  return <div className={cn("space-y-1", className)}>{blocks}</div>;
}
