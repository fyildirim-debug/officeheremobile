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
  /**
   * Otomatik kurtarılan taslak: data özgün biçimde değil tam doğrulukla (docx/xlsx/pptx) kodlanmıştır,
   * `dataName` ile ayrıştırılır; ad, biçim ve konum özgün belgeninkidir. Ekran kaydedilmemiş olarak açılır.
   */
  recovered?: { id: string; dataName: string; savedAt: number; ek?: unknown };
  /** Şablondan yeni belge (data === null): masaüstü şablon kimliği (ör. "letter", "budget"). */
  template?: string;
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

/** Yazdırma işi: yazdırma kökü (yalnız @media print'te görünen sayfa kopyaları) önceden kurulur. */
export interface PrintJob {
  /** İş adı; "PDF olarak kaydet"te önerilen dosya adı (uzantısız). */
  name: string;
  /** İlk sayfanın boyutu (inç): iletişim kutusunda varsayılan kâğıt ve yönlendirme. */
  page?: { width: number; height: number };
}

/** Pano içeriği: düz metin (tabloda sekmeyle ayrılmış) ve varsa HTML. */
export interface ClipContent {
  text: string;
  html?: string;
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
  /**
   * Başka uygulamadan "OfficeHere ile aç" ile gelen dosyalar ve uygulama kısayolları
   * ("Yeni belge" vb.; data === null) için dinleyici.
   */
  onExternalOpen(cb: (doc: OpenedDoc) => void): () => void;
  /**
   * Yazdırma iletişim kutusu: Android'de sistem yazdırma (yazıcı ya da "PDF olarak kaydet"),
   * tarayıcıda window.print(). İş bittiğinde (ya da vazgeçilince) döner; yazdırma kökü sonra kaldırılır.
   */
  print(job: PrintJob): Promise<void>;
  /** Sistem panosuna yazar (diğer uygulamalara yapıştırılabilir). */
  writeClipboard(c: ClipContent): Promise<void>;
  /** Sistem panosunu okur; okunamıyor ya da boşsa null. */
  readClipboard(): Promise<ClipContent | null>;
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
