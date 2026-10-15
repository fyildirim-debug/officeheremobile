// Ekranların otomatik kurtarma bağlantısı: kaydedilmemiş değişiklik varken taslak yazılır
// (düzenleme sürerken aralıklarla, uygulama arka plana gidince hemen), kaydedilince ya da
// ekran kapanınca silinir. Arka plana geçişte oturum kaydı da (belge, konum, görünüm durumu)
// yazılır; süreç sonlanmasından sonra belge yeniden açılınca görünüm durumu burada uygulanır.
// Ayrıntılar: platform/taslak.ts, shell/gorunum.ts.
import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import type { AppKind } from "../platform";
import { ARKA_PLAN_BUTCESI, bekleyenGorunum, gorunumUygulandi, TaslakYazici, yeniTaslakKimligi } from "../platform/taslak";
import { gorunumUygula, varsayilanGorunum, type GorunumKaynagi } from "./gorunum";

export interface TaslakAyari {
  app: AppKind;
  /** Kaydedilmemiş değişiklik var mı. */
  kirli: boolean;
  /** Her değişiklikte değişen değer (sürüm sayacı, model nesnesi…). */
  surum: unknown;
  /** Kurtarılan belgede taslağın kimliği (aynı kayıt güncellenir). */
  id?: string;
  bilgi: () => { name: string; uri?: string; ek?: unknown };
  kodla: () => Promise<{ data: Uint8Array; dataName: string }>;
  /** Büyük belge: düzenlerken aralıklı yazma yapılmaz, yalnız arka plana geçişte. */
  agir?: () => boolean;
  /** Görünüm durumu (kaydırma, imleç…); verilmezse uygulamanın varsayılanı (shell/gorunum.ts). */
  gorunum?: GorunumKaynagi;
}

export function useTaslak(o: TaslakAyari): TaslakYazici {
  const ref = useRef(o);
  ref.current = o;
  const [yazici] = useState(
    () =>
      new TaslakYazici(o.id ?? yeniTaslakKimligi(), {
        app: o.app,
        bilgi: () => ref.current.bilgi(),
        kodla: () => ref.current.kodla(),
        agir: () => ref.current.agir?.() ?? false,
      }),
  );
  const [varsayilan] = useState(() => varsayilanGorunum(o.app));
  const gorunum = () => ref.current.gorunum ?? varsayilan;

  useEffect(() => {
    yazici.degisti(o.kirli);
  }, [yazici, o.kirli, o.surum]);

  // Süreç sonlanmasından dönüş: bekleyen görünüm durumu ekran hazır olunca uygulanır.
  useEffect(() => {
    let ad = "";
    try {
      ad = ref.current.bilgi().name;
    } catch {
      return;
    }
    const g = bekleyenGorunum(ref.current.app, ad);
    if (!g) return;
    // Görünüm kaynağı olmayan ekran (belge yine açılır; konum kendi kaydından gelir).
    if (!gorunum()) return gorunumUygulandi();
    return gorunumUygula(gorunum, g, gorunumUygulandi);
  }, [yazici]);

  const kapatma = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (kapatma.current) clearTimeout(kapatma.current);
    yazici.baslat();
    // Görünüm durumu senkron alınır (süreç hemen ardından dondurulabilir); oturum ve taslak sonra yazılır.
    const arkaPlan = () => {
      let g;
      try {
        g = gorunum()?.al();
      } catch {
        g = undefined;
      }
      void yazici.arkaPlan(g).then((ms) => {
        // Android'de logcat'e düşer: gerçek cihazda bütçe aşımı görülebilsin.
        if (ms > ARKA_PLAN_BUTCESI) console.warn(`[taslak] arka plana geçiş kaydı ${Math.round(ms)} ms sürdü (bütçe ${ARKA_PLAN_BUTCESI} ms).`);
      });
    };
    const gorunurluk = () => document.visibilityState === "hidden" && arkaPlan();
    document.addEventListener("visibilitychange", gorunurluk);
    window.addEventListener("pagehide", arkaPlan);
    // Android: etkinlik duraklatılınca (uygulama değiştirme, ekran kilidi, sistem iletişim kutusu) ve durunca.
    let iptal = false;
    const kaldir: (() => void)[] = [];
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app").then(({ App }) => {
        const bagla = (p: Promise<{ remove: () => Promise<void> }>) =>
          p.then((h) => {
            if (iptal) void h.remove();
            else kaldir.push(() => void h.remove());
          });
        void bagla(App.addListener("pause", arkaPlan));
        void bagla(App.addListener("appStateChange", (s) => !s.isActive && arkaPlan()));
      });
    }
    return () => {
      iptal = true;
      kaldir.forEach((f) => f());
      document.removeEventListener("visibilitychange", gorunurluk);
      window.removeEventListener("pagehide", arkaPlan);
      // StrictMode yeniden bağlamasında taslak silinmesin: kapatma bir sonraki göreve ertelenir.
      kapatma.current = setTimeout(() => yazici.kapat(), 0);
    };
  }, [yazici]);

  return yazici;
}
