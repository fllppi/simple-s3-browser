import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  bold,
  createCliRenderer,
  dim,
  fg,
  t,
  type CliRenderer,
  type KeyEvent,
  type SelectOption,
} from "@opentui/core";
import { formatSize } from "../s3/format.ts";
import { listPrefix } from "../s3/list.ts";
import { basename, parentPrefix, uniquePath } from "../s3/paths.ts";
import { prefixSize } from "../s3/size.ts";
import type { Entry, FileEntry } from "../s3/types.ts";
import { toSelectOptions, visibleEntries } from "./list.ts";
import { overlayView, type Overlay } from "./overlay.ts";
import { palettes, saveTheme, type ThemeName } from "./theme.ts";

export async function runBrowser(opts: {
  s3: Bun.S3Client;
  bucket: string;
  prefix: string;
  theme: ThemeName;
}) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
    backgroundColor: palettes[opts.theme].bg,
    onDestroy: () => process.exit(0),
  });

  const app = new Browser(renderer, opts);
  await app.mount();
  renderer.start();
}

class Browser {
  private prefix: string;
  private entries: Entry[] = [];
  private filter = "";
  private truncated = false;
  private loading = false;
  private status = "";
  private folderBytes: number | null = null;
  private sizeTruncated = false;
  private sizePending = false;
  private sizeGen = 0;
  private sizeCache = new Map<string, number>();
  private requests = 0;
  private lastPaint = 0;
  private overlay: Overlay = { kind: "hidden" };
  private theme: ThemeName;

  private readonly header: BoxRenderable;
  private readonly listBox: BoxRenderable;
  private readonly footer: BoxRenderable;
  private readonly brand: TextRenderable;
  private readonly stats: TextRenderable;
  private readonly pathLine: TextRenderable;
  private readonly list: SelectRenderable;
  private readonly filterBox: BoxRenderable;
  private readonly filterInput: InputRenderable;
  private readonly footerHelp: TextRenderable;
  private readonly footerMeta: TextRenderable;
  private readonly overlayScrim: BoxRenderable;
  private readonly overlayBox: BoxRenderable;
  private readonly overlayBody: TextRenderable;

