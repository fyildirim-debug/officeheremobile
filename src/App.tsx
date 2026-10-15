import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appFor, getPlatform, type AppKind, type OpenedDoc, type Platform } from "./platform";
import { gorunumBekle, oturumuGeriGetir, oturumuUnut, type GeriGelen } from "./platform/taslak";
import { useTheme } from "./shell/theme";
import { ConfirmHost, ToastHost, confirmDialog, toast } from "./shell/feedback";
import { Home } from "./home/Home";

// Ekranlar ayrı paketlenir: yalnız açılan uygulamanın kodu yüklenir.
const BelgeScreen = lazy(() => import("./belge/BelgeScreen"));
const TabloScreen = lazy(() => import("./tablo/TabloScreen"));
const SunumScreen = lazy(() => import("./sunum/SunumScreen"));

const YENI_ADI: Record<AppKind, string> = { belge: "belge", tablo: "çalışma kitabı", sunum: "sunu" };

/**
 * Açılış (sayfa başına bir kez; StrictMode etkiyi iki kez çalıştırır): platform ve, sistem süreci arka
 * planda sonlandırdıysa, son belge kaldığı yerde (taslak ya da kayıtlı konum, görünüm durumu).
 */
let acilis: Promise<{ platform: Platform; geri: GeriGelen | null }> | null = null;
const acilisHazirla = () =>
  (acilis ??= (async () => {
    const platform = await getPlatform();
    if (!(await platform.restoredLaunch?.().catch(() => false))) {
      // Taze açılış: eski kayıt unutulur (aynı bağlantıda sonraki yazmalardan önce işlenir; beklenmez).
      void oturumuUnut();
      return { platform, geri: null };
    }
    return { platform, geri: await oturumuGeriGetir((f) => platform.openRecent(f)).catch(() => null) };
  })());

export function App() {
  const { dark } = useTheme();
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [doc, setDoc] = useState<OpenedDoc | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  useEffect(() => {
    let iptal = false;
    void acilisHazirla().then(({ platform: p, geri }) => {
      if (iptal) return;
      if (geri) {
        gorunumBekle(geri.doc.app, geri.doc.name, geri.gorunum);
        setDoc(geri.doc);
      }
      setPlatform(p);
    });
    return () => {
      iptal = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-app", doc?.app ?? "baslangic");
  }, [doc]);

  const open = useCallback(
    (d: OpenedDoc) => {
      setDoc(d);
      // Kurtarılan yeni (hiç kaydedilmemiş) belgenin cihazda karşılığı yok: son kullanılanlara girmez.
      if (d.data && platform && !(d.recovered && !d.uri)) void platform.addRecent({ name: d.name, app: d.app, uri: d.uri });
    },
    [platform],
  );

  // Başka uygulamadan "OfficeHere ile aç" ile gelen dosya; açık belge varsa önce sorulur.
  useEffect(() => {
    if (!platform) return;
    return platform.onExternalOpen(async (d) => {
      if (docRef.current) {
        // Uygulama kısayolundan yeni boş belge (data === null) ya da gelen dosya.
        const yeni = d.data === null;
        const r = await confirmDialog({
          title: yeni ? `Yeni ${YENI_ADI[d.app]} oluşturulsun mu?` : `"${d.name}" açılsın mı?`,
          message: `Açık olan "${docRef.current.name}" kapatılacak. Kaydedilmemiş değişiklikler kaybolur.`,
          buttons: [
            { id: "open", label: yeni ? "Oluştur" : "Aç" },
            { id: "cancel", label: "Vazgeç" },
          ],
        });
        if (r !== "open") return;
      }
      open(d);
    });
  }, [platform, open]);

  // Ekranlara verilen platform: kaydedilen dosya son kullanılanlara eklenir.
  const screenPlatform = useMemo<Platform | null>(() => {
    if (!platform || !doc) return null;
    return {
      ...platform,
      saveFile: async (name, bytes, mime, opts) => {
        const saved = await platform.saveFile(name, bytes, mime, opts);
        // Dışa aktarılan dosyalar (PDF, PNG…) son kullanılanlara girmez.
        const app = appFor(saved.name);
        if (app) void platform.addRecent({ name: saved.name, app, uri: saved.uri });
        return saved;
      },
    };
  }, [platform, doc]);

  if (!platform) return null;
  const props = doc && screenPlatform ? { doc, platform: screenPlatform, dark, onClose: () => setDoc(null) } : null;
  const key = doc ? `${doc.name}|${doc.uri ?? ""}|${doc.data?.byteLength ?? 0}` : "";
  return (
    <>
      {props ? (
        <Suspense fallback={<div className="m-loading">Açılıyor…</div>}>
          {props.doc.app === "belge" ? <BelgeScreen key={key} {...props} /> : props.doc.app === "tablo" ? <TabloScreen key={key} {...props} /> : <SunumScreen key={key} {...props} />}
        </Suspense>
      ) : (
        <Home platform={platform} onOpen={open} onError={(m) => toast(m, "error")} />
      )}
      <ToastHost />
      <ConfirmHost />
    </>
  );
}
