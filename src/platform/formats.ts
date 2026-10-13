// Mobilde açılabilen biçimler ve uygulama eşlemesi (masaüstüyle aynı liste).
import type { AppKind } from "./types";

export const FORMATS: Record<AppKind, string[]> = {
  belge: ["docx", "docm", "dotx", "dotm", "doc", "odt", "ott", "rtf", "md", "markdown", "txt", "html", "htm"],
  tablo: ["xlsx", "xlsm", "xltx", "xltm", "xls", "ods", "ots", "csv", "tsv"],
  sunum: ["pptx", "pptm", "potx", "potm", "ppsx", "ppsm", "ppt", "odp", "otp"],
};

const EXT_APP: Record<string, AppKind> = Object.fromEntries(
  (Object.keys(FORMATS) as AppKind[]).flatMap((a) => FORMATS[a].map((e) => [e, a])),
);

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function baseOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i <= 0 ? name : name.slice(0, i);
}

/** Uzantıdan uygulama; tanınmazsa null. */
export function appFor(name: string): AppKind | null {
  return EXT_APP[extOf(name)] ?? null;
}

/** input[type=file] accept değeri. */
export function acceptFor(app?: AppKind): string {
  const exts = app ? FORMATS[app] : Object.values(FORMATS).flat();
  return exts.map((e) => `.${e}`).join(",");
}

export const MIME: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf",
  md: "text/markdown",
  txt: "text/plain",
  html: "text/html",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  pdf: "application/pdf",
  png: "image/png",
};

export function mimeFor(name: string): string {
  return MIME[extOf(name)] ?? "application/octet-stream";
}

export const APP_LABEL: Record<AppKind, string> = { belge: "Belge", tablo: "Tablo", sunum: "Sunum" };

/** Yeni boş belgenin adı (masaüstüyle aynı). */
export const NEW_NAME: Record<AppKind, string> = { belge: "Belge1.docx", tablo: "Kitap1.xlsx", sunum: "Sunu1.pptx" };

/** Uygulama adı mı (kısayol ve taslak kayıtlarından gelen değer denetimi). */
export const isAppKind = (v: unknown): v is AppKind => v === "belge" || v === "tablo" || v === "sunum";
