# Hukuki çerçeve

OfficeHere Mobil, [OfficeHere](https://github.com/fyildirim-debug/officehere)
masaüstü paketinin Android sürümüdür ve aynı hukuki çerçeveye tabidir. Temiz oda
ilkesi, dosya biçimleri, arayüz ve marka kuralları için masaüstü deposundaki
[HUKUKI.md](https://github.com/fyildirim-debug/officehere/blob/main/HUKUKI.md)
belgesi geçerlidir; bu belge yalnız mobile özgü noktaları ekler.

> Bu belge hukuki danışmanlık değildir. Uygulamayı ticari olarak dağıtmadan önce
> bir avukata danışmanız önerilir.

## Kod

- Belge, tablo ve sunu okuyucu/yazıcıları, çizim ve formül motoru masaüstü
  deposundan git alt modülü (`vendor/officehere`) olarak **değiştirilmeden**
  kullanılır. Mobil kabuk (ekranlar, dokunmatik etkileşim, Android katmanı) bu
  depoda sıfırdan yazılmıştır.
- Tüm bağımlılıklar izin verici lisanslıdır (MIT, ISC, BSD, Apache-2.0 vb.).
  Derleme sırasında pakete giren her bileşenin lisansı denetlenir; izin
  verilmeyen ya da belirsiz lisans bulunursa derleme durur
  (`scripts/lisans.mjs`). Lisans metinleri uygulamada
  **Ayarlar › Üçüncü taraf yazılım bildirimleri** altında yer alır.
- Android kabuğu: Capacitor (MIT) ve AndroidX kütüphaneleri (Apache-2.0).

## Marka

- Arayüzde Microsoft ürün adları (Word, Excel, PowerPoint, Office) ve logoları
  kullanılmaz. Dosya uzantıları (`.docx`, `.xlsx`, `.pptx`) birlikte
  çalışabilirliği anlatmak için serbesttir.
- Uygulama simgesi ve dosya türü simgeleri bu projeye özgüdür.
- Android, Google LLC'nin ticari markasıdır; yalnız uygulamanın çalıştığı
  platformu belirtmek için anılır.

## Gizlilik

OfficeHere Mobil hesap istemez, internet bağlantısı kullanmaz, reklam ya da
analitik içermez. Belgeler yalnız kullanıcının seçtiği konumda, cihazda kalır.
Uygulama yalnız kullanıcının açtığı ya da kaydettiği dosyalara erişir (Android
depolama erişim çerçevesi); genel depolama izni istemez.
