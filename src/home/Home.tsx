// Başlangıç ekranı: masaüstü Başlangıç penceresinin mobil karşılığı (yeni, aç, son kullanılanlar, ayarlar).
import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderOpen24Regular, MoreVertical24Regular, Pin16Filled, Search24Regular, Settings24Regular } from "@fluentui/react-icons";
import { AppLogo, DeveloperCredit } from "@officehere/ui";
import { AppBar, IconButton } from "../shell/AppBar";
import { acceptFor, appFor, APP_LABEL, type AppKind, type OpenedDoc, type Platform, type RecentFile } from "../platform";
import { useBackHandler } from "../shell/back";
import { toast } from "../shell/feedback";
import { Settings } from "./Settings";
import { RecentActions } from "./RecentActions";
import { greeting, recentWhen } from "./util";
import "./home.css";

interface Props {
  platform: Platform;
  onOpen: (d: OpenedDoc) => void;
  onError: (message: string) => void;
}

export const NEW_DOCS: { app: AppKind; label: string; name: string; aria: string; shape: "portrait" | "square" | "landscape" }[] = [
  { app: "belge", label: "Boş belge", name: "Belge1.docx", aria: "Yeni belge", shape: "portrait" },
  { app: "tablo", label: "Boş çalışma kitabı", name: "Kitap1.xlsx", aria: "Yeni tablo", shape: "square" },
  { app: "sunum", label: "Boş sunu", name: "Sunu1.pptx", aria: "Yeni sunu", shape: "landscape" },
];

/** Boş şablon önizlemesi (masaüstü Başlangıç ile aynı çizim; zemin temaya uyar). */
function Preview({ app }: { app: AppKind }) {
  if (app === "belge") {
    return (
      <svg viewBox="0 0 130 168" className="m-home-preview" aria-hidden>
        <rect width="130" height="168" className="m-home-paper" />
        {[34, 46, 58, 70, 82].map((y, i) => (
          <rect key={y} x="18" y={y} width={i === 4 ? 56 : 94} height="4" rx="2" className="m-home-text" />
        ))}
      </svg>
    );
  }
  if (app === "tablo") {
    return (
      <svg viewBox="0 0 150 120" className="m-home-preview" aria-hidden>
        <rect width="150" height="120" className="m-home-paper" />
        {Array.from({ length: 7 }, (_, i) => (
          <line key={`h${i}`} x1="0" x2="150" y1={i * 18 + 12} y2={i * 18 + 12} className="m-home-line" />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <line key={`v${i}`} y1="0" y2="120" x1={i * 34 + 14} x2={i * 34 + 14} className="m-home-line" />
        ))}
        <rect x="14" y="12" width="34" height="18" fill="none" stroke="#1d7a46" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 196 110" className="m-home-preview" aria-hidden>
      <rect width="196" height="110" className="m-home-paper" />
      <rect x="38" y="36" width="120" height="16" fill="none" className="m-home-dash" strokeDasharray="3 2" />
      <rect x="58" y="60" width="80" height="10" fill="none" className="m-home-dash" strokeDasharray="3 2" />
    </svg>
  );
}

type Filter = "all" | AppKind;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "belge", label: "Belge" },
  { id: "tablo", label: "Tablo" },
  { id: "sunum", label: "Sunum" },
];

