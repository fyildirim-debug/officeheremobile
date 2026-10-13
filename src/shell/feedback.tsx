// Kısa bildirim (toast) ve onay penceresi; tüm ekranlar ortak kullanır.
import { useCallback, useEffect, useState } from "react";

type ToastKind = "info" | "success" | "error";
interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
}

const listeners = new Set<(t: ToastItem) => void>();
let seq = 0;

/** Ekranın altında kısa bildirim gösterir. */
export function toast(text: string, kind: ToastKind = "info") {
  const t = { id: ++seq, text, kind };
  listeners.forEach((l) => l(t));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const on = (t: ToastItem) => {
      setItems((x) => [...x, t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), t.kind === "error" ? 5000 : 2600);
    };
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
  return (
    <div className="m-toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`m-toast is-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Düğmeler soldan sağa; ilk düğme vurgulu. */
  buttons: { id: string; label: string; danger?: boolean }[];
}

type Resolver = (id: string | null) => void;
let open: ((o: ConfirmOptions, r: Resolver) => void) | null = null;

/** Seçenekli onay penceresi; kapatılırsa null. */
export function confirmDialog(o: ConfirmOptions): Promise<string | null> {
  return new Promise((resolve) => (open ? open(o, resolve) : resolve(null)));
}

export function ConfirmHost() {
  const [state, setState] = useState<{ o: ConfirmOptions; r: Resolver } | null>(null);
  useEffect(() => {
    open = (o, r) => setState({ o, r });
    return () => {
      open = null;
    };
  }, []);
  const done = useCallback(
    (id: string | null) => {
      state?.r(id);
      setState(null);
    },
    [state],
  );
  if (!state) return null;
  return (
    <>
      <div className="m-sheet-scrim" onClick={() => done(null)} />
      <div className="m-confirm" role="alertdialog" aria-label={state.o.title}>
        <h2>{state.o.title}</h2>
        <p>{state.o.message}</p>
        <div className="m-confirm-buttons">
          {state.o.buttons.map((b, i) => (
            <button key={b.id} type="button" className={`m-btn${i === 0 ? " is-primary" : ""}${b.danger ? " is-danger" : ""}`} onClick={() => done(b.id)}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
