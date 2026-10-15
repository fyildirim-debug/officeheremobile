// Android (Capacitor) platformu: belge seçici (SAF) ile açma, açılan konuma yeniden kaydetme,
// paylaşma, son kullanılanlar ve "Birlikte aç" / "Gönder" ile gelen dosyalar.
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { appFor, isAppKind, mimeFor, NEW_NAME } from "./formats";
import {
  errorCode,
  isAccessError,
  isCancelled,
  mimesForAccept,
  OfficeHereFiles,
  OfficeHereSystem,
  resolveName,
  safeFileName,
  toBase64,
  type Cancelled,
  type NativeFile,
  type OfficeHereFilesPlugin,
  type OfficeHereSystemPlugin,
} from "./nativeFiles";
import { OfficeHereWindow, startNativeChrome } from "./nativeChrome";
import type { OpenedDoc, Platform, RecentFile } from "./types";
import { readRecent, sortRecent, writeRecent } from "./web";

interface Target {
  uri: string;
  writable: boolean;
}

/**
 * Açık belgenin kaydedileceği konumlar. Platform.saveFile yalnız ad aldığından "ad → uri"
 * eşlemesi burada tutulur:
 * - Okunan her belge (seçilen, son kullanılan, dışarıdan gelen) önce `known`a girer; ekranda
 *   açıldığında (App addRecent çağırır) ya da başlangıç ekranından seçildiğinde oturum o belgeye geçer.
 * - Kaydetmede ad oturumda AYNEN varsa aynı konuma yazılır; yoksa (yeni belge, Farklı kaydet,
 *   .doc → .docx gibi uzantı değişimi) belge oluşturma akışı açılır.
 * - Başlangıç ekranına dönülünce oturum temizlenir: sonraki yeni belge aynı adla kaydedilse de
 *   eski dosyanın üzerine yazılmaz.
 */
export class SaveTargets {
  private known = new Map<string, Target>();
  private names = new Map<string, Target>();

  remember(uri: string, writable: boolean) {
    this.known.set(uri, { uri, writable });
  }

  /** Belge ekranda açıldı (ya da kaydedildi). Bu süreçte okunmamış adres oturumu değiştirmez. */
  activate(name: string, uri?: string) {
    if (!uri) {
      this.names.clear();
      return;
    }
    const t = this.known.get(uri);
    if (!t) return;
    if (![...this.names.values()].some((x) => x.uri === uri)) this.names.clear();
    this.names.set(name, t);
  }

  bind(names: string[], t: Target) {
    this.known.set(t.uri, t);
    for (const n of names) this.names.set(n, t);
  }

  get(name: string): Target | undefined {
    return this.names.get(name);
  }

  forget(name: string) {
    this.names.delete(name);
  }

  clear() {
    this.names.clear();
  }

  /** Yeni konum seçicinin açılacağı klasör için açık belgenin adresi. */
  hint(): string | undefined {
    return this.uris()[0];
  }

  /** Açık belgenin adresleri. */
  uris(): string[] {
    return [...new Set([...this.names.values()].map((t) => t.uri))];
  }
}

export interface NativeDeps {
  files: Pick<OfficeHereFilesPlugin, "pickDocument" | "readDocument" | "writeDocument" | "createDocument" | "discard" | "releaseUnused" | "addListener">;
  /** Geçici kopyanın baytları (Capacitor yerel sunucusundan). */
  readTemp(path: string): Promise<ArrayBuffer>;
  /** Baytları önbelleğe (Directory.Cache, göreli yol) yazar; file:// adresi döner. */
  writeTemp(rel: string, bytes: Uint8Array): Promise<string>;
  removeTemp(rel: string): Promise<void>;
  share(o: { files: string[]; title: string; dialogTitle: string }): Promise<unknown>;
  /** Hata bildirimi (toast). */
  notify(message: string): void;
  /** Başlangıç ekranında mı (açık belge yok). */
  home(): boolean;
  /** Yazdırma ve pano (verilmezse OfficeHereSystem eklentisi). */
  system?: OfficeHereSystemPlugin;
  /** Etkinlik kayıtlı durumla mı kuruldu (verilmezse OfficeHereWindow eklentisi). */
  launchState?(): Promise<{ restored: boolean }>;
}

