// Ayarlar: tema seçimi ve Hakkında (sürüm, geliştirici, lisanslar).
import { useEffect, useState } from "react";
import { ArrowLeft24Regular, Checkmark20Regular, ChevronRight20Regular, Code24Regular, DocumentText24Regular, ShieldCheckmark24Regular } from "@fluentui/react-icons";
import { AppLogo, DeveloperCredit } from "@officehere/ui";
import pkg from "../../package.json";
import { useBackHandler } from "../shell/back";
import { Sheet } from "../shell/Toolbar";
import { THEMES, useTheme } from "../shell/theme";

const KAYNAK = "https://github.com/fyildirim-debug/officeheremobile";

/** Tema önizlemesi: üst çubuk + sayfa renkleri. */
const SWATCH: Record<string, [string, string, string]> = {
  system: ["#3d3d8f", "#ffffff", "#1f1f1f"],
  colorful: ["#3d3d8f", "#f3f3f3", "#ffffff"],
  white: ["#ffffff", "#ffffff", "#f3f3f3"],
  dark: ["#2b2b2b", "#3a3a3a", "#1f1f1f"],
  black: ["#000000", "#1b1b1b", "#000000"],
};

function Notices({ onBack }: { onBack: () => void }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("./THIRD_PARTY_NOTICES.txt")
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => live && setText(t.startsWith("<") ? "" : t))
      .catch(() => live && setText(""));
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="m-settings-notices">
      <button type="button" className="m-list-item" onClick={onBack}>
        <ArrowLeft24Regular />
        <span>Ayarlar</span>
      </button>
      {text === null ? <p className="m-muted">Yükleniyor…</p> : text ? <pre>{text}</pre> : <p className="m-muted">Bildirimler yalnız derlenmiş uygulamada bulunur.</p>}
    </div>
  );
}

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, setTheme } = useTheme();
  const [page, setPage] = useState<"main" | "notices">("main");
  useBackHandler(() => (page === "notices" ? setPage("main") : onClose()), open);
  const close = () => {
    setPage("main");
    onClose();
  };
  return (
    <Sheet open={open} title={page === "notices" ? "Üçüncü taraf yazılım bildirimleri" : "Ayarlar"} onClose={close}>
      {page === "notices" ? (
        <Notices onBack={() => setPage("main")} />
      ) : (
        <div className="m-settings">
          <h3>Tema</h3>
          <div className="m-list" role="radiogroup" aria-label="Tema">
            {THEMES.map((t) => {
              const [bar, page1, page2] = SWATCH[t.id] ?? SWATCH.system;
              return (
                <button key={t.id} type="button" role="radio" aria-checked={theme === t.id} className={`m-list-item${theme === t.id ? " is-on" : ""}`} onClick={() => setTheme(t.id)}>
                  <span className="m-theme-swatch" aria-hidden>
                    <span style={{ background: bar }} />
                    <span style={{ background: t.id === "system" ? `linear-gradient(135deg, ${page1} 50%, ${page2} 50%)` : page1 }} />
                  </span>
                  <span>{t.label}</span>
                  {theme === t.id && <Checkmark20Regular className="m-list-check" />}
                </button>
              );
            })}
          </div>
          <p className="m-muted m-settings-note">Koyu temada belge sayfaları, tablolar ve slaytlar da ekranda koyu gösterilir; kaydedilen dosyalar değişmez.</p>

          <h3>Hakkında</h3>
          <div className="m-about">
            <AppLogo app="baslangic" size={44} />
            <div>
              <strong>OfficeHere Mobil</strong>
              <span className="m-muted">Sürüm {pkg.version}</span>
            </div>
          </div>
          <DeveloperCredit />
          <div className="m-list">
            <div className="m-list-item is-static">
              <ShieldCheckmark24Regular />
              <span>Belgeleriniz cihazınızda kalır; OfficeHere hesap istemez, veri toplamaz.</span>
            </div>
            <a className="m-list-item" href={KAYNAK} target="_blank" rel="noopener noreferrer">
              <Code24Regular />
              <span>Kaynak kod (MIT lisansı)</span>
              <ChevronRight20Regular className="m-list-check" />
            </a>
            <button type="button" className="m-list-item" onClick={() => setPage("notices")}>
              <DocumentText24Regular />
              <span>Üçüncü taraf yazılım bildirimleri</span>
              <ChevronRight20Regular className="m-list-check" />
            </button>
          </div>
          <p className="m-muted m-settings-note">OfficeHere açık kaynaklı, bağımsız bir projedir.</p>
        </div>
      )}
    </Sheet>
  );
}
