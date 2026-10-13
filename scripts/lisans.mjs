// Mobil derleme için üçüncü taraf lisans bildirimi.
// Masaüstündeki eklentinin (vendor/officehere/scripts/lisans-bildirimi.mjs) toplama ve
// metin üretme işlevlerini kullanır; yalnız derleyicinin sanal modüllerini (\0vite/…,
// \0rolldown/…) bu deponun pnpm deposundaki gerçek paket dizinlerine çevirir.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bildirimMetni, kayitlariTopla, lisansIzinli } from "../vendor/officehere/scripts/lisans-bildirimi.mjs";

const KOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SANAL = /^\0(vite|rolldown)\//;

/** Paketin bu depodaki dizini: önce doğrudan bağımlılık, sonra pnpm deposu. */
function paketDizini(ad) {
  const dogrudan = path.join(KOK, "node_modules", ad);
  if (fs.existsSync(path.join(dogrudan, "package.json"))) return fs.realpathSync(dogrudan);
  const depo = path.join(KOK, "node_modules/.pnpm");
  let girdiler = [];
  try {
    girdiler = fs.readdirSync(depo);
  } catch {
    return null;
  }
  for (const g of girdiler.filter((x) => x.startsWith(`${ad.replace("/", "+")}@`)).sort().reverse()) {
    const d = path.join(depo, g, "node_modules", ad);
    if (fs.existsSync(path.join(d, "package.json"))) return d;
  }
  return null;
}

/** Sanal modül kimliğini gerçek paket dosyası yoluna çevirir; diğerlerini olduğu gibi bırakır. */
export function kimligiCevir(id) {
  const sanal = SANAL.exec(id)?.[1];
  if (!sanal) return id;
  const d = paketDizini(sanal);
  return d ? path.join(d, "package.json").replace(/\\/g, "/") : id;
}

/** Android kabuğuna giren yerel kütüphaneler (Gradle bağımlılıkları; hepsi Apache-2.0). */
const YEREL = [
  "AndroidX (androidx.appcompat, androidx.core, androidx.coordinatorlayout, androidx.activity, androidx.webkit, androidx.core-splashscreen) — Apache-2.0 — https://developer.android.com/jetpack/androidx",
  "Capacitor Android (com.capacitorjs:core) — MIT — https://github.com/ionic-team/capacitor",
];

export function lisansBildirimi() {
  return {
    name: "officehere-mobil-lisans-bildirimi",
    apply: "build",
    generateBundle(_secenek, paket) {
      const kimlikler = new Set();
      for (const parca of Object.values(paket)) {
        if (parca.type !== "chunk") continue;
        for (const id of parca.moduleIds ?? Object.keys(parca.modules ?? {})) kimlikler.add(kimligiCevir(id));
      }
      const { kayitlar, eksik } = kayitlariTopla(kimlikler);
      const yasak = kayitlar.filter((k) => !lisansIzinli(k.lisans));
      if (yasak.length) this.error(`İzin verilmeyen ya da belirsiz lisans: ${yasak.map((k) => `${k.ad} (${k.lisans || "lisans yok"})`).join(", ")}. Bkz. HUKUKI.md.`);
      if (eksik.length) this.error(`Lisans metni bulunamadı: ${eksik.join(", ")}.`);
      const ek = ["", "=".repeat(78), "Android yerel bileşenleri / Android native components", "-".repeat(78), ...YEREL].join("\n");
      this.emitFile({ type: "asset", fileName: "THIRD_PARTY_NOTICES.txt", source: bildirimMetni(kayitlar, "OfficeHere Mobil") + ek + "\n" });
    },
  };
}
