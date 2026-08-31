export type FileEntry = {
  kind: "file";
  name: string;
  key: string;
  size?: number;
  lastModified?: string;
  storageClass?: string;
};

export type Entry =
  | { kind: "up"; name: string }
  | { kind: "dir"; name: string; prefix: string }
  | FileEntry;
