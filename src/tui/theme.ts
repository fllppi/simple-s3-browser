import { homedir } from "node:os";
import { join } from "node:path";

export type ThemeName = "dark" | "light";

export type Palette = {
  bg: string;
  surface: string;
  raised: string;
  border: string;
  accent: string;
  accentDim: string;
  text: string;
  muted: string;
  faint: string;
  selectedBg: string;
  selectedFg: string;
  danger: string;
  scrim: string;
};

export const palettes: Record<ThemeName, Palette> = {
  dark: {
    bg: "#12100e",
    surface: "#1a1815",
    raised: "#211f1b",
    border: "#322e28",
    accent: "#e0b35c",
    accentDim: "#a68545",
    text: "#f0ebe3",
    muted: "#8c857a",
    faint: "#5c574f",
    selectedBg: "#3a3124",
    selectedFg: "#f7f0e4",
    danger: "#d9897a",
    scrim: "#0c0a09",
  },
  light: {
    bg: "#f4f1eb",
    surface: "#ffffff",
    raised: "#fffcf7",
    border: "#ddd4c6",
    accent: "#9c6b1c",
    accentDim: "#7a5620",
    text: "#1a1714",
    muted: "#5c564e",
    faint: "#8a8278",
    selectedBg: "#f0e2c4",
    selectedFg: "#1a1714",
    danger: "#b44132",
    scrim: "#cfc6b8",
  },
};

const THEME_FILE = join(homedir(), ".simple-s3-browser-theme");

export function parseTheme(value: string | undefined): ThemeName | undefined {
  const theme = value?.trim().toLowerCase();
  if (theme === "light" || theme === "dark") return theme;
  return undefined;
}

export async function loadTheme(override?: string): Promise<ThemeName> {
  const fromArg = parseTheme(override);
  if (fromArg) return fromArg;

  const fromEnv = parseTheme(process.env.S3_THEME);
  if (fromEnv) return fromEnv;

  const file = Bun.file(THEME_FILE);
  if (await file.exists()) {
    const saved = parseTheme(await file.text());
    if (saved) return saved;
  }

  return "dark";
}

export async function saveTheme(theme: ThemeName) {
  await Bun.write(THEME_FILE, `${theme}\n`);
}
