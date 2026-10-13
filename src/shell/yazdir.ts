// Yazdırma ve PDF: ekranlar masaüstünün yazdırma kökünü (Belge buildPrintRoot, Tablo preparePrint,
// Sunum PrintRoot) kurar, platform.print sistem yazdırma iletişim kutusunu açar (Android'de yazıcı
// ya da "PDF olarak kaydet"; tarayıcıda window.print), iş bitince kök kaldırılır.
import type { Platform, PrintJob } from "../platform";
import { toast } from "./feedback";

/** Menülerdeki ad ve açıklama (üç uygulamada aynı). */
export const YAZDIR_ETIKETI = "Yazdır / PDF";
export const YAZDIR_IPUCU = "Yazıcı seçin ya da PDF olarak kaydedin";

/** İki çizim karesi bekler (düzen ve ölçüm otursun). */
export const kareler = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** Piksel (96 dpi) → inç. */
export const inc = (px: number) => Math.round((px / 96) * 1000) / 1000;

/** Yazdırma iletişim kutusunu açar; hata bildirilir. İş bittiğinde (ya da vazgeçilince) döner. */
export async function yazdirmaAc(platform: Platform, job: PrintJob): Promise<boolean> {
  try {
    await platform.print(job);
    return true;
  } catch (e) {
    toast(`Yazdırılamadı: ${(e as Error)?.message || e}`, "error");
    return false;
  }
}

/** Donanım klavyesinde Ctrl+P (Cmd+P) mı. */
export const yazdirKisayolu = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === "KeyP";
