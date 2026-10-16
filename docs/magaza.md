# Google Play: mağaza kaydı, gizlilik beyanı ve kapalı test

Bu belge OfficeHere Mobil'in Google Play'e çıkışı için hazırlanmış metinleri, beyan taslaklarını ve
adımları toplar. Metinler Türkçedir ve Microsoft ürün/marka adı içermez (bkz. [HUKUKI.md](../HUKUKI.md)).
Play Console'daki alan ve seçenek adları zamanla değişebilir; burada geçen adlar 2026 sonbaharındaki
karşılıklarıdır, girişte doğrulanmalıdır.

> Bu belge hukuki danışmanlık değildir.

## 1. Paket bilgileri

| Alan | Değer |
| --- | --- |
| Paket adı (applicationId) | `com.officehere.mobile` (Play'e ilk yüklemeden sonra değiştirilemez) |
| Hedef API (targetSdk) | 36 (Android 16). 31.08.2026'dan beri yeni uygulamalar için zorunlu düzey |
| En düşük sürüm (minSdk) | 24 (Android 7.0); ayrıca Android System WebView 98+ |
| İzinler | **Yok** (aşağıda §4.1) |
| versionCode | `MAJOR × 1 000 000 + MINOR × 1 000 + PATCH` (0.2.0 → 2000). Ön sürüm yalnız X.Y.0 için: `X.Y.0-beta.N` → X.Y.0 kodu − 100 + N (0.2.0-beta.1 → 1901), böylece kararlı X.Y.0 betanın üzerine kurulur. Play her yüklemede daha büyük versionCode ister: aynı sürüm numarası ikinci kez yüklenemez |
| Paket türü | Android App Bundle (`.aab`); GitHub Sürümü ve IzzyOnDroid için ayrıca `.apk` |

## 2. Mağaza girişi (Ana mağaza girişi)

**Uygulama adı** (en çok 30 karakter; 29):

```
OfficeHere: Belge Tablo Sunum
```

**Kısa açıklama** (en çok 80 karakter; 78):

```
Hesapsız, reklamsız, internetsiz: belge, tablo ve sunuyu telefonda düzenleyin.
```

**Uzun açıklama** (en çok 4000 karakter):

```
OfficeHere; belge, tablo ve sunuları telefonunuzda açıp düzenlemeniz için yapılmış, açık kaynaklı ve tamamen Türkçe bir ofis paketidir.

Hesap yok · Reklam yok · Abonelik yok · Yapay zekâ yok · İnternet izni yok · Tamamen Türkçe

Dosyalarınız cihazınızda kalır. Uygulama internete bağlanmaz (internet izni bile istemez), hesap açtırmaz, reklam göstermez, kullanımınızla ilgili hiçbir veri toplamaz. Yalnız sizin seçtiğiniz ya da "Birlikte aç" ile gönderdiğiniz dosyalara erişir.

BELGE
• .docx, .doc, .odt, .rtf, .md, .txt ve .html dosyalarını açar; .docx, .odt, .rtf, .md, .txt ve .html olarak kaydeder
• Sayfa görünümü ya da metnin ekrana aktığı mobil görünüm, yakınlaştırma
• Kalın, italik, altı çizili; yazı tipi, boyut ve renk; vurgu, hizalama, listeler, girinti, stiller
• Bul ve değiştir, sözcük sayısı
• Tablolar, resimler, grafikler, şekiller ve denklemler dosyadaki gibi görünür

TABLO
• .xlsx, .xlsm, .xls, .ods, .csv ve .tsv dosyaları
• Dokunmatik ızgara: kaydırma, iki parmakla yakınlaştırma, uzun basıp aralık seçme
• Türkçe işlev adlarıyla formüller: TOPLA, EĞER, DÜŞEYARA ve yüzlercesi
• Otomatik Toplam; kes, kopyala ve yapıştır (diğer uygulamalarla da)
• Yazı tipi, renkler, kenarlıklar, hücre birleştirme, sayı biçimleri
• Sıralama ve filtre, bölmeleri dondurma, sayfa ekleme ve yeniden adlandırma

SUNUM
• .pptx, .pptm, .ppt, .odp ve slayt gösterisi dosyaları
• Küçük resimlerle gezinme, konuşmacı notları
• Geçişli ve animasyonlu slayt gösterisi; kalem, vurgulayıcı, silgi ve lazer işaretçisi
• Metin kutularında yazma ve biçimleme; slayt ekleme, çoğaltma, taşıma, gizleme

HER ÜÇÜNDE
• Yazdırma ya da "PDF olarak kaydet"
• Otomatik kurtarma: kaydetmeyi unutsanız ya da telefon uygulamayı arka planda kapatsa da belgeniz kaldığınız yerden açılır
• Açtığınız dosya aynı yere kaydedilir; paylaşma ve "Farklı kaydet"
• Dosya yöneticisi, e-posta ve mesajlaşma uygulamalarından "Birlikte aç"
• Mektup, dilekçe, özgeçmiş, bütçe, fatura, sunu şablonları
• Koyu tema: belge sayfaları, tablo hücreleri ve slaytlar da koyu görünür; kaydedilen dosya değişmez
• Simgeye uzun basınca "Yeni belge", "Yeni tablo", "Yeni sunu"

AÇIK KAYNAK
OfficeHere, MIT lisanslı bir açık kaynak projesidir. Kaynak kodu: github.com/fyildirim-debug/officeheremobile
Windows ve Linux için masaüstü sürümü: github.com/fyildirim-debug/officehere

Android 7.0 ve üstünde çalışır. Hata bildirimi ve önerileriniz için mağaza sayfasındaki iletişim adresini kullanabilirsiniz.
```

**Kategori:** Verimlilik. **Etiketler** (Play'in önerdiği listeden): Belge düzenleyici, Elektronik tablo,
Sunum, Ofis.

**İletişim:** e-posta zorunludur ve mağazada herkese açık görünür (Furkan seçer); web sitesi isteğe bağlı
(depo adresi ya da furkanyildirim.com).

**Görseller:**

| Görsel | Durum |
| --- | --- |
| Simge 512 × 512 | Hazır: `resources/play-store-icon-512.png` |
| Öne çıkan grafik 1024 × 500 | **Yok**, üretilmeli |
| Telefon ekran görüntüleri (2-8) | `docs/ekran/*.png` 540 × 1098 (oran 2,03) Play sınırını aşıyor: uzun kenar kısa kenarın en çok 2 katı olabilir. 1080 × 1920 (ya da 540 × 1080) yeniden alınmalı; tanıtım için en az 4 tanesi 1080 piksel ve üstü önerilir |

## 3. Veri güvenliği formu (taslak yanıtlar)

Play'in tanımında "toplama", verinin cihazdan dışarı gönderilmesidir. Uygulamanın internet izni yoktur,
hiçbir veriyi cihazdan çıkaramaz; yalnız cihazda işlenen veri toplama sayılmaz.

| Soru | Yanıt |
| --- | --- |
| Uygulamanız gerekli kullanıcı veri türlerinden herhangi birini topluyor ya da paylaşıyor mu? | **Hayır** |
| (Hayır yanıtında diğer sorular sorulmaz.) | |

Cihazda kalan veriler (gizlilik politikasında açıklanır, formda beyan edilmez):

- Kullanıcının açtığı ve kaydettiği belgeler: yalnız seçtiği konumda (Android depolama erişim çerçevesi).
- Son kullanılan dosyaların adı ve konumu, tema ve görünüm tercihleri (uygulamanın yerel deposu).
- Otomatik kurtarma taslakları ve son oturum kaydı (açık belge, kaydırma konumu, imleç): uygulamanın yerel
  veritabanı. Belge kaydedilince ya da kapatılınca silinir; en çok 5 taslak tutulur.
- Android yedeklemesi kapalıdır (`allowBackup="false"`): bu veriler bulut yedeğine de girmez.

## 4. Gizlilik

### 4.1 İzinlerin doğrulanması

- `android/app/src/main/AndroidManifest.xml`'de `uses-permission` yoktur; `src/platform/native.test.ts`
  bunu her test koşusunda denetler.
- Birleştirilmiş yayın manifestinde (eklentiler ve AndroidX dahil) tek izin
  `com.officehere.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`'dır: AndroidX'in uygulamanın kendi
  dinamik alıcılarını korumak için tanımladığı, yalnız aynı imzalı uygulamaya verilen iç izin. Kullanıcıya
  sorulmaz, veri erişimi sağlamaz.
- `android.permission.INTERNET` **yoktur**. Capacitor web içeriğini yerel `https://localhost` şemasıyla
  diskteki paketten yükler; ağ kullanmaz.
- `.github/workflows/release.yml` her sürüm paketinde `aapt2 dump permissions` ile izinleri denetler;
  yukarıdaki iç izin dışında bir izin görünürse (ör. yeni bir eklenti INTERNET eklerse) derleme durur.

### 4.2 Gizlilik politikası (yayımlanacak metin, taslak)

Play tüm uygulamalar için herkese açık bir gizlilik politikası adresi ister. Aşağıdaki metin bir web
sayfasında (ör. furkanyildirim.com ya da GitHub Pages) yayımlanıp adresi Play Console › Uygulama içeriği ›
Gizlilik politikası alanına girilmelidir.

```
OfficeHere Mobil Gizlilik Politikası
Son güncelleme: <tarih>

OfficeHere Mobil ("uygulama"), Furkan YILDIRIM tarafından geliştirilen açık kaynaklı bir ofis uygulamasıdır.

Toplanan veri yok. Uygulama hesap istemez, internete bağlanmaz ve internet izni istemez. Reklam, analitik, hata raporlama ya da başka bir üçüncü taraf hizmeti içermez. Hiçbir kişisel veri, belge içeriği ya da kullanım bilgisi cihazınızdan dışarı gönderilmez, geliştiriciyle ya da üçüncü kişilerle paylaşılmaz.

Belgeleriniz. Uygulama yalnız sizin seçtiğiniz ya da başka bir uygulamadan "Birlikte aç" / "Gönder" ile ilettiğiniz dosyaları açar ve yalnız sizin seçtiğiniz konuma kaydeder. Bunun için Android'in belge seçicisi kullanılır; genel depolama izni istenmez.

Cihazda tutulan bilgiler. Uygulama çalışabilmek için şu bilgileri yalnız cihazınızda, uygulamanın kendi alanında saklar: son kullanılan dosyaların adı ve konumu; tema ve görünüm tercihleri; kaydedilmemiş değişikliklerin kaybolmaması için otomatik kurtarma taslakları ve açık belgenin konumu (kaydırma, imleç). Taslaklar belge kaydedilince ya da kapatılınca silinir. Bu bilgiler Android yedeklemesine dahil edilmez. Uygulamayı kaldırdığınızda ya da Android ayarlarından uygulama verilerini temizlediğinizde tümü silinir.

Paylaşma ve yazdırma. "Paylaş" ya da "Yazdır" dediğinizde dosya, sizin seçtiğiniz uygulamaya ya da Android'in yazdırma hizmetine verilir; o uygulamaların gizlilik koşulları geçerlidir.

Çocuklar. Uygulama hiçbir kullanıcıdan, çocuklar dahil, veri toplamaz.

Değişiklikler. Bu politika değişirse güncel hâli bu sayfada yayımlanır.

İletişim: <e-posta adresi>
```

### 4.3 Diğer "Uygulama içeriği" beyanları (taslak)

| Beyan | Yanıt |
| --- | --- |
| Reklamlar | Uygulama reklam içermiyor |
| Uygulama erişimi | Tüm işlevler özel erişim (giriş, üyelik) olmadan kullanılabilir |
| İçerik derecelendirmesi (IARC anketi) | Kategori: yardımcı program/verimlilik. Şiddet, cinsellik, küfür, kumar, madde yok; kullanıcılar arası iletişim ya da içerik paylaşımı yok (paylaşma Android paylaşım penceresiyle başka uygulamaya); konum paylaşımı ve dijital satın alma yok. Beklenen: Herkes / 3+ |
| Hedef kitle | 13 yaş ve üzeri önerilir. 13 yaş altını seçmek "Aileler" politikası incelemesini başlatır (uygulama veri toplamadığı için uyumlu olsa da ek inceleme ve beyan gerekir) |
| Reklam kimliği | Kullanılmıyor (Google Play hizmetleri yok) |
| Haber, sağlık, finans, devlet uygulaması | Hayır |
| Hesap silme | Uygulama hesap oluşturmuyor: gerekmez |
| Veri güvenliği | §3 |

## 5. İmza anahtarı ve CI

- Anahtar üretimi (bir kez, çevrimdışı bir bilgisayarda):

  ```
  keytool -genkeypair -v -keystore officehere.jks -alias officehere -keyalg RSA -keysize 4096 -validity 10000
  ```

  Play anahtarın 22.10.2033'ten sonra da geçerli olmasını ister; 10 000 gün bunu karşılar.
- **Yedek:** `.jks` dosyası ve parolalar en az iki ayrı çevrimdışı yerde (ör. şifreli USB bellek ve parola
  yöneticisi). Anahtar kaybolursa aynı paket adıyla güncelleme yayımlanamaz; Android geliştirici
  doğrulaması (2027'de tüm ülkelerde) paket adını bu anahtarla birlikte kaydeder. Anahtar ve parolalar
  depoya **asla** girmez (`android/.gitignore`: `*.jks`, `*.keystore`, `keystore.properties`).
- GitHub › Settings › Secrets and variables › Actions gizli değerleri: `ANDROID_KEYSTORE_BASE64`
  (`base64 -w0 officehere.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
  Dördü birden yoksa paketler imzasız üretilir (dosya adında `-imzasiz`, sürüm taslak açılır); hata ayıklama
  anahtarıyla imzalı yayın paketi üretilmez. Yerelde aynı ayar `android/keystore.properties` ya da
  `OH_KEYSTORE_FILE`/`OH_KEYSTORE_PASSWORD`/`OH_KEY_ALIAS`/`OH_KEY_PASSWORD` ortam değişkenleriyle;
  eksik değer varsa derleme açık bir iletiyle durur.
- **Play uygulama imzalama:** Play, kullanıcıya giden paketi kendi sakladığı "uygulama imzalama anahtarı"yla
  yeniden imzalar; geliştiricinin yüklediği AAB'yi imzalayan anahtar "yükleme anahtarı"dır.
  - Önerilen: anahtarı Play'e kendiniz verin (Play Console'da "Java KeyStore'dan anahtarı dışa aktar ve
    yükle", PEPK aracıyla) ve aynı anahtarı yükleme anahtarı olarak da kullanın. Böylece Play'den, GitHub
    Sürümünden ve IzzyOnDroid'den kurulan paketlerin imzası aynı olur; kullanıcı kanallar arasında
    kaldırmadan güncelleyebilir.
  - Google'ın ürettiği anahtarı seçerseniz Play kurulumları farklı imzalı olur: GitHub/IzzyOnDroid APK'sı
    Play kurulumunun üzerine kurulamaz (önce kaldırmak gerekir). Bu kalıcı bir seçimdir.
- İmza sertifikasının SHA-256 parmak izi her imzalı sürüm derlemesinde iş akışı özetine yazılır (Play
  Console ve geliştirici doğrulaması kaydında sorulur). Yerelde: `keytool -list -v -keystore officehere.jks`.

**Paket üretimi:** GitHub › Actions › **Sürüm** › Run workflow.

| Girdi | Sonuç |
| --- | --- |
| `surum: 0.2.0`, `github_surumu: true` | Etiket `v0.2.0` + GitHub Sürümü (APK ve AAB) + artefaktlar |
| `surum: 0.2.0-beta.1`, `github_surumu: true` | Etiket `v0.2.0-beta.1` + GitHub'da "Pre-release" (APK ve AAB; versionCode 1901) |
| `surum: 0.2.1`, `github_surumu: false` | Yalnız artefaktlar; Play kapalı test derlemesi için |
| `surum: deneme` | package.json sürümüyle yalnız artefaktlar (derleme denemesi; versionCode yayımlanmış sürümle aynı olduğundan Play'e yüklenemez) |

Play'e yüklenecek dosya `officehere-android-aab-<sürüm>` artefaktındaki `.aab`'dir. İş akışı yayın
paketlerinde imzayı (APK ve AAB aynı anahtar), izinleri ve versionCode'u doğrular.

## 6. Kapalı test (kişisel hesap: en az 12 kişi, kesintisiz 14 gün)

13.11.2023'ten sonra açılan kişisel geliştirici hesaplarında üretime çıkmadan önce kapalı testte en az
12 test kullanıcısının son 14 gün boyunca kesintisiz katılmış olması gerekir.

1. Play Console'da uygulamayı oluşturun (varsayılan dil Türkçe, uygulama, ücretsiz).
2. "Uygulamanızı ayarlayın" görevlerini tamamlayın: gizlilik politikası adresi (§4.2), uygulama erişimi,
   reklamlar, içerik derecelendirmesi, hedef kitle, veri güvenliği (§3, §4.3) ve mağaza girişi (§2).
3. Test › Kapalı test: bir kanal açın (ör. "Kapalı test"). Test kullanıcılarını e-posta listesi ya da Google
   Grubu olarak ekleyin. **12 değil 15-20 kişi** önerilir: biri ayrılırsa sayı 12'nin altına düşer ve süre
   baştan başlar.
4. İlk sürüm: Actions › Sürüm (`github_surumu: false` ya da yayımlanacak sürüm) → `.aab` artefaktını
   yükleyin, Türkçe sürüm notu yazın, incelemeye gönderin (inceleme birkaç gün sürebilir).
5. Onaydan sonra kanalın katılım bağlantısını test kullanıcılarına gönderin. Her kişi bağlantıyı açıp
   **telefondaki Google hesabıyla** katılmalı ve uygulamayı Play'den kurmalıdır.
6. 14 gün boyunca kullanıcıların katılımda kalmasını sağlayın; arada güncelleme yayımlamak (yeni sürüm
   numarasıyla) ve geri bildirime yanıt vermek üretim başvurusunda olumlu sayılır.
7. 14 gün dolunca Kontrol paneli › **Üretime erişim başvurusu**: test sürecini, gelen geri bildirimi ve
   yapılan değişiklikleri anlatan sorular yanıtlanır; inceleme yaklaşık bir hafta sürebilir.
8. Erişim verilince üretim sürümü: önce kademeli yayın (ör. %20) önerilir.

**Test kullanıcılarına gönderilecek kısa not (örnek):**

```
OfficeHere Mobil kapalı testine katıldığınız için teşekkürler. Lütfen 14 gün boyunca testten ayrılmayın.
Özellikle şunları deneyin: telefonunuzdaki .docx/.xlsx/.pptx dosyalarını açma, düzeltip aynı yere kaydetme;
Tablo'da sayı girişi; bir belgede yazarken başka uygulamaya geçip saatler sonra geri dönme (belge kaldığı
yerde açılmalı). Sorunları ekran görüntüsüyle <iletişim adresi>'ne ya da Play'deki özel geri bildirimle iletin.
```

## 7. Furkan'ın yapacakları (sıralı)

1. Play Console hesabı ($25, tek sefer), kimlik doğrulaması.
2. İmza anahtarını üretip çevrimdışı yedekleyin (§5); dört gizli değeri GitHub'a girin.
3. Uygulamayı oluştururken uygulama imzalama seçimini yapın (§5, önerilen: kendi anahtarınız).
4. Gizlilik politikasını (§4.2) bir adreste yayımlayın; iletişim e-postasını belirleyin.
5. Görseller: öne çıkan grafik (1024 × 500) ve oranı 2:1'i aşmayan ekran görüntüleri (§2).
6. Uygulama içeriği beyanları (§3, §4.3) ve mağaza girişi (§2).
7. 15-20 kişilik test listesi (K14); kapalı test kanalı ve ilk AAB (§6).
8. Gerçek cihaz denemesi (yayından önce, plan §4.2 madde 8): klavye matrisi (Gboard, Samsung, SwiftKey,
   Bluetooth) ve süreç sonlanması:
   - Belge açıp yazın, imleci bir sözcüğün ortasına koyun, ana ekrana dönün;
     `adb shell am kill com.officehere.mobile` (yalnız arka plandaki süreci sonlandırır) ya da
     Geliştirici seçenekleri › "Etkinlikleri tutma" (Don't keep activities) seçeneğini açın; son kullanılanlardan uygulamaya dönün: belge
     kaydedilmemiş değişikliklerle, aynı kaydırma konumunda ve imleç yerinde açılmalı.
   - Son kullanılanlardan kaydırıp kapattıktan sonra açılışta başlangıç ekranı gelmeli, taslak "Kurtarılan
     dosyalar"da durmalı.
   - `adb logcat | grep taslak`: arka plana geçiş kaydı 1 sn'yi aşarsa uyarı yazılır.
9. 14 gün sonunda üretime erişim başvurusu (§6.7); "yayınla" kararı.
