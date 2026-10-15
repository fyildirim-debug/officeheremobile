// Formül çubuğu (mobil): Ad Kutusu, fx, giriş alanı, iptal/onay. Düzenleme masaüstü denetleyicisiyle
// (startEdit/updateEdit/commitEdit) yürür; tuşlar masaüstünün handleEditKey işleviyle işlenir.
// Formül yazarken işlev önerileri, bağımsız değişken ipucu ve sembol tuşları gösterilir. Veri girişinde
// klavyenin üstünde satır sonu, sağa geç ve sayı/harf klavyesi düğmeleri; sayı hücresinde sayısal klavye.
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { ArrowEnterLeft20Regular, ArrowRight20Regular, Checkmark24Regular, Dismiss24Regular } from "@fluentui/react-icons";
import type { Controller } from "@tablo/controller";
import { handleEditKey, useFormulaAssist } from "@tablo/grid/CellEditor";
import { hintParts } from "@tablo/grid/formulaAssist";
import { toast } from "../shell/feedback";
import { klavyeTuru, ondalikVirgul, satirSonuEkle, type KlavyeTuru } from "./editGiris";

const SYMBOLS = ["(", ")", ";", ":", "$", "\"", "+", "-", "*", "/", "&", "<", ">", "=", "%"];

interface Props {
  ctl: Controller;
  editable: boolean;
  docked: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onFx: () => void;
  /** Giriş alanı odağı (klavye açıkken çubuk klavyenin üstünde kalır). */
  onFocusChange: (focused: boolean) => void;
}

