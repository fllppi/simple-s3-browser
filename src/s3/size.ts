const LIST_CONCURRENCY = 32;

export async function prefixSize(
  s3: Bun.S3Client,
  prefix: string,
  options?: {
    shouldContinue?: () => boolean;
    onProgress?: (bytes: number) => void;
    cache?: Map<string, number>;
    onRequest?: () => void;
  },
) {
  const shouldContinue = options?.shouldContinue ?? (() => true);
  const cache = options?.cache;
  const run = createPool(LIST_CONCURRENCY);
  let bytes = 0;

  const add = (n: number) => {
    bytes += n;
    options?.onProgress?.(bytes);
  };

  const walk = async (current: string): Promise<number> => {
    if (!shouldContinue()) return 0;

    const cached = cache?.get(current);
    if (cached != null) {
      add(cached);
      return cached;
    }

    const children: string[] = [];
    let local = 0;

    await run(async () => {
      let token: string | undefined;
      do {
        if (!shouldContinue()) return;
        options?.onRequest?.();
        const res = await s3.list({
          prefix: current || undefined,
          delimiter: "/",
          maxKeys: 1000,
          continuationToken: token,
        });
        let page = 0;
        for (const obj of res.contents ?? []) {
          if (!obj.key || obj.key === current) continue;
          page += obj.size ?? 0;
        }
        local += page;
        add(page);
        for (const dir of res.commonPrefixes ?? []) children.push(dir.prefix);
        token = res.isTruncated ? res.nextContinuationToken : undefined;
      } while (token);
    });

    if (!shouldContinue()) return local;

    const nested = await Promise.all(children.map(walk));
    const total = local + nested.reduce((sum, n) => sum + n, 0);
    if (shouldContinue()) cache?.set(current, total);
    return total;
  };

  const total = await walk(prefix);
  return { bytes: shouldContinue() ? total : bytes, truncated: !shouldContinue() };
}

function createPool(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    while (active >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}
