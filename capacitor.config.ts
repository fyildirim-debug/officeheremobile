import type { CapacitorConfig } from "@capacitor/cli";
import type { KeyboardResize } from "@capacitor/keyboard";

const config: CapacitorConfig = {
  appId: "com.officehere.mobile",
  appName: "OfficeHere",
  webDir: "dist",
  android: {
    // Dosyalar yerel olarak işlenir; uygulama ağ isteği yapmaz (AndroidManifest'te INTERNET izni yok).
    allowMixedContent: false,
  },
  plugins: {
    // Android'de pencere yerelde yeniden boyutlanır (adjustResize + SystemBars klavye boşluğu).
    Keyboard: { resize: "native" as KeyboardResize },
    // index.html viewport-fit=cover: güvenli alan boşlukları CSS env(safe-area-inset-*) ile.
    SystemBars: { insetsHandling: "css", initialViewportFitValueHint: "cover" },
  },
};

export default config;