  constructor(
    private readonly renderer: CliRenderer,
    private readonly opts: {
      s3: Bun.S3Client;
      bucket: string;
      prefix: string;
      theme: ThemeName;
    },
  ) {
    this.prefix = opts.prefix;
    this.theme = opts.theme;
    const colors = this.palette;
    renderer.setBackgroundColor(colors.bg);

    this.header = new BoxRenderable(renderer, {
      id: "header",
      height: 4,
      flexGrow: 0,
      flexShrink: 0,
      paddingX: 2,
      paddingTop: 1,
      backgroundColor: colors.bg,
      border: ["bottom"],
      borderColor: colors.border,
    });

    const headerTop = new BoxRenderable(renderer, {
      id: "header-top",
      height: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      flexShrink: 0,
    });

    this.brand = new TextRenderable(renderer, {
      id: "brand",
      content: t`${bold(fg(colors.accent)("simple-s3-browser"))}`,
      fg: colors.text,
    });

    this.stats = new TextRenderable(renderer, {
      id: "stats",
      content: "",
      fg: colors.muted,
    });

    this.pathLine = new TextRenderable(renderer, {
      id: "path",
      content: "",
      fg: colors.muted,
      height: 1,
      flexShrink: 0,
    });

    headerTop.add(this.brand);
    headerTop.add(this.stats);
    this.header.add(headerTop);
    this.header.add(this.pathLine);

    this.listBox = new BoxRenderable(renderer, {
      id: "list-box",
      border: true,
      borderStyle: "rounded",
      borderColor: colors.border,
      focusedBorderColor: colors.accent,
      flexGrow: 1,
      flexShrink: 1,
      minHeight: 6,
      marginX: 1,
      marginY: 1,
      backgroundColor: colors.surface,
    });

    this.list = new SelectRenderable(renderer, {
      id: "list",
      flexGrow: 1,
      flexShrink: 1,
      options: [{ name: "Loading…", description: "fetching objects", value: null }],
      showDescription: true,
      showScrollIndicator: true,
      wrapSelection: false,
      backgroundColor: colors.surface,
      focusedBackgroundColor: colors.surface,
      textColor: colors.text,
      focusedTextColor: colors.text,
      selectedBackgroundColor: colors.selectedBg,
      selectedTextColor: colors.selectedFg,
      descriptionColor: colors.muted,
      selectedDescriptionColor: colors.accentDim,
      fastScrollStep: 10,
    });
    this.listBox.add(this.list);

    this.filterBox = new BoxRenderable(renderer, {
      id: "filter-box",
      height: 3,
      border: true,
      borderStyle: "rounded",
      borderColor: colors.border,
      focusedBorderColor: colors.accent,
      title: "filter",
      titleColor: colors.accent,
      flexGrow: 0,
      flexShrink: 0,
      marginX: 1,
      visible: false,
      backgroundColor: colors.raised,
      paddingX: 1,
    });

    this.filterInput = new InputRenderable(renderer, {
      id: "filter",
      placeholder: "Filter this prefix…",
      backgroundColor: colors.raised,
      focusedBackgroundColor: colors.raised,
      textColor: colors.text,
      focusedTextColor: colors.text,
      placeholderColor: colors.faint,
      cursorColor: colors.accent,
      flexGrow: 1,
    });
    this.filterBox.add(this.filterInput);

    this.footer = new BoxRenderable(renderer, {
      id: "footer",
      height: 2,
      flexGrow: 0,
      flexShrink: 0,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingX: 2,
      backgroundColor: colors.bg,
      border: ["top"],
      borderColor: colors.border,
    });

    this.footerHelp = new TextRenderable(renderer, {
      id: "footer-help",
      content: "",
      fg: colors.muted,
      flexGrow: 1,
    });

    this.footerMeta = new TextRenderable(renderer, {
      id: "footer-meta",
      content: "",
      fg: colors.faint,
      flexShrink: 0,
    });

    this.footer.add(this.footerHelp);
    this.footer.add(this.footerMeta);

    this.overlayScrim = new BoxRenderable(renderer, {
      id: "overlay-scrim",
      position: "absolute",
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      zIndex: 20,
      visible: false,
      backgroundColor: colors.scrim,
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      padding: 2,
    });

    this.overlayBox = new BoxRenderable(renderer, {
      id: "overlay-card",
      width: "72%",
      minHeight: 12,
      maxHeight: "70%",
      border: true,
      borderStyle: "rounded",
      borderColor: colors.accent,
      title: "",
      titleColor: colors.accent,
      titleAlignment: "left",
      padding: 1,
      backgroundColor: colors.raised,
    });

    this.overlayBody = new TextRenderable(renderer, {
      id: "overlay-body",
      content: "",
      fg: colors.text,
      wrapMode: "word",
      flexGrow: 1,
    });
    this.overlayBox.add(this.overlayBody);
    this.overlayScrim.add(this.overlayBox);

    renderer.root.add(this.header);
    renderer.root.add(this.listBox);
    renderer.root.add(this.filterBox);
    renderer.root.add(this.footer);
    renderer.root.add(this.overlayScrim);

    this.list.on(SelectRenderableEvents.ITEM_SELECTED, (_index, option) => {
      void this.open(option);
    });

    this.filterInput.on(InputRenderableEvents.INPUT, (value) => {
      this.filter = value;
      this.syncList();
    });

    this.filterInput.on(InputRenderableEvents.ENTER, () => {
      this.hideFilter();
    });

    renderer.keyInput.on("keypress", (key) => this.onKey(key));
  }

  private get palette() {
    return palettes[this.theme];
  }

  private toggleTheme() {
    this.theme = this.theme === "dark" ? "light" : "dark";
    this.applyTheme();
    this.status = `${this.theme} mode`;
    if (this.overlay.kind !== "hidden") this.syncOverlay();
    else this.paint();
    void saveTheme(this.theme);
  }