export function Home({ platform, onOpen, onError }: Props) {
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [settings, setSettings] = useState(false);
  const [menuFor, setMenuFor] = useState<RecentFile | null>(null);

  const reload = useCallback(() => {
    void platform.recent().then(setRecent, () => setRecent([]));
  }, [platform]);

  useEffect(() => {
    reload();
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  // Geri: önce arama kapanır.
  useBackHandler(() => {
    setSearching(false);
    setQuery("");
  }, searching);

  const pick = async () => {
    try {
      const d = await platform.pickFile(acceptFor());
      if (d) onOpen(d);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const openRecent = async (f: RecentFile) => {
    try {
      const d = await platform.openRecent(f);
      if (d) {
        onOpen(d);
        return;
      }
    } catch {
      // aşağıda yeniden seçtirilir
    }
    toast(platform.native ? "Dosyaya artık erişilemiyor; lütfen yeniden seçin." : "Tarayıcıda dosya konumu saklanmaz; dosyayı yeniden seçin.");
    try {
      const d = await platform.pickFile(acceptFor(f.app));
      if (d) onOpen(d);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    return recent.filter((f) => (filter === "all" || f.app === filter) && (!q || f.name.toLocaleLowerCase("tr").includes(q)));
  }, [recent, filter, query]);

  return (
    <div className="m-screen m-home">
      <AppBar
        title="OfficeHere"
        subtitle="Belge · Tablo · Sunum"
        actions={
          <>
            <IconButton
              label="Son kullanılanlarda ara"
              active={searching}
              onClick={() => {
                setSearching((s) => !s);
                setQuery("");
              }}
            >
              <Search24Regular />
            </IconButton>
            <IconButton label="Ayarlar" onClick={() => setSettings(true)}>
              <Settings24Regular />
            </IconButton>
          </>
        }
      />
      <main className="m-content m-home-content">
        <h2 className="m-home-greeting">{greeting()}</h2>

        <section className="m-home-section" aria-labelledby="m-home-new">
          <h3 id="m-home-new">Yeni</h3>
          <div className="m-home-new">
            {NEW_DOCS.map((n) => (
              <button key={n.app} type="button" className={`m-home-tile is-${n.shape}`} data-app={n.app} aria-label={n.aria} onClick={() => onOpen({ name: n.name, data: null, app: n.app })}>
                <span className="m-home-tile-preview">
                  <Preview app={n.app} />
                  <span className="m-home-tile-badge">
                    <AppLogo app={n.app} size={22} />
                  </span>
                </span>
                <span className="m-home-tile-label">{n.label}</span>
              </button>
            ))}
          </div>
        </section>

        <button type="button" className="m-home-open" aria-label="Aç" onClick={pick}>
          <span className="m-home-open-icon">
            <FolderOpen24Regular />
          </span>
          <span className="m-home-open-text">
            <strong>Aç</strong>
            <span>Cihazdaki belge, çalışma kitabı ya da sunuyu açın</span>
          </span>
        </button>

        <section className="m-home-section" aria-labelledby="m-home-recent">
          <h3 id="m-home-recent">Son Kullanılanlar</h3>
          {searching && (
            <input className="m-home-search" type="search" autoFocus placeholder="Dosya adında ara" aria-label="Dosya adında ara" value={query} onChange={(e) => setQuery(e.target.value)} />
          )}
          <div className="m-home-filters" role="tablist" aria-label="Uygulamaya göre süz">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={`m-chip${filter === f.id ? " is-on" : ""}`} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="m-home-empty">{recent.length === 0 ? "Henüz dosya açmadınız. Açtığınız dosyalar burada listelenir." : "Eşleşen dosya yok."}</p>
          ) : (
            <ul className="m-home-recent" aria-label="Son kullanılan dosyalar">
              {shown.map((f) => (
                <li key={`${f.name}|${f.uri ?? ""}`} className="m-home-item">
                  <button
                    type="button"
                    className="m-home-item-main"
                    onClick={() => void openRecent(f)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenuFor(f);
                    }}
                  >
                    <span className="m-home-item-icon">
                      <AppLogo app={appFor(f.name) ?? f.app} size={32} />
                    </span>
                    <span className="m-home-item-text">
                      <span className="m-home-item-name">
                        <span>{f.name}</span>
                        {f.pinned && <Pin16Filled className="m-home-pin" aria-label="Sabitlendi" />}
                      </span>
                      <span className="m-home-item-meta">
                        {APP_LABEL[f.app]} · {recentWhen(f.openedAt)}
                      </span>
                    </span>
                  </button>
                  <IconButton label={`${f.name} seçenekleri`} onClick={() => setMenuFor(f)}>
                    <MoreVertical24Regular />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="m-home-credit">
          <DeveloperCredit variant="footer" />
        </div>
      </main>

      <Settings open={settings} onClose={() => setSettings(false)} />
      <RecentActions
        file={menuFor}
        onClose={() => setMenuFor(null)}
        onOpen={(f) => void openRecent(f)}
        onPin={async (f, pinned) => {
          await platform.pinRecent(f.name, f.uri, pinned);
          reload();
        }}
        onRemove={async (f) => {
          await platform.removeRecent(f.name, f.uri);
          reload();
          toast("Listeden kaldırıldı.");
        }}
      />
    </div>
  );
}
