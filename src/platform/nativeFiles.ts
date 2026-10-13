// Android dosya eklentisi (android/.../OfficeHereFilesPlugin.java) bağlantısı ve biçim yardımcıları.
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { appFor } from "./formats";

/** Yerel tarafın okuduğu/yazdığı belge. Baytlar köprüden değil önbellekteki geçici kopyadan okunur. */
export interface NativeFile {
  /** Asıl konum (content:// ya da file://); "Gönder" ile gelen düz metinde yok. */
  uri?: string;
  name: string;
  mime?: string;
  size?: number;
  /** Önbellekteki geçici kopyanın mutlak yolu (okunduktan sonra discard ile silinir). */
  path?: string;
  /** Aynı konumun üzerine yazma izni var mı. */
  writable?: boolean;
  /** Kalıcı izin alındı mı (son kullanılanlardan yeniden açılabilir). */
  persisted?: boolean;
  /** "Gönder" ile gelen düz metin. */
  text?: string;
  /** Gelen dosya okunamadıysa: NO_ACCESS | NOT_FOUND | TOO_LARGE | IO */
  error?: string;
  message?: string;
}

export interface Cancelled {
  cancelled: true;
}

export interface OfficeHereFilesPlugin {
  /** ACTION_OPEN_DOCUMENT; kalıcı okuma(/yazma) izni alınır. */
  pickDocument(o: { mimeTypes: string[] }): Promise<NativeFile | Cancelled>;
  /** Kayıtlı konumu yeniden okur; izin yoksa NO_ACCESS, silinmişse NOT_FOUND ile reddeder. */
  readDocument(o: { uri: string }): Promise<NativeFile>;
  /** Geçici dosyayı (path) belgenin üzerine yazar ("rwt"/"wt"). */
  writeDocument(o: { uri: string; path: string }): Promise<NativeFile>;
  /** ACTION_CREATE_DOCUMENT ile konum seçtirip geçici dosyayı yazar. */
  createDocument(o: { name: string; mime: string; path: string; initialUri?: string }): Promise<NativeFile | Cancelled>;
  discard(o: { path: string }): Promise<void>;
  releaseUnused(o: { keep: string[] }): Promise<{ released: number }>;
  addListener(event: "externalOpen", fn: (f: NativeFile) => void): Promise<PluginListenerHandle>;
}

export const OfficeHereFiles = registerPlugin<OfficeHereFilesPlugin>("OfficeHereFiles");

export const isCancelled = (r: NativeFile | Cancelled): r is Cancelled => (r as Cancelled).cancelled === true;

/** Hata kodu (Capacitor reddi .code taşır). */
export function errorCode(e: unknown): string | undefined {
  return typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : undefined;
}

/** Konuma erişilemiyor (izin yitirildi, silindi ya da sağlayıcı yazmayı desteklemiyor). */
export const isAccessError = (e: unknown) => ["NO_ACCESS", "NOT_FOUND", "UNSUPPORTED"].includes(errorCode(e) ?? "");

/**
 * Uzantı → MIME türleri. AndroidManifest.xml'deki VIEW/SEND süzgeçleri bu listeyle aynıdır
 * (native.test.ts denetler). Android MIME eşlemesi büyük/küçük harf duyarlı: küçük harf.
 */
