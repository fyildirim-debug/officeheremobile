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
  // Geçiş katmanı (OPC; "@officehere/core/opc" ve "…/opc/xmlPart"): dizine eşlenir. Ana girişten önce
  // gelmeli, yoksa "@officehere/core" öneki alt yolu da yakalar.
  "@officehere/core/opc": v("packages/core/src/opc"),
  "@officehere/core/odf": v("packages/core/src/odf"),
  "@officehere/core": v("packages/core/src/index.ts"),
  "@officehere/formula": v("packages/formula/src/index.ts"),
  "@belge": v("apps/belge/src"),
  "@tablo": v("apps/tablo/src"),
  "@sunum": v("apps/sunum/src"),
};

export default defineConfig({
  plugins: [react(), lisansBildirimi()],
  // Paralel e2e sunucuları bağımlılık önbelleğini paylaşmasın.
  cacheDir: process.env.OH_E2E_PORT ? `node_modules/.vite-${process.env.OH_E2E_PORT}` : undefined,
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
  // Belge ve Tablo dosya G/Ç'si modül Worker'ında (vendor apps/*/src/io/io.worker.ts) çalışır.
  worker: { format: "es" },
  test: { globals: true, environment: "node", include: ["test/**/*.test.ts", "src/**/*.test.ts"] },
});
