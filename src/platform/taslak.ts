// Otomatik kurtarma: açık belgenin kaydedilmemiş hâli cihazda (IndexedDB) taslak olarak tutulur.
// Uygulama arka plana gidince ve düzenleme sürerken belirli aralıklarla yazılır; belge kaydedilince
// ya da ekran kapatılınca silinir. Android uygulamayı arka planda sonlandırırsa (ya da çökme olursa)
// taslak kalır, başlangıç ekranı "Kurtarılan dosyalar" altında önerir.
//
// Süreç sonlanmasına dayanıklılık: arka plana geçişte ayrıca oturum kaydı (açık belge, taslağı ve
// görünüm durumu: kaydırma, imleç/seçim) yazılır. Android süreci sonlandırıp etkinliği geri yüklerse
// (son kullanılanlardan ya da simgeden dönüş) belge kaldığı yerde sessizce yeniden açılır.
import { isAppKind } from "./formats";
import type { AppKind, OpenedDoc, RecentFile } from "./types";

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
/** Oturum kaydı ayrı veritabanında (taslak veritabanının sürümü ve şeması değişmez). */
const OTURUM_DB = "officehere-mobil-oturum";
const OTURUM_STORE = "oturum";

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

type IdbIs = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => Promise<T | null>;

/** Tek depolu IndexedDB veritabanı; yoksa null. İş, işlem tamamlanınca (diske yazılınca) çözülür. */
function idb(ad: string, store: string, keyPath?: string): IdbIs | null {
  if (typeof indexedDB === "undefined") return null;
  let dbp: Promise<IDBDatabase | null> | null = null;
  const db = () =>
    (dbp ??= new Promise((resolve) => {
      try {
        const req = indexedDB.open(ad, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store, keyPath ? { keyPath } : undefined);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }));
  return async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> => {
    const d = await db();
    if (!d) return null;
    return new Promise((resolve) => {
      try {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
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
}

function idbDeposu(): TaslakDeposu | null {
  const run = idb(DB_NAME, STORE, "id");
  if (!run) return null;
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
/* Oturum: süreç sonlanmasından sessiz dönüş                            */
/* ------------------------------------------------------------------ */

/** Ekranın kaldığı yer (kaydırma, imleç/seçim, etkin slayt…): ekrana özgü, JSON'a çevrilebilir. */
export type Gorunum = Record<string, unknown>;

/** Arka plana geçişte açık belgenin son durumu. */
export interface Oturum {
  /** Yazan ekranın kimliği; taslak varsa taslağın kimliği de budur. */
  ekran: string;
  app: AppKind;
  name: string;
  uri?: string;
  /** Kaydedilmemiş değişiklik vardı (taslak `ekran` kimliğiyle). */
  taslak: boolean;
  gorunum?: Gorunum;
  zaman: number;
  /** Bu kayıtla yapılan geri getirme denemesi (açılışta çöken belge döngüye girmesin). */
  deneme?: number;
}

export interface OturumDeposu {
  al(): Promise<Oturum | null>;
  yaz(o: Oturum): Promise<void>;
  sil(): Promise<void>;
}

const OTURUM_ANAHTARI = "son";

export function bellekOturumDeposu(): OturumDeposu {
  let o: Oturum | null = null;
  return {
    async al() {
      return o;
    },
    async yaz(x) {
      o = x;
    },
    async sil() {
      o = null;
    },
  };
}

function idbOturumDeposu(): OturumDeposu | null {
  const run = idb(OTURUM_DB, OTURUM_STORE);
  if (!run) return null;
  return {
    async al() {
      return ((await run("readonly", (s) => s.get(OTURUM_ANAHTARI))) as Oturum | undefined) ?? null;
    },
    async yaz(o) {
      await run("readwrite", (s) => s.put(o, OTURUM_ANAHTARI));
    },
    async sil() {
      await run("readwrite", (s) => s.delete(OTURUM_ANAHTARI));
    },
  };
}

let varsayilanOturum: OturumDeposu | null = null;
export function oturumDeposu(): OturumDeposu {
  return (varsayilanOturum ??= idbOturumDeposu() ?? bellekOturumDeposu());
}

/** Daha eski oturum geri getirilmez (uzun süre sonra açılan uygulama başlangıç ekranıyla açılır). */
export const OTURUM_OMRU = 7 * 24 * 3600_000;

const gecerliOturum = (o: Oturum | null): o is Oturum => !!o && typeof o.ekran === "string" && isAppKind(o.app) && typeof o.name === "string" && typeof o.zaman === "number";

/** Geri getirilen belge ve uygulanacak görünüm durumu. */
export interface GeriGelen {
  doc: OpenedDoc;
  gorunum?: Gorunum;
}

/**
 * Süreç sonlanmasından dönüş: son oturumun belgesi. Taslak varsa kaydedilmemiş hâliyle, yoksa kayıtlı
 * konumundan (`ac`: son kullanılanı açar) yeniden okunur. Aynı kayıt ikinci kez denenmez; açılan belge
 * arka plana yeniden geçince kayıt tazelenir.
 */
export async function oturumuGeriGetir(
  ac: (f: RecentFile) => Promise<OpenedDoc | null>,
  od: OturumDeposu = oturumDeposu(),
  depo: TaslakDeposu = taslakDeposu(),
  simdi = Date.now(),
): Promise<GeriGelen | null> {
  const o = await od.al().catch(() => null);
  if (!o) return null;
  if (!gecerliOturum(o) || (o.deneme ?? 0) > 0 || simdi - o.zaman > OTURUM_OMRU || o.zaman > simdi + 60_000) {
    await od.sil().catch(() => {});
    return null;
  }
  await od.yaz({ ...o, deneme: (o.deneme ?? 0) + 1 }).catch(() => {});
  if (o.taslak) {
    const t = await taslakAl(o.ekran, depo).catch(() => null);
    if (t) {
      // Özgün dosya yeniden okunur: izin sürüyorsa kaydetme oraya yapılır, yoksa kaydederken konum sorulur.
      const uri = t.uri && (await ac({ name: t.name, app: t.app, uri: t.uri, openedAt: o.zaman }).catch(() => null)) ? t.uri : undefined;
      return { doc: { name: t.name, data: t.data, app: t.app, uri, recovered: { id: t.id, dataName: t.dataName, savedAt: t.savedAt, ek: t.ek } }, gorunum: o.gorunum };
    }
  }
  if (o.uri) {
    try {
      const d = await ac({ name: o.name, app: o.app, uri: o.uri, openedAt: o.zaman });
      if (d && d.app === o.app) return { doc: d, gorunum: o.gorunum };
    } catch {
      // Dosya silindi ya da izin yitirildi: başlangıç ekranı açılır.
    }
  }
  await od.sil().catch(() => {});
  return null;
}

/** Taze açılış (kullanıcı uygulamayı kapattı): eski oturum kaydı unutulur; taslak "Kurtarılan dosyalar"da kalır. */
export async function oturumuUnut(od: OturumDeposu = oturumDeposu()): Promise<void> {
  await od.sil().catch(() => {});
}

/** Ekran açılınca uygulanacak görünüm (geri getirilen belgenin uygulaması ve adıyla eşleşirse). */
let bekleyen: { app: AppKind; name: string; gorunum: Gorunum; zaman: number } | null = null;
const BEKLEME_OMRU = 30_000;

export function gorunumBekle(app: AppKind, name: string, gorunum: Gorunum | undefined, simdi = Date.now()): void {
  bekleyen = gorunum ? { app, name, gorunum, zaman: simdi } : null;
}

/** Bekleyen görünüm durumu (silinmez: React StrictMode ekranı iki kez bağlar; uygulanınca `gorunumUygulandi`). */
export function bekleyenGorunum(app: AppKind, name: string, simdi = Date.now()): Gorunum | undefined {
  if (bekleyen && simdi - bekleyen.zaman > BEKLEME_OMRU) bekleyen = null;
  return bekleyen && bekleyen.app === app && bekleyen.name === name ? bekleyen.gorunum : undefined;
}

export function gorunumUygulandi(): void {
  bekleyen = null;
}

/** Arka plana geçişte işin (oturum + taslak) bitmesi hedeflenen süre: sonrasında süreç her an dondurulabilir. */
export const ARKA_PLAN_BUTCESI = 1000;

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
 * Ekranın ilk taslağı ilk değişiklikten bu kadar sonra yazılır: kodlayıcı (ör. exceljs) erkenden yüklenir,
 * arka plana geçişteki kodlama ARKA_PLAN_BUTCESI içinde kalır; ilk düzenlemeler de erken güvenceye alınır.
 */
export const ILK_TASLAK_MS = 3000;

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
  /** Bu ekranda en az bir kez kodlandı. */
  private kodlandi = false;

  /** Oturum kaydı işleri (yazma/silme) kendi aralarında sıralı. */
  private oturumZinciri: Promise<void> = Promise.resolve();

  constructor(
    readonly id: string,
    private kaynak: TaslakKaynagi,
    private depo: TaslakDeposu = taslakDeposu(),
    private aralik = TASLAK_ARALIGI,
    private saat: () => number = () => performance.now(),
    private oturum: OturumDeposu = oturumDeposu(),
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
    this.zaman = setTimeout(
      () => {
        this.zaman = null;
        void this.simdiYaz();
      },
      this.kodlandi ? this.aralik : Math.min(this.aralik, ILK_TASLAK_MS),
    );
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
        this.kodlandi = true;
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

  /**
   * Uygulama arka plana geçti: önce oturum kaydı (ucuz: belge, konum, görünüm durumu), sonra bekleyen
   * taslak yazılır. Süreç bundan sonra her an sonlandırılabilir (hedef: ARKA_PLAN_BUTCESI). Döner: geçen süre (ms).
   */
  async arkaPlan(gorunum?: Gorunum): Promise<number> {
    const t0 = this.saat();
    if (this.kapali) return 0;
    let b: ReturnType<TaslakKaynagi["bilgi"]> | null = null;
    try {
      b = this.kaynak.bilgi();
    } catch {
      b = null;
    }
    const taslak = this.kirli;
    const kayit: Oturum | null = b && (taslak || b.uri) ? { ekran: this.id, app: this.kaynak.app, name: b.name, uri: b.uri, taslak, gorunum, zaman: Date.now() } : null;
    // Yeni ve değişmemiş belgede geri getirilecek bir şey yok: eski kayıt da kalmasın.
    // Önce oturum (küçük, hemen diske): taslak kodlaması ana iş parçacığını meşgul edip onu geciktirmesin.
    await (this.oturumZinciri = this.oturumZinciri.then(() => (kayit ? this.oturum.yaz(kayit) : this.oturum.sil())).catch(() => {}));
    await this.simdiYaz();
    return this.saat() - t0;
  }

  /** Ekran kapandı: taslak ve (bu ekranınsa) oturum kaydı silinir, zamanlayıcı durur. */
  kapat(): void {
    this.kapali = true;
    this.durdur();
    this.sil();
    this.oturumZinciri = this.oturumZinciri
      .then(async () => {
        if ((await this.oturum.al())?.ekran === this.id) await this.oturum.sil();
      })
      .catch(() => {});
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
  async bitti(): Promise<void> {
    await Promise.all([this.zincir, this.oturumZinciri]);
  }

  get taslakVar(): boolean {
    return this.yazildi;
  }
}