/** Köprüden tek seferde geçen parça (base64 öncesi); bellek tepe değeri sınırlı kalsın. */
const CHUNK = 3 * 1024 * 1024;

export const defaultDeps: NativeDeps = {
  files: OfficeHereFiles,
  system: OfficeHereSystem,
  async readTemp(path) {
    const res = await fetch(Capacitor.convertFileSrc(path));
    if (!res.ok) throw new Error(`Dosya okunamadı (${res.status}).`);
    return res.arrayBuffer();
  },
  async writeTemp(rel, bytes) {
    let uri = "";
    for (let i = 0; i === 0 || i < bytes.length; i += CHUNK) {
      const data = toBase64(bytes.subarray(i, i + CHUNK));
      if (i === 0) uri = (await Filesystem.writeFile({ path: rel, data, directory: Directory.Cache, recursive: true })).uri;
      else await Filesystem.appendFile({ path: rel, data, directory: Directory.Cache });
    }
    return uri;
  },
  async removeTemp(rel) {
    await Filesystem.deleteFile({ path: rel, directory: Directory.Cache }).catch(() => {});
  },
  share: (o) => Share.share(o),
  notify(message) {
    void import("../shell/feedback").then((m) => m.toast(message, "error"));
  },
  home() {
    if (typeof document === "undefined") return true;
    const app = document.documentElement.getAttribute("data-app");
    return !app || app === "baslangic";
  },
  launchState: () => OfficeHereWindow.launchState(),
};

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function toError(e: unknown, fallback: string): Error {
  if (e instanceof Error) return e;
  const msg = typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  return new Error(msg || fallback);
}

/** Kullanıcı konum seçmekten vazgeçti; ekranlar AbortError'u sessizce geçebilir. */
function cancelled(): Error {
  const e = new Error("Kaydetme iptal edildi.");
  e.name = "AbortError";
  return e;
}

function externalMessage(f: NativeFile, e: unknown): string {
  const n = `"${f.name}"`;
  switch (f.error ?? errorCode(e)) {
    case "NO_ACCESS":
      return `${n} açılamadı: dosyaya erişim izni yok. Dosyayı OfficeHere'de "Aç" ile seçin.`;
    case "NOT_FOUND":
      return `${n} bulunamadı.`;
    case "TOO_LARGE":
      return `${n} açılamadı: dosya çok büyük.`;
    default:
      return e instanceof Error && e.message ? e.message : `${n} açılamadı.`;
  }
}

type Ready = { doc: OpenedDoc } | { error: string };

export interface NativePlatform extends Platform {
  /** "Birlikte aç" dinleyicisini ve oturum izleyicisini kurar (Android'de modül yüklenince). */
  init(): void;
  readonly targets: SaveTargets;
}

