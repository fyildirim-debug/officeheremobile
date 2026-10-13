// Konuşmacı notları: slaytın altında katlanır alan; düzenleme kipinde düzenlenir.
import { useEffect, useState } from "react";
import { ChevronDown24Regular, ChevronUp24Regular } from "@fluentui/react-icons";

export interface NotlarProps {
  slideId: string | undefined;
  notes: string;
  duzenle: boolean;
  acik: boolean;
  onToggle: () => void;
  onChange: (text: string) => void;
}

export function NotlarPaneli({ slideId, notes, duzenle, acik, onToggle, onChange }: NotlarProps) {
  const [text, setText] = useState(notes);
  // Slayt değişince (ya da geri al ile) yerel metin modelden yenilenir.
  useEffect(() => setText(notes), [slideId, notes]);
  const ozet = notes.split(/\r?\n/).find((l) => l.trim()) ?? "";
  return (
    <section className="m-sunum-notlar" aria-label="Konuşmacı notları">
      <button type="button" className="m-sunum-notlar-bas" aria-expanded={acik} onClick={onToggle}>
        <b>Notlar</b>
        <span>{acik ? "" : ozet || (duzenle ? "Not eklemek için dokunun" : "Not yok")}</span>
        {acik ? <ChevronDown24Regular /> : <ChevronUp24Regular />}
      </button>
      {acik && (
        <div className="m-sunum-notlar-govde">
          {duzenle ? (
            <textarea
              aria-label="Slayt notları"
              value={text}
              placeholder="Konuşmacı notu ekleyin"
              disabled={!slideId}
              spellCheck
              lang="tr-TR"
              onChange={(e) => {
                setText(e.target.value);
                onChange(e.target.value);
              }}
            />
          ) : (
            <p className={`m-sunum-notlar-metin${notes.trim() ? "" : " is-bos"}`}>{notes.trim() ? notes : "Bu slaytta not yok."}</p>
          )}
        </div>
      )}
    </section>
  );
}
