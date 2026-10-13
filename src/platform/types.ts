// Ekranlar ile platform katmanı arasındaki sözleşme. Belge, Tablo ve Sunum
// ekranları dosya açma/kaydetme/paylaşma için YALNIZ bu arayüzü kullanır.

export type AppKind = "belge" | "tablo" | "sunum";

/** Açılan ya da yeni oluşturulan belge. */
export interface OpenedDoc {
  /** Uzantılı dosya adı (ör. "rapor.docx"); yeni belgede "Belge1.docx" gibi. */
  name: string;
  /** Dosya baytları; yeni boş belgede null. */
  data: ArrayBuffer | null;
  /** Hangi uygulamada açılacağı. */
  app: AppKind;
  /** Cihazdaki kaydedilmiş konum (yeniden kaydetmek için); yoksa yeni/geçici belge. */
  uri?: string;
}

export interface SaveOptions {
  /** Farklı kaydet: aynı ad olsa da kullanıcıya konum sorulur. */
  saveAs?: boolean;
}

/** Kaydetme sonucu. */
export interface SavedFile {
  name: string;
  uri?: string;
}

export interface RecentFile {
  name: string;
  app: AppKind;
  /** Yeniden açmak için konum (masaüstü yolu değil; cihaz dosya adresi). */
  uri?: string;
  openedAt: number;
  pinned?: boolean;
}

export interface Platform {
  /** Capacitor (Android) içinde mi? */
  native: boolean;
  /** Kullanıcıya dosya seçtirir; iptalde null. accept: ".docx,.odt" gibi. */
  pickFile(accept: string): Promise<OpenedDoc | null>;
  /**
   * Belgeyi kaydeder: açık belgenin konumuna yazar, yeni belgede konum sorar; web'de indirir.
   * saveAs: aynı ad olsa da konum sorulur (Farklı kaydet). Kullanıcı vazgeçerse
   * name === "AbortError" olan bir hata fırlatılır (hata olarak gösterilmez).
   */
  saveFile(name: string, bytes: Uint8Array, mime: string, opts?: SaveOptions): Promise<SavedFile>;
  /** Paylaşım sayfasını açar (WhatsApp, e-posta, Drive…); web'de indirir. */
  shareFile(name: string, bytes: Uint8Array, mime: string): Promise<void>;
  /** Son kullanılanlar (en yeni önce, sabitlenenler başta). */
  recent(): Promise<RecentFile[]>;
  addRecent(f: Omit<RecentFile, "openedAt">): Promise<void>;
  removeRecent(name: string, uri?: string): Promise<void>;
  pinRecent(name: string, uri: string | undefined, pinned: boolean): Promise<void>;
  /** Son kullanılan dosyayı yeniden açar; dosya yoksa null. */
  openRecent(f: RecentFile): Promise<OpenedDoc | null>;
  /** Başka uygulamadan "OfficeHere ile aç" ile gelen dosyalar için dinleyici. */
  onExternalOpen(cb: (doc: OpenedDoc) => void): () => void;
}

/** Her belge ekranının aldığı özellikler. */
export interface DocScreenProps {
  doc: OpenedDoc;
  platform: Platform;
  /** Giriş ekranına dön (kaydedilmemiş değişiklik sorusunu ekran kendisi sorar). */
  onClose: () => void;
  /** Koyu tema etkin mi (sayfa/ızgara koyu çizilir). */
  dark: boolean;
}