export const EXT_MIMES: Record<string, string[]> = {
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  docm: ["application/vnd.ms-word.document.macroenabled.12"],
  dotx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.template"],
  dotm: ["application/vnd.ms-word.template.macroenabled.12"],
  doc: ["application/msword"],
  odt: ["application/vnd.oasis.opendocument.text"],
  ott: ["application/vnd.oasis.opendocument.text-template"],
  rtf: ["application/rtf", "text/rtf"],
  md: ["text/markdown", "text/x-markdown"],
  markdown: ["text/markdown"],
  txt: ["text/plain"],
  html: ["text/html"],
  htm: ["text/html"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  xlsm: ["application/vnd.ms-excel.sheet.macroenabled.12"],
  xltx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.template"],
  xltm: ["application/vnd.ms-excel.template.macroenabled.12"],
  xls: ["application/vnd.ms-excel"],
  ods: ["application/vnd.oasis.opendocument.spreadsheet"],
  ots: ["application/vnd.oasis.opendocument.spreadsheet-template"],
  csv: ["text/csv", "text/comma-separated-values", "application/csv"],
  tsv: ["text/tab-separated-values"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  pptm: ["application/vnd.ms-powerpoint.presentation.macroenabled.12"],
  potx: ["application/vnd.openxmlformats-officedocument.presentationml.template"],
  potm: ["application/vnd.ms-powerpoint.template.macroenabled.12"],
  ppsx: ["application/vnd.openxmlformats-officedocument.presentationml.slideshow"],
  ppsm: ["application/vnd.ms-powerpoint.slideshow.macroenabled.12"],
  ppt: ["application/vnd.ms-powerpoint"],
  odp: ["application/vnd.oasis.opendocument.presentation"],
  otp: ["application/vnd.oasis.opendocument.presentation-template"],
};

/** MIME → ilk uzantı (ör. application/msword → doc). */
const MIME_EXT: Record<string, string> = {};
for (const [ext, mimes] of Object.entries(EXT_MIMES)) for (const m of mimes) MIME_EXT[m] ??= ext;

/** Sağlayıcıların çoğu bilmediği biçimi böyle bildirir; seçicide gri kalmasın. */
const GENERIC = "application/octet-stream";

/** input accept değerinden (".docx,.odt" ya da "image/*") belge seçici MIME listesi. */
export function mimesForAccept(accept: string): string[] {
  const out = new Set<string>();
  const tokens = accept.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  for (const t of tokens) {
    if (t.includes("/")) out.add(t);
    else for (const m of EXT_MIMES[t.replace(/^\./, "")] ?? []) out.add(m);
  }
  if (out.size === 0) return ["*/*"];
  out.add(GENERIC);
  return [...out];
}

/** Uzantı tanınmıyorsa MIME türünden ya da içerikten uzantı ekler; çıkarılamazsa adı olduğu gibi döner. */
export function resolveName(name: string, mime: string | undefined, data: ArrayBuffer | null): string {
  const clean = name.trim().replace(/\.+$/, "") || "Belge";
  if (appFor(clean)) return clean;
  const ext = (mime && MIME_EXT[mime.toLowerCase().split(";")[0].trim()]) || (data ? sniffExt(data) : null);
  return ext ? `${clean}.${ext}` : clean;
}

/** İçerikten biçim: OOXML/ODF (zip), eski ikili (OLE), RTF. */
export function sniffExt(data: ArrayBuffer): string | null {
  const b = new Uint8Array(data);
  if (b.length < 8) return null;
  const head = (n: number) => latin1(b.subarray(0, Math.min(b.length, n)));
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    // ODF "mimetype" ilk girdidir; OOXML parça adları hem yerel başlıklarda hem merkezi dizinde geçer.
    const text = head(64 * 1024) + latin1(b.subarray(Math.max(0, b.length - 256 * 1024)));
    const odf = /application\/vnd\.oasis\.opendocument\.(text|spreadsheet|presentation)/.exec(text);
    if (odf) return { text: "odt", spreadsheet: "ods", presentation: "odp" }[odf[1]] ?? null;
    if (text.includes("word/")) return "docx";
    if (text.includes("xl/")) return "xlsx";
    if (text.includes("ppt/")) return "pptx";
    return null;
  }
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) {
    // Bileşik belge: akış adları dizin girdilerinde UTF-16LE.
    const text = latin1(b.subarray(0, Math.min(b.length, 2 * 1024 * 1024)));
    const u16 = (s: string) => s.split("").join("\0");
    if (text.includes(u16("WordDocument"))) return "doc";
    if (text.includes(u16("Workbook")) || text.includes(u16("Book"))) return "xls";
    if (text.includes(u16("PowerPoint Document"))) return "ppt";
    return null;
  }
  if (head(6) === "{\\rtf1") return "rtf";
  return null;
}

function latin1(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
}

/** Baytları base64'e çevirir (yerleşik toBase64 varsa onu kullanır). */
export function toBase64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64;
  if (typeof native === "function") return native.call(bytes);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Dosya sistemi için güvenli ad (yol ayırıcı ve denetim karakteri yok). */
export function safeFileName(name: string): string {
  const s = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return s.slice(0, 120) || "Belge";
}
