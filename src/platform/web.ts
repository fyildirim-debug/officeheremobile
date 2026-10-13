// Tarayıcı (geliştirme ve e2e) için platform: dosya seçici, indirme, localStorage.
import { appFor } from "./formats";
import type { OpenedDoc, Platform, RecentFile } from "./types";

const RECENT_KEY = "officehere.mobile.recent";

export function readRecent(): RecentFile[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as RecentFile[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function writeRecent(list: RecentFile[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // depolama kapalıysa son kullanılanlar tutulmaz
  }
}

/** Sabitlenenler başta, sonra en yeni. */
export function sortRecent(list: RecentFile[]): RecentFile[] {
  return [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.openedAt - a.openedAt);
}

const same = (f: RecentFile, name: string, uri?: string) => f.name === name && (f.uri ?? "") === (uri ?? "");

export function pickWithInput(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.className = "oh-hidden-input";
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener("cancel", () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function download(name: string, bytes: Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const webPlatform: Platform = {
  native: false,
  async pickFile(accept) {
    const f = await pickWithInput(accept);
    if (!f) return null;
    const app = appFor(f.name);
    if (!app) throw new Error(`"${f.name}" desteklenen bir biçimde değil.`);
    return { name: f.name, data: await f.arrayBuffer(), app } satisfies OpenedDoc;
  },
  async saveFile(name, bytes, mime) {
    download(name, bytes, mime);
    return { name };
  },
  async shareFile(name, bytes, mime) {
    const file = new File([bytes as BlobPart], name, { type: mime });
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: name });
        return;
      } catch {
        // kullanıcı vazgeçtiyse indirmeye düş
      }
    }
    download(name, bytes, mime);
  },
  async recent() {
    return sortRecent(readRecent());
  },
  async addRecent(f) {
    const list = readRecent().filter((x) => !same(x, f.name, f.uri));
    const old = readRecent().find((x) => same(x, f.name, f.uri));
    writeRecent([{ ...f, pinned: f.pinned ?? old?.pinned, openedAt: Date.now() }, ...list]);
  },
  async removeRecent(name, uri) {
    writeRecent(readRecent().filter((x) => !same(x, name, uri)));
  },
  async pinRecent(name, uri, pinned) {
    writeRecent(readRecent().map((x) => (same(x, name, uri) ? { ...x, pinned } : x)));
  },
  async openRecent() {
    // Tarayıcıda dosya konumu saklanamaz; kullanıcı yeniden seçer.
    return null;
  },
  onExternalOpen() {
    return () => {};
  },
};