  private applyTheme() {
    const colors = this.palette;
    this.renderer.setBackgroundColor(colors.bg);
    this.header.backgroundColor = colors.bg;
    this.header.borderColor = colors.border;
    this.listBox.backgroundColor = colors.surface;
    this.listBox.borderColor = colors.border;
    this.listBox.focusedBorderColor = colors.accent;
    this.list.backgroundColor = colors.surface;
    this.list.focusedBackgroundColor = colors.surface;
    this.list.textColor = colors.text;
    this.list.focusedTextColor = colors.text;
    this.list.selectedBackgroundColor = colors.selectedBg;
    this.list.selectedTextColor = colors.selectedFg;
    this.list.descriptionColor = colors.muted;
    this.list.selectedDescriptionColor = colors.accentDim;
    this.filterBox.backgroundColor = colors.raised;
    this.filterBox.borderColor = colors.border;
    this.filterBox.focusedBorderColor = colors.accent;
    this.filterBox.titleColor = colors.accent;
    this.filterInput.backgroundColor = colors.raised;
    this.filterInput.focusedBackgroundColor = colors.raised;
    this.filterInput.textColor = colors.text;
    this.filterInput.focusedTextColor = colors.text;
    this.filterInput.placeholderColor = colors.faint;
    this.filterInput.cursorColor = colors.accent;
    this.footer.backgroundColor = colors.bg;
    this.footer.borderColor = colors.border;
    this.footerHelp.fg = colors.muted;
    this.footerMeta.fg = colors.faint;
    this.overlayScrim.backgroundColor = colors.scrim;
    this.overlayBox.backgroundColor = colors.raised;
    const overlayTone = overlayView(this.overlay, colors)?.tone;
    this.overlayBox.titleColor = overlayTone === "danger" ? colors.danger : colors.accent;
    this.overlayBox.borderColor = overlayTone === "danger" ? colors.danger : colors.accent;
    this.overlayBody.fg = colors.text;
    this.brand.content = t`${bold(fg(colors.accent)("simple-s3-browser"))}`;
    this.brand.fg = colors.text;
    this.stats.fg = colors.muted;
    this.pathLine.fg = colors.muted;
  }

  async mount() {
    this.list.focus();
    this.paint();
    await this.refresh();
  }

  private onKey(key: KeyEvent) {
    if (key.eventType === "release") return;

    if (this.overlay.kind !== "hidden") {
      this.onOverlayKey(key);
      key.preventDefault();
      return;
    }

    if (this.filterInput.focused) {
      if (key.name === "escape") {
        this.filter = "";
        this.filterInput.value = "";
        this.syncList();
        this.hideFilter();
        key.preventDefault();
      }
      return;
    }

    if (key.ctrl || key.meta) return;

    switch (key.name) {
      case "q":
        this.renderer.destroy();
        break;
      case "/":
        this.showFilter();
        key.preventDefault();
        break;
      case "h":
      case "left":
      case "backspace":
        void this.goUp();
        key.preventDefault();
        break;
      case "l":
      case "right":
        this.list.selectCurrent();
        key.preventDefault();
        break;
      case "d":
        void this.download(this.selectedFile());
        key.preventDefault();
        break;
      case "u":
        void this.showUrl(this.selectedFile());
        key.preventDefault();
        break;
      case "r":
        void this.refresh(true);
        key.preventDefault();
        break;
      case "t":
        this.toggleTheme();
        key.preventDefault();
        break;
      case "g":
        this.list.setSelectedIndex(key.shift ? Math.max(0, this.list.options.length - 1) : 0);
        key.preventDefault();
        break;
      case "escape":
        if (this.filter) {
          this.filter = "";
          this.filterInput.value = "";
          this.syncList();
          this.paint();
        }
        break;
    }
  }

  private onOverlayKey(key: KeyEvent) {
    const current = this.overlay;
    if (current.kind === "message") {
      this.hideOverlay();
      return;
    }
    if (current.kind === "detail") {
      if (key.name === "d") {
        void this.download(current.file);
        return;
      }
      if (key.name === "u") {
        void this.showUrl(current.file);
        return;
      }
    }
    if (
      current.kind === "url" &&
      (key.name === "escape" || key.name === "h" || key.name === "backspace")
    ) {
      this.showDetail(current.file);
      return;
    }
    if (
      key.name === "escape" ||
      key.name === "q" ||
      key.name === "h" ||
      key.name === "backspace" ||
      key.name === "return"
    ) {
      this.hideOverlay();
    }
  }

