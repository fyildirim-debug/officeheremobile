import type { CapacitorConfig } from "@capacitor/cli";
import type { KeyboardResize } from "@capacitor/keyboard";

const config: CapacitorConfig = {
  appId: "com.officehere.mobile",
  appName: "OfficeHere",
  webDir: "dist",
  android: {
    // Dosyalar yerel olarak işlenir; uygulama ağ isteği yapmaz (AndroidManifest'te INTERNET izni yok).
    allowMixedContent: false,
    // En düşük Android System WebView (Chromium) ana sürümü. Derleme hedefi es2022 (sınıf statik blokları,
    // `#alan in nesne` → Chromium 94); kod ayrıca structuredClone (98) ve Array.prototype.findLast (97)
    // kullanır, yani 98 altı WebView'de uygulama beyaz ekranda kalır. Daha eski sürümde Capacitor Logcat'e
    // hata yazar; kullanıcıya index.html'deki satır içi denetim "Android System WebView'i güncelleyin"
    // iletisini ve Play Store bağlantısını gösterir (minSdk 24 / Android 7 cihazlar da bu sürüme güncellenebilir).
    minWebViewVersion: 98,
  },
  plugins: {
    // Android'de pencere yerelde yeniden boyutlanır (adjustResize + SystemBars klavye boşluğu).
    Keyboard: { resize: "native" as KeyboardResize },
    // index.html viewport-fit=cover: güvenli alan boşlukları CSS env(safe-area-inset-*) ile.
    SystemBars: { insetsHandling: "css", initialViewportFitValueHint: "cover" },
  },
};

export default config;
