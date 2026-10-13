// Üst çubuk: uygulama renginde (Belge mavi, Tablo yeşil, Sunum turuncu), masaüstü başlık çubuğunun mobil karşılığı.
import type { ReactNode } from "react";
import { ArrowLeft24Regular } from "@fluentui/react-icons";

export interface AppBarProps {
  title: string;
  /** Başlığın altında küçük satır (ör. "Kaydedildi", "Kaydedilmedi"). */
  subtitle?: ReactNode;
  onBack?: () => void;
  /** Sağdaki simge düğmeleri. */
  actions?: ReactNode;
}

export function AppBar({ title, subtitle, onBack, actions }: AppBarProps) {
  return (
    <header className="m-appbar">
      {onBack && (
        <button type="button" className="m-iconbtn" aria-label="Geri" onClick={onBack}>
          <ArrowLeft24Regular />
        </button>
      )}
      <div className="m-appbar-title">
        <h1 title={title}>{title}</h1>
        {subtitle && <div className="m-appbar-sub">{subtitle}</div>}
      </div>
      <div className="m-appbar-actions">{actions}</div>
    </header>
  );
}

export function IconButton({ label, onClick, children, active, disabled }: { label: string; onClick?: () => void; children: ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={`m-iconbtn${active ? " is-active" : ""}`} aria-label={label} title={label} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
