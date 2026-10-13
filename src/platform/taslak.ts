// Otomatik kurtarma: açık belgenin kaydedilmemiş hâli cihazda (IndexedDB) taslak olarak tutulur.
// Uygulama arka plana gidince ve düzenleme sürerken belirli aralıklarla yazılır; belge kaydedilince
// ya da ekran kapatılınca silinir. Android uygulamayı arka planda sonlandırırsa (ya da çökme olursa)
// taslak kalır, başlangıç ekranı "Kurtarılan dosyalar" altında önerir.
import { isAppKind } from "./formats";
import type { AppKind } from "./types";

export interface Taslak {
  /** Ekran oturumu kimliği (kurtarılan belge açılınca aynı kimlikle sürer). */
  id: string;
  app: AppKind;
  /** Özgün dosya adı (kaydetme adı ve biçimi bundan). */
  name: string;
  /** Özgün konum (Android'de aynı yere kaydetmek için). */
  uri?: string;
  /** Verinin ayrıştırma adı: taslak tam doğrulukla docx/xlsx/pptx kodlanır. */
  dataName: string;
  data: ArrayBuffer;
  savedAt: number;
  /** Ekrana özgü ek durum (ör. Tablo'da dosya biçimi, Sunum'da özgün biçim). */
  ek?: unknown;
}

export type TaslakOzet = Omit<Taslak, "data"> & { size: number };

/** Depolama arka ucu (IndexedDB; yoksa ya da testte bellek). */
export interface TaslakDeposu {
  put(t: Taslak): Promise<void>;
  get(id: string): Promise<Taslak | null>;
  delete(id: string): Promise<void>;
  all(): Promise<Taslak[]>;
}

/** En çok bu kadar taslak tutulur (eskiler silinir). */
export const EN_COK_TASLAK = 5;

const DB_NAME = "officehere-mobil";
const STORE = "taslaklar";

/** Bellekte depo (IndexedDB yoksa; testler). */
export function bellekDeposu(): TaslakDeposu {
  const m = new Map<string, Taslak>();
  return {
    async put(t) {
      m.set(t.id, t);
    },
    async get(id) {
      return m.get(id) ?? null;
    },
    async delete(id) {
      m.delete(id);
    },
    async all() {
      return [...m.values()];
    },
  };
}

