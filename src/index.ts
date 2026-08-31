#!/usr/bin/env bun
/**
 * Tiny TUI S3 browser built with OpenTUI.
 *
 *   bun start
 *   bun start photos/summer/
 *   bun start --bucket my-bucket --endpoint http://127.0.0.1:9000
 */

import { runBrowser } from "./tui/browser.ts";
import { loadTheme } from "./tui/theme.ts";
import { loadEnv } from "./env.ts";

const args = parseArgs(Bun.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("simple-s3-browser: need a tty");
  process.exit(1);
}

const env = loadEnv({
  bucket: args.bucket,
  endpoint: args.endpoint,
  region: args.region,
});

const s3 = new Bun.S3Client({
  bucket: env.bucket,
  accessKeyId: env.accessKeyId,
  secretAccessKey: env.secretAccessKey,
  ...(env.region ? { region: env.region } : {}),
  ...(env.endpoint ? { endpoint: env.endpoint } : {}),
  ...(env.sessionToken ? { sessionToken: env.sessionToken } : {}),
});

await runBrowser({
  s3,
  bucket: env.bucket,
  prefix: normalizePrefix(args.prefix),
  theme: await loadTheme(args.theme),
});

function parseArgs(argv: string[]) {
  const out = {
    help: false,
    bucket: "",
    endpoint: "",
    region: "",
    prefix: "",
    theme: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    const next = argv[i + 1];
    if (a === "-h" || a === "--help") out.help = true;
    else if (a === "--bucket" && next) {
      out.bucket = next;
      i++;
    } else if (a === "--endpoint" && next) {
      out.endpoint = next;
      i++;
    } else if (a === "--region" && next) {
      out.region = next;
      i++;
    } else if (a === "--theme" && next) {
      out.theme = next;
      i++;
    } else if (!a.startsWith("-") && !out.prefix) {
      out.prefix = a.replace(/^s3:\/\/[^/]+\//, "");
    }
  }
  return out;
}

function normalizePrefix(p: string) {
  if (!p) return "";
  return p.endsWith("/") ? p : `${p}/`;
}

function printHelp() {
  console.log(`simple-s3-browser — tiny tui bucket browser

Usage:
  bun start [prefix] [--bucket name] [--endpoint url] [--region id] [--theme dark|light]

Keys:
  ↑↓ / j k       move
  enter / l      open folder or file
  backspace / h  parent folder
  /              filter
  d              download file to cwd
  u              show 1-hour presigned url
  r              reload
  t              toggle light/dark theme
  q              quit

Env:
  S3_BUCKET / AWS_BUCKET
  S3_ACCESS_KEY_ID / AWS_ACCESS_KEY_ID
  S3_SECRET_ACCESS_KEY / AWS_SECRET_ACCESS_KEY
  S3_REGION / AWS_REGION
  S3_ENDPOINT / AWS_ENDPOINT
  S3_SESSION_TOKEN / AWS_SESSION_TOKEN
  S3_THEME           dark or light (optional)`);
}
