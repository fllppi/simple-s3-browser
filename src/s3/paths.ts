export function parentPrefix(p: string) {
  const trimmed = p.endsWith("/") ? p.slice(0, -1) : p;
  const i = trimmed.lastIndexOf("/");
  return i === -1 ? "" : `${trimmed.slice(0, i + 1)}`;
}

export function displayName(key: string, current: string) {
  return key.startsWith(current) ? key.slice(current.length) : key;
}

export function basename(key: string) {
  const i = key.lastIndexOf("/");
  return i === -1 ? key : key.slice(i + 1);
}

export async function uniquePath(name: string) {
  let dest = name || "download";
  let n = 1;
  while (await Bun.file(dest).exists()) {
    const dot = name.lastIndexOf(".");
    dest = dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`;
    n++;
  }
  return dest;
}
