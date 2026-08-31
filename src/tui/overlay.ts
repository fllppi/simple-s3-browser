import { dim, fg, t, type StyledText } from "@opentui/core";
import { formatDate, formatSizeLine } from "../s3/format.ts";
import type { FileEntry } from "../s3/types.ts";
import type { Palette } from "./theme.ts";

export type Overlay =
  | { kind: "hidden" }
  | { kind: "detail"; file: FileEntry }
  | { kind: "url"; file: FileEntry; url: string }
  | { kind: "message"; title: string; body: string };

export type OverlayView = {
  title: string;
  body: StyledText;
  tone: "default" | "danger";
};

export function overlayView(overlay: Overlay, colors: Palette): OverlayView | null {
  if (overlay.kind === "hidden") return null;

  const label = (name: string) => dim(fg(colors.muted)(name.padEnd(10)));

  if (overlay.kind === "detail") {
    const file = overlay.file;
    return {
      title: file.name,
      tone: "default",
      body: t`${label("name")}${file.name}
${label("key")}${file.key}
${label("size")}${formatSizeLine(file.size)}
${label("modified")}${file.lastModified ? formatDate(file.lastModified) : "—"}
${label("class")}${file.storageClass ?? "—"}

${dim(fg(colors.faint)("d  download    u  copy url    esc  back"))}`,
    };
  }

  if (overlay.kind === "url") {
    return {
      title: "presigned url",
      tone: "default",
      body: t`${overlay.url}

${dim(fg(colors.muted)("expires in 1 hour · copied if the terminal supports it"))}
${dim(fg(colors.faint)("esc  back"))}`,
    };
  }

  return {
    title: overlay.title,
    tone: overlay.title === "error" ? "danger" : "default",
    body: t`${overlay.body}

${dim(fg(colors.faint)("any key  close"))}`,
  };
}
