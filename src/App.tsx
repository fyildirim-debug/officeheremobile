import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { getPlatform, type OpenedDoc, type Platform } from "./platform";
import { useTheme } from "./shell/theme";
import { ConfirmHost, ToastHost, toast } from "./shell/feedback";
import { Home } from "./home/Home";

// Ekranlar ayrı paketlenir: yalnız açılan uygulamanın kodu yüklenir.
const BelgeScreen = lazy(() => import("./belge/BelgeScreen"));
const TabloScreen = lazy(() => import("./tablo/TabloScreen"));
const SunumScreen = lazy(() => import("./sunum/SunumScreen"));

export function App() {
  const { dark } = useTheme();
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [doc, setDoc] = useState<OpenedDoc | null>(null);

  useEffect(() => {
    void getPlatform().then(setPlatform);
  }, []);

  // Başka uygulamadan "OfficeHere ile aç" ile gelen dosya.
  useEffect(() => {
    if (!platform) return;
    return platform.onExternalOpen((d) => setDoc(d));
  }, [platform]);

  useEffect(() => {
    document.documentElement.setAttribute("data-app", doc?.app ?? "baslangic");
  }, [doc]);

  const open = useCallback(
    (d: OpenedDoc) => {
      setDoc(d);
      if (d.data && platform) void platform.addRecent({ name: d.name, app: d.app, uri: d.uri });
    },
    [platform],
  );

  if (!platform) return null;
  const props = doc ? { doc, platform, dark, onClose: () => setDoc(null) } : null;
  return (
    <>
      {props ? (
        <Suspense fallback={<div className="m-loading">Açılıyor…</div>}>
          {props.doc.app === "belge" ? <BelgeScreen key={props.doc.name + (props.doc.uri ?? "")} {...props} /> : props.doc.app === "tablo" ? <TabloScreen key={props.doc.name + (props.doc.uri ?? "")} {...props} /> : <SunumScreen key={props.doc.name + (props.doc.uri ?? "")} {...props} />}
        </Suspense>
      ) : (
        <Home platform={platform} onOpen={open} onError={(m) => toast(m, "error")} />
      )}
      <ToastHost />
      <ConfirmHost />
    </>
  );
}
