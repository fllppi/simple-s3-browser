import type { SelectOption } from "@opentui/core";
import { formatDate, formatSize } from "../s3/format.ts";
import type { Entry } from "../s3/types.ts";

export function visibleEntries(entries: Entry[], query: string) {
  if (!query) return entries;
  const q = query.toLowerCase();
  return entries.filter((e) => e.kind === "up" || e.name.toLowerCase().includes(q));
}

export function toSelectOptions(entries: Entry[], query: string): SelectOption[] {
  const vis = visibleEntries(entries, query);
  if (vis.length === 0) {
    return [
      {
        name: query ? "No matches" : "This prefix is empty",
        description: query ? "try another filter" : "upload objects or go up",
        value: null,
      },
    ];
  }
  return vis.map((entry) => ({
    name: label(entry),
    description: describe(entry),
    value: entry,
  }));
}

function label(entry: Entry) {
  if (entry.kind === "up") return "··";
  return entry.name;
}

function describe(entry: Entry) {
  if (entry.kind === "up") return "parent directory";
  if (entry.kind === "dir") return "directory";
  const size = entry.size == null ? "" : formatSize(entry.size);
  const date = entry.lastModified ? formatDate(entry.lastModified) : "";
  return [size, date].filter(Boolean).join("   ") || "object";
}