export function FormulaBar({ ctl, editable, docked, inputRef, onFx, onFocusChange }: Props) {
  useSyncExternalStore(ctl.subscribe, ctl.getVersion);
  const e = ctl.edit;
  const sheet = ctl.sheet;
  const a = ctl.sel.active;
  const assistApi = useFormulaAssist(ctl, !!e);
  const spill = !e ? ctl.wb.engine.getSpill(sheet.id, a.row, a.col) : undefined;
  const spillChild = !!spill && (spill.anchorRow !== a.row || spill.anchorCol !== a.col);
  const shown = e ? e.text : spill && spillChild ? ctl.wb.editText(sheet, spill.anchorRow, spill.anchorCol) : ctl.wb.editText(sheet, a.row, a.col);
  const [nameFocus, setNameFocus] = useState(false);
  const [nameText, setNameText] = useState("");
  const [focused, setFocused] = useState(false);
  const cellKey = `${sheet.id}:${a.row}:${a.col}`;
  const prevKey = useRef(cellKey);
  // Ekran klavyesi: hücreye göre (sayı hücresinde sayısal); düğmeyle o hücre için değiştirilebilir.
  const [elle, setElle] = useState<{ key: string; tur: KlavyeTuru } | null>(null);
  const formulda = (e ? e.text : shown).startsWith("=");
  const otomatik: KlavyeTuru = e ? klavyeTuru(ctl.wb, ctl.wb.sheetById(e.sheetId) ?? sheet, e.row, e.col) : klavyeTuru(ctl.wb, sheet, a.row, a.col);
  const klavye: KlavyeTuru = formulda ? "text" : elle?.key === cellKey ? elle.tur : otomatik;

  useLayoutEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    if (ta.value !== shown) ta.value = shown;
    const focused = document.activeElement === ta;
    // Başvuru/öneri eklenince imleç denetleyicideki yere gelir
    if (e && focused && ta.selectionStart === ta.selectionEnd && ta.selectionStart !== e.caret) ta.setSelectionRange(e.caret, e.caret);
    // Enter ile sonraki hücreye geçince içerik seçili gelir: yazılan eskisinin yerine geçer
    if (prevKey.current !== cellKey) {
      prevKey.current = cellKey;
      if (!e && focused) ta.select();
    }
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 104)}px`;
  });

  const keepFocus = (ev: React.PointerEvent | React.MouseEvent) => ev.preventDefault();

  const insertText = (s: string) => {
    const ed = ctl.edit;
    if (!ed) return;
    ctl.updateEdit(ed.text.slice(0, ed.caret) + s + ed.text.slice(ed.caret), ed.caret + s.length);
  };

  const startIfNeeded = (): boolean => {
    if (ctl.edit) return true;
    if (!editable || spillChild) return false;
    ctl.startEdit(undefined, true);
    return !!ctl.edit;
  };

  const blur = () => inputRef.current?.blur();

  /** Alt+Enter karşılığı: seçimin yerine (düzenleme yoksa içeriğin sonuna) satır sonu. */
  const satirSonu = () => {
    const ta = inputRef.current;
    const vardi = !!ctl.edit;
    if (!startIfNeeded() || !ctl.edit) return;
    const ed = ctl.edit;
    const odakta = !!ta && document.activeElement === ta;
    const bas = vardi && odakta ? ta.selectionStart : ed.caret;
    const son = vardi && odakta ? ta.selectionEnd : ed.caret;
    const r = satirSonuEkle(ed.text, bas, son);
    ctl.updateEdit(r.text, r.caret);
    if (ta) requestAnimationFrame(() => document.activeElement === ta && ta.setSelectionRange(r.caret, r.caret));
  };

  /** Girişi onaylayıp sağdaki hücreye geçer (ekran klavyesinde Sekme yok); klavye açık kalır. */
  const sagaGec = () => {
    if (ctl.edit) ctl.commitEdit("right");
    else ctl.advance("right");
  };

  // Düzenlerken ya da giriş alanı odaktayken (Enter'la sonraki hücreye geçince de) klavyenin üstünde
  let accessory: React.ReactNode = null;
  if (e || (editable && focused && !spillChild)) {
    const chips = e ? (assistApi.assist?.items ?? []) : [];
    const hint = e && !chips.length && assistApi.call ? hintParts(assistApi.call.def, assistApi.call.argIndex) : null;
    accessory = (
      <div className="m-tablo-fbar-acc" onPointerDown={keepFocus} onMouseDown={keepFocus}>
        {!formulda && (
          <button type="button" className="m-tablo-chip is-key" aria-label="Satır sonu" title="Satır sonu (Alt+Enter)" onClick={satirSonu}>
            <ArrowEnterLeft20Regular />
          </button>
        )}
        <button type="button" className="m-tablo-chip is-key" aria-label="Gir ve sağa geç" title="Gir ve sağa geç (Sekme)" onClick={sagaGec}>
          <ArrowRight20Regular />
        </button>
        {!formulda && (
          <button
            type="button"
            className="m-tablo-chip is-key is-klavye"
            aria-label={klavye === "decimal" ? "Harf klavyesi" : "Sayı klavyesi"}
            title={klavye === "decimal" ? "Harf klavyesi" : "Sayı klavyesi"}
            onClick={() => setElle({ key: cellKey, tur: klavye === "decimal" ? "text" : "decimal" })}
          >
            {klavye === "decimal" ? "ABC" : "123"}
          </button>
        )}
        {chips.map((d) => (
          <button key={d.key} type="button" className="m-tablo-chip is-fn" onClick={() => assistApi.insert(d)} title={d.desc}>
            {d.label}
          </button>
        ))}
        {hint && (
          <span className="m-tablo-hint" aria-live="polite">
            <b>{hint.name}</b>(
            {hint.args.map((x, i) => (
              <span key={i}>
                {i > 0 && "; "}
                <span className={x.active ? "is-active" : ""}>{x.text}</span>
              </span>
            ))}
            )
          </span>
        )}
        {formulda &&
          SYMBOLS.map((s) => (
            <button key={s} type="button" className="m-tablo-chip is-sym" aria-label={`${s} ekle`} onClick={() => insertText(s)}>
              {s}
            </button>
          ))}
      </div>
    );
  }

  return (
    <div className={`m-tablo-fbar${docked ? " is-docked" : ""}`}>
      <div className="m-tablo-fbar-row">
        <input
          className="m-tablo-namebox"
          aria-label="Ad Kutusu"
          value={nameFocus ? nameText : ctl.nameBoxText()}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          onFocus={(ev) => {
            setNameFocus(true);
            setNameText(ctl.nameBoxText());
            const el = ev.currentTarget;
            requestAnimationFrame(() => document.activeElement === el && el.select());
          }}
          onBlur={() => setNameFocus(false)}
          onChange={(ev) => setNameText(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              if (ctl.edit && !ctl.commitEdit(null)) return;
              if (!ctl.goTo(nameText)) toast("Geçersiz bir başvuru ya da ad girdiniz.", "error");
              setNameFocus(false);
              ev.currentTarget.blur();
            } else if (ev.key === "Escape") {
              setNameFocus(false);
              ev.currentTarget.blur();
            }
          }}
        />
        {editable && (
          <button type="button" className="m-tablo-fx" aria-label="İşlev ekle" title="İşlev ekle" onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={onFx}>
            <i>fx</i>
          </button>
        )}
        <textarea
          ref={inputRef}
          className={`m-tablo-input${spillChild ? " is-ghost" : ""}`}
          aria-label="Formül çubuğu"
          rows={1}
          readOnly={!editable}
          defaultValue={shown}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          enterKeyHint="next"
          inputMode={editable ? klavye : undefined}
          lang="tr"
          placeholder={editable ? "Değer ya da =formül" : ""}
          onBlur={() => {
            setFocused(false);
            onFocusChange(false);
          }}
          onFocus={() => {
            setFocused(true);
            onFocusChange(true);
            if (!editable) return;
            if (!ctl.edit) {
              if (!startIfNeeded()) blur();
            } else if (!ctl.edit.inBar) {
              ctl.edit = { ...ctl.edit, inBar: true, mode: "edit" };
              ctl.emit();
            }
          }}
          onInput={(ev) => {
            const ta = ev.currentTarget;
            if (!startIfNeeded()) {
              ta.value = shown;
              return;
            }
            const native = ev.nativeEvent as InputEvent;
            // Bazı ekran klavyeleri Enter'ı tuş olayı olmadan satır sonu olarak yazar
            if (native.inputType === "insertLineBreak" || native.inputType === "insertParagraph") {
              const at = Math.max(0, ta.selectionStart - 1);
              const text = ta.value.slice(0, at) + ta.value.slice(at + 1);
              ctl.updateEdit(text, at);
              ctl.commitEdit("down");
              return;
            }
            // Sayısal klavyenin noktası ondalık virgül olur ("3.5" tarih sayılmasın)
            const virgul = klavye === "decimal" && native.inputType === "insertText" && native.data === "." ? ondalikVirgul(ta.value, ta.selectionStart) : null;
            if (virgul !== null) {
              const at = ta.selectionStart;
              ta.value = virgul;
              ta.setSelectionRange(at, at);
            }
            ctl.updateEdit(ta.value, ta.selectionStart);
          }}
          onSelect={(ev) => {
            const ta = ev.currentTarget;
            const ed = ctl.edit;
            if (ed?.inBar && ta.selectionStart !== ed.caret) {
              ctl.edit = { ...ed, caret: ta.selectionStart, pointSpan: ta.selectionStart === ed.pointSpan?.end ? ed.pointSpan : undefined };
              ctl.emit();
            }
          }}
          onKeyDown={(ev) => {
            if (ev.nativeEvent.isComposing || ev.keyCode === 229) return;
            if (!ctl.edit) {
              // Düzenleme yokken Enter alttaki, Sekme sağdaki hücreye geçer (odak ve klavye yerinde kalır);
              // Esc odağı bırakır (donanım klavyesinde oklarla gezinmek için).
              const mod = ev.ctrlKey || ev.metaKey || ev.altKey;
              if ((ev.key === "Enter" || ev.key === "Tab") && !mod) {
                ev.preventDefault();
                ctl.advance(ev.key === "Enter" ? (ev.shiftKey ? "up" : "down") : ev.shiftKey ? "left" : "right");
              } else if (ev.key === "Escape") {
                ev.preventDefault();
                blur();
              }
              return;
            }
            if (ev.key === "Escape" && !assistApi.assist) {
              ev.preventDefault();
              ctl.cancelEdit();
              blur();
              return;
            }
            if (ev.key.startsWith("Arrow") && !assistApi.assist) return;
            if (handleEditKey(ctl, ev, assistApi)) ev.preventDefault();
          }}
        />
        {e && (
          <>
            <button type="button" className="m-iconbtn m-tablo-fbar-btn" aria-label="İptal" title="İptal" onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => (ctl.cancelEdit(), blur())}>
              <Dismiss24Regular />
            </button>
            <button type="button" className="m-iconbtn m-tablo-fbar-btn is-ok" aria-label="Gir" title="Gir" onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={() => ctl.commitEdit(null) && blur()}>
              <Checkmark24Regular />
            </button>
          </>
        )}
      </div>
      {accessory}
    </div>
  );
}