export function createNativePlatform(deps: NativeDeps = defaultDeps): NativePlatform {
  const targets = new SaveTargets();
  const subscribers = new Set<(d: OpenedDoc) => void>();
  const ready: Ready[] = [];
  let chain: Promise<void> = Promise.resolve();
  let listening = false;
  let observing = false;
  /** Yerel taraf yanıtı bir kez verir; aynı açılıştaki sonraki sorular (StrictMode) aynı sonucu alır. */
  let restored: Promise<boolean> | null = null;

  /** Geçici kopyayı okuyup belgeye çevirir; biçim uzantıdan (yoksa MIME türünden ya da içerikten). */
  async function readDoc(f: NativeFile): Promise<OpenedDoc> {
    if (f.error) throw Object.assign(new Error(f.message ?? "Dosya okunamadı."), { code: f.error });
    let data: ArrayBuffer;
    if (f.path) {
      try {
        data = await deps.readTemp(f.path);
      } finally {
        void deps.files.discard({ path: f.path }).catch(() => {});
      }
    } else data = new TextEncoder().encode(f.text ?? "").buffer as ArrayBuffer;
    const name = resolveName(f.name, f.mime, data);
    const app = appFor(name);
    if (!app) throw new Error(`"${f.name}" desteklenen bir biçimde değil.`);
    if (f.uri) targets.remember(f.uri, !!f.writable);
    return { name, data, app, uri: f.uri };
  }

  /** Gelen belgeler/hatalar sırayla, ilk dinleyici bağlanınca verilir (soğuk açılış). */
  function deliver() {
    while (subscribers.size && ready.length) {
      const r = ready.shift()!;
      if ("doc" in r) subscribers.forEach((cb) => cb(r.doc));
      else deps.notify(r.error);
    }
  }

  function onIncoming(f: NativeFile) {
    chain = chain.then(async () => {
      try {
        ready.push({ doc: await readDoc(f) });
      } catch (e) {
        ready.push({ error: externalMessage(f, e) });
      }
      deliver();
    });
  }

  /** Uygulama kısayolu: yeni boş belge (gelen dosyalarla aynı sırada verilir). */
  function onNew(e: { app: string }) {
    chain = chain.then(() => {
      if (!isAppKind(e?.app)) return;
      ready.push({ doc: { name: NEW_NAME[e.app], data: null, app: e.app } });
      deliver();
    });
  }

  function listen() {
    if (listening) return;
    listening = true;
    deps.files.addListener("externalOpen", onIncoming).catch(() => {
      listening = false;
    });
    deps.files.addListener("newDocument", onNew).catch(() => {});
  }

  const system = deps.system ?? OfficeHereSystem;

  /** Kalıcı izinler son kullanılanlar ve açık belgeyle sınırlı kalır (sistem sınırı dolmasın). */
  function prune() {
    const keep = [...new Set([...readRecent().map((f) => f.uri), ...targets.uris()].filter((u): u is string => !!u))];
    void deps.files.releaseUnused({ keep }).catch(() => {});
  }

  const sameDoc = (x: RecentFile, name: string, uri?: string) =>
    (uri ? x.uri === uri : false) || (x.name === name && (x.uri ?? "") === (uri ?? ""));
  const sameEntry = (x: RecentFile, name: string, uri?: string) => x.name === name && (x.uri ?? "") === (uri ?? "");

  return {
    native: true,
    targets,

    init() {
      listen();
      if (observing || typeof document === "undefined" || typeof MutationObserver === "undefined") return;
      observing = true;
      // Başlangıç ekranına dönüş: açık belge kapandı.
      new MutationObserver(() => deps.home() && targets.clear()).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-app"],
      });
    },

    async pickFile(accept) {
      let r: NativeFile | Cancelled;
      try {
        r = await deps.files.pickDocument({ mimeTypes: mimesForAccept(accept) });
      } catch (e) {
        throw toError(e, "Dosya seçilemedi.");
      }
      if (isCancelled(r)) return null;
      const doc = await readDoc(r);
      if (deps.home()) targets.activate(doc.name, doc.uri);
      return doc;
    },

    async saveFile(name, bytes, mime, opts) {
      const rel = `oh-out/${uid()}.bin`;
      try {
        const temp = await deps.writeTemp(rel, bytes);
        // Yalnız belge biçimleri aynı konuma yazılır; dışa aktarılan dosya (PDF vb.) her seferinde sorulur.
        const isDoc = appFor(name) !== null;
        const t = isDoc && !opts?.saveAs ? targets.get(name) : undefined;
        if (t?.writable) {
          try {
            await deps.files.writeDocument({ uri: t.uri, path: temp });
            return { name, uri: t.uri };
          } catch (e) {
            // İzin yitirildi, dosya silindi ya da konum yazmayı desteklemiyor: yeni konum sorulur.
            if (!isAccessError(e)) throw e;
            targets.forget(name);
          }
        }
        const r = await deps.files.createDocument({
          name: safeFileName(name),
          mime: mime || mimeFor(name),
          path: temp,
          initialUri: t?.uri ?? targets.hint(),
        });
        if (isCancelled(r)) throw cancelled();
        if (!r.uri) throw new Error("Kaydedilemedi.");
        const saved = r.name || name;
        if (isDoc) targets.bind([name, saved], { uri: r.uri, writable: true });
        return { name: saved, uri: r.uri };
      } catch (e) {
        throw toError(e, "Kaydedilemedi.");
      } finally {
        void deps.removeTemp(rel);
      }
    },

    async shareFile(name, bytes) {
      // Alan uygulama dosyayı geç okuyabilir: kopya hemen silinmez (yerel taraf bir gün sonra temizler).
      const uri = await deps.writeTemp(`oh-share/${uid()}/${safeFileName(name)}`, bytes);
      try {
        await deps.share({ files: [uri], title: name, dialogTitle: "Paylaş" });
      } catch (e) {
        if (/cancel/i.test(toError(e, "").message)) return;
        throw toError(e, "Paylaşılamadı.");
      }
    },

    async recent() {
      return sortRecent(readRecent());
    },

    async addRecent(f) {
      const list = readRecent();
      const old = list.find((x) => sameDoc(x, f.name, f.uri));
      // Aynı adres tek kayıt: dosya yeniden adlandırıldıysa eski ad düşer.
      writeRecent([{ ...f, pinned: f.pinned ?? old?.pinned, openedAt: Date.now() }, ...list.filter((x) => !sameDoc(x, f.name, f.uri))]);
      targets.activate(f.name, f.uri);
      prune();
    },

    async removeRecent(name, uri) {
      writeRecent(readRecent().filter((x) => !sameEntry(x, name, uri)));
      prune();
    },

    async pinRecent(name, uri, pinned) {
      writeRecent(readRecent().map((x) => (sameEntry(x, name, uri) ? { ...x, pinned } : x)));
    },

    async openRecent(f) {
      if (!f.uri) return null;
      let nf: NativeFile;
      try {
        nf = await deps.files.readDocument({ uri: f.uri });
      } catch (e) {
        // İzin yitirildi ya da dosya silindi: çağıran yeniden seçtirir.
        if (isAccessError(e)) return null;
        throw toError(e, "Dosya açılamadı.");
      }
      const doc = await readDoc(nf);
      if (deps.home()) targets.activate(doc.name, doc.uri);
      return doc;
    },

    async print(job) {
      try {
        await system.print({ name: job.name, width: job.page?.width, height: job.page?.height });
      } catch (e) {
        throw toError(e, "Yazdırılamadı.");
      }
    },

    async writeClipboard(c) {
      await system.writeClipboard({ text: c.text, html: c.html }).catch(() => {});
    },

    async readClipboard() {
      try {
        const r = await system.readClipboard();
        if (r.empty || (!r.text && !r.html)) return null;
        return { text: r.text ?? "", html: r.html || undefined };
      } catch {
        return null;
      }
    },

    restoredLaunch() {
      return (restored ??= (deps.launchState ?? defaultDeps.launchState!)()
        .then((r) => r?.restored === true)
        // Eski yerel kabuk (yöntem yok) ya da hata: süreç sonlanmasından dönüş sayılmaz.
        .catch(() => false));
    },

    onExternalOpen(cb) {
      subscribers.add(cb);
      listen();
      deliver();
      return () => {
        subscribers.delete(cb);
      };
    },
  };
}

export const nativePlatform = createNativePlatform();

if (Capacitor.isNativePlatform()) {
  nativePlatform.init();
  startNativeChrome();
}
