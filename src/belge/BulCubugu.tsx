// Bul ve Değiştir çubuğu (üst çubuğun altında; klavye açıkken de görünür).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/core";
import { ArrowSwap24Regular, ChevronDown24Regular, ChevronUp24Regular, Dismiss24Regular } from "@fluentui/react-icons";
import { toast } from "../shell/feedback";
import { ara, clearSearch, degistir, getSearch, sonraki, tumunuDegistir } from "./bul";

interface Props {
  editor: Editor;
  /** Değiştirme yalnız düzenleme kipinde. */
  duzenle: boolean;
  onClose: () => void;
}

export function BulCubugu({ editor, duzenle, onClose }: Props) {
  const [query, setQuery] = useState(() => {
    const { from, to, empty } = editor.state.selection;
    const s = empty ? "" : editor.state.doc.textBetween(from, to, " ");
    return s.length <= 80 && !s.includes("\n") ? s : "";
  });
  const [yeni, setYeni] = useState("");
  const [degis, setDegis] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Eşleşme sayısı ve geçerli eşleşme düzenleyici durumundan okunur.
  const abone = useCallback(
    (cb: () => void) => {
      editor.on("transaction", cb);
      return () => void editor.off("transaction", cb);
    },
    [editor],
  );
  const sayac = useSyncExternalStore(
    abone,
    () => {
      const st = getSearch(editor.state);
      return st?.query ? `${st.current >= 0 ? st.current + 1 : 0}/${st.matches.length}` : "";
    },
  );

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  useEffect(() => {
    ara(editor.view, query);
  }, [editor, query]);

  useEffect(() => () => void (editor.isDestroyed || clearSearch(editor.view)), [editor]);

  const yok = !!query && sayac.endsWith("/0");

  return (
    <div className="m-belge-bul" role="search">
      <div className="m-belge-bul-satir">
        <input
          ref={input}
          className={`m-belge-bul-giris${yok ? " is-yok" : ""}`}
          type="search"
          enterKeyHint="search"
          placeholder="Belgede bul"
          aria-label="Bul"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              sonraki(editor.view, e.shiftKey ? -1 : 1);
            } else if (e.key === "Escape") onClose();
          }}
        />
        <span className="m-belge-bul-sayac" aria-live="polite">
          {sayac}
        </span>
        <button type="button" className="m-iconbtn" aria-label="Önceki" disabled={!query} onClick={() => sonraki(editor.view, -1)}>
          <ChevronUp24Regular />
        </button>
        <button type="button" className="m-iconbtn" aria-label="Sonraki" disabled={!query} onClick={() => sonraki(editor.view, 1)}>
          <ChevronDown24Regular />
        </button>
        {duzenle && (
          <button type="button" className={`m-iconbtn${degis ? " is-active" : ""}`} aria-label="Değiştir" aria-pressed={degis} onClick={() => setDegis((d) => !d)}>
            <ArrowSwap24Regular />
          </button>
        )}
        <button type="button" className="m-iconbtn" aria-label="Bulmayı kapat" onClick={onClose}>
          <Dismiss24Regular />
        </button>
      </div>
      {duzenle && degis && (
        <div className="m-belge-bul-satir">
          <input className="m-belge-bul-giris" type="text" enterKeyHint="done" placeholder="Yeni metin" aria-label="Yeni metin" value={yeni} onChange={(e) => setYeni(e.target.value)} />
          <button
            type="button"
            className="m-chip"
            disabled={!query}
            onClick={() => {
              if (degistir(editor.view, yeni) === "korumali") toast("Bu eşleşme tablo ya da nesne içinde; mobilde değiştirilemez.");
            }}
          >
            Değiştir
          </button>
          <button
            type="button"
            className="m-chip"
            disabled={!query}
            onClick={() => {
              const { n, atlanan } = tumunuDegistir(editor.view, yeni);
              toast(atlanan ? `${n} eşleşme değiştirildi; tablo ya da nesne içindeki ${atlanan} eşleşme atlandı.` : n ? `${n} eşleşme değiştirildi.` : "Eşleşme yok.", n ? "success" : "info");
            }}
          >
            Tümü
          </button>
        </div>
      )}
    </div>
  );
}