function idbDeposu(): TaslakDeposu | null {
  if (typeof indexedDB === "undefined") return null;
  let dbp: Promise<IDBDatabase | null> | null = null;
  const db = () =>
    (dbp ??= new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }));
  const run = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> => {
    const d = await db();
    if (!d) return null;
    return new Promise((resolve) => {
      try {
        const t = d.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        let out: T | null = null;
        req.onsuccess = () => (out = req.result);
        t.oncomplete = () => resolve(out);
        t.onerror = () => resolve(null);
        t.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  };
  return {
    async put(t) {
      await run("readwrite", (s) => s.put(t));
    },
    async get(id) {
      return ((await run("readonly", (s) => s.get(id))) as Taslak | undefined) ?? null;
    },
    async delete(id) {
      await run("readwrite", (s) => s.delete(id));
    },
    async all() {
      return ((await run("readonly", (s) => s.getAll())) as Taslak[] | null) ?? [];
    },
  };
}

let varsayilan: TaslakDeposu | null = null;
/** Uygulamanın taslak deposu. */
export function taslakDeposu(): TaslakDeposu {
  return (varsayilan ??= idbDeposu() ?? bellekDeposu());
}

const dinleyiciler = new Set<() => void>();
/** Taslak yazılınca ya da silinince (başlangıç ekranı listeyi yeniler). */
export function taslakDinle(fn: () => void): () => void {
  dinleyiciler.add(fn);
  return () => void dinleyiciler.delete(fn);
}
const bildir = () => dinleyiciler.forEach((f) => f());

/** Geçerli kayıt mı (eski/bozuk kayıtlar yok sayılır). */
const gecerli = (t: Taslak | null | undefined): t is Taslak => !!t && typeof t.id === "string" && isAppKind(t.app) && typeof t.name === "string" && t.data instanceof ArrayBuffer;

/** Taslağı yazar; fazlası (en eskiler) silinir. */
export async function taslakYaz(t: Taslak, depo = taslakDeposu()): Promise<void> {
  await depo.put(t);
  const fazla = (await depo.all())
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(EN_COK_TASLAK)
    .filter((x) => x.id !== t.id);
  for (const x of fazla) await depo.delete(x.id);
  bildir();
}

/** Kurtarılabilecek taslaklar (en yeni önce; veri olmadan). */
export async function taslaklar(depo = taslakDeposu()): Promise<TaslakOzet[]> {
  return (await depo.all())
    .filter(gecerli)
    .sort((a, b) => b.savedAt - a.savedAt)
    .map(({ data, ...rest }) => ({ ...rest, size: data.byteLength }));
}

export async function taslakAl(id: string, depo = taslakDeposu()): Promise<Taslak | null> {
  const t = await depo.get(id);
  return gecerli(t) ? t : null;
}

export async function taslakSil(id: string, depo = taslakDeposu()): Promise<void> {
  await depo.delete(id);
  bildir();
}

export function yeniTaslakKimligi(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/* ------------------------------------------------------------------ */
/* Ekranın taslak yazıcısı                                              */
/* ------------------------------------------------------------------ */

export interface TaslakKaynagi {
  app: AppKind;
  /** Anlık ad, konum ve ek durum (her yazmada okunur). */
  bilgi(): { name: string; uri?: string; ek?: unknown };
  /** Belgeyi tam doğrulukla kodlar. */
  kodla(): Promise<{ data: Uint8Array; dataName: string }>;
  /** Büyük belge: kodlama arayüzü bekletmesin diye düzenlerken aralıklı yazma yapılmaz (yalnız arka planda). */
  agir?(): boolean;
}

/** Bundan uzun süren kodlamadan sonra aralıklı yazma bırakılır (yalnız arka plana geçişte yazılır). */
export const AGIR_KODLAMA_MS = 250;

/** Düzenleme sürerken taslağın en geç yazılma aralığı. */
export const TASLAK_ARALIGI = 30_000;

/**
 * Kaydedilmemiş değişiklik varken taslağı yazar: değişiklikten en geç `aralik` sonra ve
 * uygulama arka plana gidince hemen. Değişiklik kalmayınca (kaydedildi, geri alındı) ya da
 * ekran kapanınca taslak silinir. Yazmalar sıralıdır; yazma sürerken gelen değişiklik
 * ardından yeniden yazılır.
 */
export class TaslakYazici {
  private kirli = false;
  /** Son yazmadan sonra değişiklik var. */
  private bekleyen = false;
  private yazildi = false;
  private kapali = false;
  private zaman: ReturnType<typeof setTimeout> | null = null;
  private zincir: Promise<void> = Promise.resolve();
  /** Son kodlamanın süresi (ms). */
  private sure = 0;

  constructor(
    readonly id: string,
    private kaynak: TaslakKaynagi,
    private depo: TaslakDeposu = taslakDeposu(),
    private aralik = TASLAK_ARALIGI,
    private saat: () => number = () => performance.now(),
  ) {}

  /** Belge değişti; kirli: kaydedilmemiş değişiklik var. */
  degisti(kirli: boolean): void {
    if (this.kapali) return;
    this.kirli = kirli;
    if (!kirli) {
      this.bekleyen = false;
      this.durdur();
      this.sil();
      return;
    }
    this.bekleyen = true;
    if (this.zaman) return;
    // Büyük belgede düzenlerken kodlama yapılmaz (arayüz donmasın); arka plana geçişte yazılır.
    if (this.sure > AGIR_KODLAMA_MS || this.kaynak.agir?.()) return;
    this.zaman = setTimeout(() => {
      this.zaman = null;
      void this.simdiYaz();
    }, this.aralik);
  }

  /** Bekleyen değişiklik varsa taslak hemen yazılır (arka plana geçiş). */
  simdiYaz(): Promise<void> {
    this.durdur();
    if (this.kapali || !this.kirli || !this.bekleyen) return this.zincir;
    this.bekleyen = false;
    this.zincir = this.zincir.then(async () => {
      if (this.kapali || !this.kirli) return;
      try {
        const t0 = this.saat();
        const { data, dataName } = await this.kaynak.kodla();
        this.sure = this.saat() - t0;
        if (this.kapali || !this.kirli) return;
        const b = this.kaynak.bilgi();
        const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
        await taslakYaz({ id: this.id, app: this.kaynak.app, name: b.name, uri: b.uri, dataName, data: buf, savedAt: Date.now(), ek: b.ek }, this.depo);
        this.yazildi = true;
        // Yazarken kapatıldıysa (ekran kapandı) yazılan taslak kalmasın.
        if (this.kapali) await taslakSil(this.id, this.depo);
      } catch {
        // Kodlanamadı/yazılamadı: sonraki değişiklikte yeniden denenir.
        this.bekleyen = true;
      }
    });
    return this.zincir;
  }

  /** Ekran yeniden bağlandı (React StrictMode). */
  baslat(): void {
    this.kapali = false;
  }

  /** Ekran kapandı: taslak silinir, zamanlayıcı durur. */
  kapat(): void {
    this.kapali = true;
    this.durdur();
    this.sil();
  }

  private sil() {
    this.zincir = this.zincir.then(() => taslakSil(this.id, this.depo)).catch(() => {});
    this.yazildi = false;
  }

  private durdur() {
    if (this.zaman) clearTimeout(this.zaman);
    this.zaman = null;
  }

  /** Testler için: bekleyen işler bitince. */
  bitti(): Promise<void> {
    return this.zincir;
  }

  get taslakVar(): boolean {
    return this.yazildi;
  }
}
