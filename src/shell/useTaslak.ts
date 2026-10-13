// Ekranların otomatik kurtarma bağlantısı: kaydedilmemiş değişiklik varken taslak yazılır
// (düzenleme sürerken aralıklarla, uygulama arka plana gidince hemen), kaydedilince ya da
// ekran kapanınca silinir. Ayrıntılar: platform/taslak.ts.
import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import type { AppKind } from "../platform";
import { TaslakYazici, yeniTaslakKimligi } from "../platform/taslak";

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

  useEffect(() => {
    yazici.degisti(o.kirli);
  }, [yazici, o.kirli, o.surum]);

  const kapatma = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (kapatma.current) clearTimeout(kapatma.current);
    yazici.baslat();
    const arkaPlan = () => void yazici.simdiYaz();
    const gorunurluk = () => document.visibilityState === "hidden" && arkaPlan();
    document.addEventListener("visibilitychange", gorunurluk);
    window.addEventListener("pagehide", arkaPlan);
    // Android: etkinlik duraklatılınca (uygulama değiştirme, ekran kilidi).
    let iptal = false;
    let kaldir: (() => void) | null = null;
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app").then(({ App }) =>
        App.addListener("pause", arkaPlan).then((h) => {
          if (iptal) void h.remove();
          else kaldir = () => void h.remove();
        }),
      );
    }
    return () => {
      iptal = true;
      kaldir?.();
      document.removeEventListener("visibilitychange", gorunurluk);
      window.removeEventListener("pagehide", arkaPlan);
      // StrictMode yeniden bağlamasında taslak silinmesin: kapatma bir sonraki göreve ertelenir.
      kapatma.current = setTimeout(() => yazici.kapat(), 0);
    };
  }, [yazici]);

  return yazici;
}
