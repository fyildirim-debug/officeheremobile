// Alt araç çubuğu ve alttan açılan panel (mobilde şeridin karşılığı).
import { useEffect, type ReactNode } from "react";
import { Dismiss24Regular } from "@fluentui/react-icons";

/** Ekranın altındaki yatay kaydırılabilir araç çubuğu. */
export function BottomToolbar({ children, label }: { children: ReactNode; label: string }) {
  return (
    <nav className="m-toolbar" aria-label={label}>
      <div className="m-toolbar-scroll">{children}</div>
    </nav>
  );
}

export interface ToolButtonProps {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  /** Etiketi simgenin altında göster (yalnız simge yerine). */
  showLabel?: boolean;
}

export function ToolButton({ icon, label, onClick, active, disabled, showLabel }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`m-toolbtn${active ? " is-active" : ""}${showLabel ? " has-label" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      // Düzenleyicideki seçim kaybolmasın.
      onMouseDown={(e) => e.preventDefault()}
    >
      {icon}
      {showLabel && <span>{label}</span>}
    </button>
  );
}

export interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Arkadaki içerik görünür kalsın (biçimlendirme panelleri için). */
  modeless?: boolean;
}

/** Alttan açılan panel; kapatma çizgisi, başlık ve içerik. */
export function Sheet({ open, title, onClose, children, modeless }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      {!modeless && <div className="m-sheet-scrim" onClick={onClose} />}
      <section className={`m-sheet${modeless ? " is-modeless" : ""}`} role="dialog" aria-label={title} onMouseDown={(e) => (e.target as HTMLElement).closest("input,select,textarea") || e.preventDefault()}>
        <div className="m-sheet-head">
          <span className="m-sheet-grip" aria-hidden />
          <h2>{title}</h2>
          <button type="button" className="m-iconbtn" aria-label="Kapat" onClick={onClose}>
            <Dismiss24Regular />
          </button>
        </div>
        <div className="m-sheet-body">{children}</div>
      </section>
    </>
  );
}

/** Panel içinde sekmeler (Giriş, Ekle, Görünüm gibi). */
export function SheetTabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="m-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={`m-tab${value === t.id ? " is-on" : ""}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
