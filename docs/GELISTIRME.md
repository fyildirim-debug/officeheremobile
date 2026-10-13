# OfficeHere Mobil — Geliştirme kuralları

OfficeHere Mobil, OfficeHere masaüstü uygulamalarının (Belge, Tablo, Sunum) Android
karşılığıdır. Masaüstü kodu `vendor/officehere` alt modülünden **olduğu gibi** kullanılır;
biçim okuyucu/yazıcıları, belge modelleri, slayt çizimi, ızgara çizimi, formül motoru ve
tasarım belirteçleri yeniden yazılmaz.

## Mimari

- Vite 8 + React 19 + TypeScript 7, Capacitor 8 (Android). Paket yöneticisi pnpm.
- Takma adlar (`vite.config.ts`, `tsconfig.json`):
  - `@officehere/ui`, `@officehere/core`, `@officehere/formula` → masaüstü paketleri
  - `@belge/*` → `vendor/officehere/apps/belge/src/*`, `@tablo/*`, `@sunum/*` aynı şekilde
- `vendor/officehere` altında **hiçbir dosya değiştirilmez**. Masaüstü kodunda değişiklik
  gerekiyorsa mobil tarafta sarmalayıcı yazılır.
- Yeni bağımlılık eklenmez (gerekirse izin verici lisanslı olmalı ve gerekçesi yazılmalı).

## Dizinler

| Dizin | İçerik |
| --- | --- |
| `src/App.tsx` | Ekran yönlendirme (başlangıç ↔ belge ekranı), platform kurulumu |
| `src/home/` | Başlangıç: yeni, aç, son kullanılanlar, ayarlar |
| `src/belge/`, `src/tablo/`, `src/sunum/` | Uygulama ekranları (`export default function XScreen(props: DocScreenProps)`) |
| `src/shell/` | Ortak kabuk: `AppBar`, `IconButton`, `BottomToolbar`, `ToolButton`, `Sheet`, `SheetTabs`, `toast`, `confirmDialog`, `useBackHandler`, `useTheme` |
| `src/platform/` | Dosya seçme/kaydetme/paylaşma, son kullanılanlar (web ve Android) |
| `src/styles/mobile.css` | Ortak mobil stiller (`m-` önekli sınıflar) |
| `e2e/` | Playwright testleri (Pixel 7 görünümü) |
| `android/` | Capacitor Android projesi |

## Ekran sözleşmesi

Her ekran `DocScreenProps` alır: `{ doc, platform, onClose, dark }`.

- `doc.data === null` → yeni boş belge (`Belge1.docx`, `Kitap1.xlsx`, `Sunu1.pptx`).
- Açma: masaüstünün açma işlevi (Belge `openDocument`, Tablo ve Sunum kendi `io` girişleri).
- Kaydetme: `platform.saveFile(name, bytes, mime)`. Biçim yazılabiliyorsa aynı adla,
  yazılamıyorsa (ör. `.doc`, `.xls`, `.ppt`) uzantı `docx`/`xlsx`/`pptx` yapılır ve
  kullanıcıya `toast` ile bildirilir. Paylaşma: `platform.shareFile(...)`.
- Kaydedilmemiş değişiklik varken geri: `confirmDialog` → "Kaydet" / "Kaydetme" / "Vazgeç".
- Android geri tuşu: `useBackHandler` (açık panel önce kapanır, sonra ekran).
- Yerleşim: `div.m-screen` > `AppBar` (geri, dosya adı, alt satırda uygulama adı ve kayıt
  durumu, sağda geri al / yinele / kaydet / paylaş / daha fazla) > `main.m-content` >
  `BottomToolbar` (biçimlendirme düğmeleri, ayrıntılar `Sheet` panellerinde).

## Kapsam (mobil)

- Tüm masaüstü biçimleri açılır ve doğru görüntülenir.
- Basit düzenleme: metin yazma, kalın/italik/altı çizili, yazı boyutu ve rengi, hizalama,
  listeler, başlık stilleri, geri al/yinele, bul; Tablo'da hücre değeri/formül girme ve
  temel biçim; Sunum'da metin kutusundaki metni düzenleme.
- Tablolar (Belge içi), şekiller, grafikler, resimler, SmartArt, denklemler **yalnız
  görüntülenir**; mobilde bunları ekleme/düzenleme yoktur.

## Tasarım

- Masaüstüyle aynı tasarım dili: `--oh-*` belirteçleri, Fluent simgeleri
  (`@fluentui/react-icons`), uygulama renkleri (`data-app`: Belge mavi, Tablo yeşil,
  Sunum turuncu).
- Tema: Sistem (varsayılan) / Açık (Renkli) / Açık (Beyaz) / Koyu Gri / Siyah.
- **Koyu temada sayfa da koyudur, beyaz kalmaz:** Belge sayfası masaüstünün "Koyu Sayfa"
  kuralıyla (`data-bl-page="dark"`), Tablo ızgarası koyu ızgara çizimiyle, Sunum'da beyaz
  zeminli slaytlar ekranda koyu çizilir. Yazdırma/dışa aktarma etkilenmez.
- Dokunma hedefi en az 44 px; güvenli alan (`env(safe-area-inset-*)`) dikkate alınır.
- Arayüz Türkçe; Microsoft ürün/marka adları arayüzde geçmez.

## Test

- `pnpm typecheck` (tsc), `pnpm test` (vitest), `pnpm e2e` (Playwright, Pixel 7).
- E2E yardımcıları `e2e/ortak.ts`: `start`, `openFile`, `newDoc`, `download`, `fixture`.
  Paralel çalışmada farklı port: `OH_E2E_PORT=5191 pnpm e2e e2e/belge.spec.ts`.
- `@koyu` etiketli testler koyu renk düzeninde de çalışır.

## Sürüm ve katkı

- Commit iletileri Türkçe; yazar Furkan YILDIRIM.
- Lisans MIT; üçüncü taraf bildirimleri derlemede `THIRD_PARTY_NOTICES.txt` olarak üretilir
  (`scripts/lisans.mjs`).

## Android

- Web paketini Android projesine aktarma: `pnpm build && pnpm cap:sync`
  (taze klonda Gradle'dan önce gereklidir; `capacitor-cordova-android-plugins` git dışındadır).
- Hata ayıklama APK'sı: `cd android && ./gradlew assembleDebug`
  → `android/app/build/outputs/apk/debug/app-debug.apk`.
- Simgeler ve açılış görselleri `resources/icon.svg` geometrisinden üretilir:
  `python3 resources/uret.py`.
- Dosya erişimi yalnız Android depolama erişim çerçevesiyle (belge seçici, "Birlikte aç",
  "Gönder") yapılır; manifestte internet ya da depolama izni yoktur.
- Kaydetme: açık belge aynı konuma yazılır; yeni belgede, uzantı değişiminde ve
  "Farklı kaydet"te (`saveFile(..., { saveAs: true })`) konum sorulur. Vazgeçilirse
  `AbortError` fırlar ve hata olarak gösterilmez.
- Sürüm: GitHub Actions › `release.yml` (girdi `surum`). İmza için depo gizli değerleri:
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`. Yoksa imzasız dosyalarla taslak sürüm açılır.
