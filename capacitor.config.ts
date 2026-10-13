import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.officehere.mobile",
  appName: "OfficeHere",
  webDir: "dist",
  android: {
    // Dosyalar yerel olarak işlenir; uygulama ağ isteği yapmaz.
    allowMixedContent: false,
  },
  plugins: {
    Keyboard: { resize: "native" },
  },
};

export default config;
