import { displayName } from "./paths.ts";
import type { Entry } from "./types.ts";

export async function listPrefix(
  s3: Bun.S3Client,
  current: string,
  options?: { onRequest?: () => void },
) {
  const dirs: Entry[] = [];
  const files: Entry[] = [];
  let token: string | undefined;
  let wasTruncated = false;
  let pages = 0;

  do {
    options?.onRequest?.();
    const res = await s3.list({
      prefix: current || undefined,
      delimiter: "/",
      maxKeys: 1000,
      continuationToken: token,
    });
    for (const p of res.commonPrefixes ?? []) {
      dirs.push({
        kind: "dir",
        prefix: p.prefix,
        name: displayName(p.prefix, current),
      });
    }
    for (const obj of res.contents ?? []) {
      if (!obj.key || obj.key === current) continue;
      files.push({
        kind: "file",
        key: obj.key,
        name: displayName(obj.key, current),
        size: obj.size,
        lastModified: obj.lastModified,
        storageClass: obj.storageClass,
      });
    }
    wasTruncated = Boolean(res.isTruncated);
    token = wasTruncated ? res.nextContinuationToken : undefined;
    pages++;
  } while (token && pages < 5);

  const entries: Entry[] = [];
  if (current) entries.push({ kind: "up", name: "../" });
  entries.push(...dirs, ...files);
  return { entries, truncated: wasTruncated && pages >= 5 };
}
