// Tablo panosu: masaüstü kopyala/kes/yapıştır eylemleri (biçim ve formüllerle uygulama içi pano) ve
// sistem panosu (diğer uygulamalara düz metin/HTML; Android'de yerel pano eklentisiyle).
import type { Controller } from "@tablo/controller";
import { copySelection, pasteData } from "@tablo/actions/edit";
import { getInternalClipboard } from "@tablo/model/clipboard";
import type { Platform } from "../platform";
import { toast } from "../shell/feedback";

/** Seçimi kopyalar ya da keser; seçim panoda kesik çizgiyle gösterilir. */
export async function kopyala(ctl: Controller, platform: Pick<Platform, "writeClipboard">, kes: boolean): Promise<boolean> {
  if (ctl.edit && !ctl.commitEdit(null)) return false;
  const d = copySelection(ctl, kes);
  if (!d) return false;
  ctl.status = "";
  await platform.writeClipboard({ text: d.tsv, html: d.html });
  toast(kes ? "Kesildi. Hedef hücreyi seçip Yapıştır'a dokunun." : "Kopyalandı.");
  return true;
}

/** Yapıştırır: panodaki içerik bu uygulamadan geldiyse biçim ve formüllerle, değilse metin/HTML tablo olarak. */
export async function yapistir(ctl: Controller, platform: Pick<Platform, "readClipboard">): Promise<void> {
  if (ctl.edit && !ctl.commitEdit(null)) return;
  const c = await platform.readClipboard();
  const text = c?.text ?? "";
  const html = c?.html;
  // Sistem panosu okunamazsa (izin yok) uygulama içi pano kullanılır.
  if (!text && !html && !getInternalClipboard()) {
    toast("Pano boş.");
    return;
  }
  pasteData(ctl, text, html);
}

/** Pano (kesik çizgi) modunu bitirir; bir şey değiştiyse true. */
export function panoyuBirak(ctl: Controller): boolean {
  if (!ctl.clip) return false;
  ctl.clip = null;
  ctl.status = "";
  ctl.emit();
  return true;
}