  private async refresh(force = false) {
    const gen = ++this.sizeGen;
    this.loading = true;
    this.folderBytes = null;
    this.sizeTruncated = false;
    this.sizePending = true;
    this.requests = 0;
    this.status = "loading…";
    this.paint();
    try {
      const listed = await listPrefix(this.opts.s3, this.prefix, {
        onRequest: () => this.noteRequest(gen),
      });
      if (gen !== this.sizeGen) return;
      this.entries = listed.entries;
      this.truncated = listed.truncated;
      this.status = listed.truncated ? "listing truncated after 5 pages" : "";
      this.syncList(true);
      void this.loadSize(gen, force);
    } catch (err) {
      if (gen !== this.sizeGen) return;
      this.entries = this.prefix ? [{ kind: "up", name: "../" }] : [];
      this.syncList(true);
      this.showMessage("error", err instanceof Error ? err.message : String(err));
    } finally {
      if (gen === this.sizeGen) {
        this.loading = false;
        this.paint();
      }
    }
  }

  private invalidateSize(prefix: string) {
    for (const key of this.sizeCache.keys()) {
      if (prefix === "" || key === prefix || key.startsWith(prefix)) {
        this.sizeCache.delete(key);
      }
    }
  }

  private async loadSize(gen: number, force = false) {
    if (force) this.invalidateSize(this.prefix);
    else {
      const cached = this.sizeCache.get(this.prefix);
      if (cached != null) {
        this.folderBytes = cached;
        this.sizeTruncated = false;
        this.sizePending = false;
        this.paint();
        return;
      }
    }

    try {
      const size = await prefixSize(this.opts.s3, this.prefix, {
        shouldContinue: () => gen === this.sizeGen,
        cache: this.sizeCache,
        onRequest: () => this.noteRequest(gen),
        onProgress: (bytes) => {
          if (gen !== this.sizeGen) return;
          this.folderBytes = bytes;
          this.schedulePaint();
        },
      });
      if (gen !== this.sizeGen) return;
      this.folderBytes = size.bytes;
      this.sizeTruncated = size.truncated;
    } catch {
      if (gen !== this.sizeGen) return;
      this.folderBytes = null;
    }
    if (gen !== this.sizeGen) return;
    this.sizePending = false;
    this.paint();
  }

  private async open(option: SelectOption) {
    const entry = option.value as Entry | null;
    if (!entry) return;
    if (entry.kind === "up") {
      await this.goUp();
      return;
    }
    if (entry.kind === "dir") {
      this.prefix = entry.prefix;
      this.filter = "";
      this.filterInput.value = "";
      this.hideFilter();
      await this.refresh();
      return;
    }
    this.showDetail(entry);
  }

  private async goUp() {
    if (!this.prefix) return;
    this.prefix = parentPrefix(this.prefix);
    this.filter = "";
    this.filterInput.value = "";
    this.hideFilter();
    await this.refresh();
  }

  private selectedFile(): FileEntry | null {
    const value = this.list.getSelectedOption()?.value as Entry | null | undefined;
    return value?.kind === "file" ? value : null;
  }

  private async download(file: FileEntry | null) {
    if (!file) {
      this.status = "select a file to download";
      this.paint();
      return;
    }
    const dest = await uniquePath(basename(file.key));
    this.status = `downloading ${file.name}…`;
    this.paint();
    try {
      this.requests++;
      await Bun.write(dest, this.opts.s3.file(file.key));
      this.status = `saved ${dest}`;
    } catch (err) {
      this.status = err instanceof Error ? err.message : String(err);
    }
    this.paint();
  }

  private async showUrl(file: FileEntry | null) {
    if (!file) {
      this.status = "select a file for a url";
      this.paint();
      return;
    }
    try {
      const url = this.opts.s3.presign(file.key, { expiresIn: 3600 });
      this.renderer.copyToClipboardOSC52(url);
      this.overlay = { kind: "url", file, url };
      this.syncOverlay();
    } catch (err) {
      this.showMessage("error", err instanceof Error ? err.message : String(err));
    }
  }

  private showDetail(file: FileEntry) {
    this.overlay = { kind: "detail", file };
    this.syncOverlay();
  }

  private showMessage(title: string, body: string) {
    this.overlay = { kind: "message", title, body };
    this.syncOverlay();
  }

  private hideOverlay() {
    this.overlay = { kind: "hidden" };
    this.overlayScrim.visible = false;
    this.list.focus();
    this.paint();
  }

