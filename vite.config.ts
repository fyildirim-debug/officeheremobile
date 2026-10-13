import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { lisansBildirimi } from "./scripts/lisans.mjs";

// OfficeHere masaüstü kodu alt modülden (vendor/officehere) olduğu gibi kullanılır:
// biçim okuyucu/yazıcıları, modeller, slayt çizimi, formül motoru ve tasarım belirteçleri.
const v = (p: string) => fileURLToPath(new URL(`./vendor/officehere/${p}`, import.meta.url));

export const takmaAdlar = {
  "@officehere/ui/styles.css": v("packages/ui/src/styles/index.css"),
  "@officehere/ui": v("packages/ui/src/index.ts"),
  "@officehere/core": v("packages/core/src/index.ts"),
  "@officehere/formula": v("packages/formula/src/index.ts"),
  "@belge": v("apps/belge/src"),
  "@tablo": v("apps/tablo/src"),
  "@sunum": v("apps/sunum/src"),
};

export default defineConfig({
  plugins: [react(), lisansBildirimi()],
  // Capacitor dosyaları yerel sunucudan yükler; göreli yol her ortamda çalışır.
  base: "./",
  resolve: {
    alias: Object.entries(takmaAdlar).map(([find, replacement]) => ({ find, replacement })),
    // Alt modüldeki bileşenler de aynı React kopyasını kullanmalı.
    dedupe: ["react", "react-dom", "@tiptap/pm", "@tiptap/core"],
  },
  // Android parçası ilk yüklendiğinde bağımlılık iyileştirmesi sayfayı yenilemesin.
  optimizeDeps: { include: ["@capacitor/app", "@capacitor/filesystem", "@capacitor/keyboard", "@capacitor/share", "@capacitor/status-bar"] },
  server: { port: 5180, strictPort: true, host: true },
  preview: { port: 5180, strictPort: true, host: true },
  build: { target: "es2022", chunkSizeWarningLimit: 6000 },
  test: { globals: true, environment: "node", include: ["test/**/*.test.ts", "src/**/*.test.ts"] },
});