  private showFilter() {
    this.filterBox.visible = true;
    this.filterInput.focus();
    this.paint();
  }

  private hideFilter() {
    this.filterBox.visible = false;
    this.list.focus();
    this.paint();
  }

  private syncList(resetIndex = false) {
    this.list.options = toSelectOptions(this.entries, this.filter);
    if (resetIndex) this.list.setSelectedIndex(0);
    this.paint();
  }

  private syncOverlay() {
    const colors = this.palette;
    const view = overlayView(this.overlay, colors);
    if (!view) {
      this.overlayScrim.visible = false;
      this.list.focus();
      this.paint();
      return;
    }

    this.overlayBox.title = view.title;
    this.overlayBox.titleColor = view.tone === "danger" ? colors.danger : colors.accent;
    this.overlayBox.borderColor = view.tone === "danger" ? colors.danger : colors.accent;
    this.overlayBody.content = view.body;
    this.overlayScrim.visible = true;
    this.paint();
  }

  private paint() {
    const colors = this.palette;
    this.renderer.setTerminalTitle(this.location());
    this.pathLine.content = this.pathContent();
    this.stats.content = this.statsContent();
    this.footerHelp.content = this.status
      ? t`${fg(colors.accent)(this.status)}`
      : this.helpContent();
    this.footerMeta.content = t`${dim(fg(colors.faint)(`${this.requests} req`))}`;
  }

  private location() {
    return `s3://${this.opts.bucket}/${this.prefix}`;
  }

  private pathContent() {
    const colors = this.palette;
    const bucket = this.opts.bucket;
    const rest = this.prefix;
    if (!rest) {
      return t`${dim(fg(colors.faint)("s3://"))}${fg(colors.text)(bucket)}`;
    }
    return t`${dim(fg(colors.faint)("s3://"))}${fg(colors.text)(bucket)}${dim(fg(colors.faint)("/"))}${fg(colors.muted)(rest)}`;
  }

  private statsContent() {
    const colors = this.palette;
    const vis = visibleEntries(this.entries, this.filter);
    const dirs = vis.filter((e) => e.kind === "dir").length;
    const files = vis.filter((e) => e.kind === "file").length;
    const size = this.sizeLabel();
    const sizeChunk = size ? fg(colors.accent)(`  ·  ${size}`) : "";
    const truncChunk = this.truncated ? dim(fg(colors.faint)("  ·  truncated")) : "";
    return t`${fg(colors.text)(String(dirs))} ${dim("folders")}  ${dim("·")}  ${fg(colors.text)(String(files))} ${dim("objects")}${sizeChunk}${truncChunk}`;
  }

  private noteRequest(gen: number) {
    if (gen !== this.sizeGen) return;
    this.requests++;
    this.schedulePaint();
  }

  private schedulePaint() {
    const now = Date.now();
    if (now - this.lastPaint >= 100) {
      this.lastPaint = now;
      this.paint();
    }
  }

  private sizeLabel() {
    if (this.folderBytes != null) {
      return `${formatSize(this.folderBytes)}${this.sizeTruncated ? "+" : ""}`;
    }
    if (this.loading || this.sizePending) return "…";
    return "";
  }

  private helpContent() {
    const colors = this.palette;
    if (this.filterInput.focused) {
      return t`${fg(colors.text)("type")} ${dim("filter")}   ${fg(colors.text)("enter")} ${dim("apply")}   ${fg(colors.text)("esc")} ${dim("cancel")}`;
    }
    if (this.overlay.kind === "detail") {
      return t`${fg(colors.text)("d")} ${dim("save")}   ${fg(colors.text)("u")} ${dim("url")}   ${fg(colors.text)("esc")} ${dim("back")}`;
    }
    return t`${fg(colors.text)("↑↓")} ${dim("move")}   ${fg(colors.text)("↵")} ${dim("open")}   ${fg(colors.text)("←")} ${dim("back")}   ${fg(colors.text)("/")} ${dim("filter")}   ${fg(colors.text)("d")} ${dim("save")}   ${fg(colors.text)("u")} ${dim("url")}   ${fg(colors.text)("r")} ${dim("reload")}   ${fg(colors.text)("t")} ${dim("theme")}   ${fg(colors.text)("q")} ${dim("quit")}`;
  }
}
