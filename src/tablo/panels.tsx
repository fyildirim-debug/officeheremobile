// Tablo alt panelleri: renkler, sayı biçimi, hizalama, satır/sütun, işlev listesi, sayfa sekmeleri ve Bul.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Add24Regular,
  ArrowDown24Regular,
  ArrowSwap24Regular,
  ArrowUp24Regular,
  Checkmark20Regular,
  Dismiss24Regular,
  Search24Regular,
  TableDeleteColumn24Regular,
  TableDeleteRow24Regular,
  TableInsertColumn24Regular,
  TableInsertRow24Regular,
  TextAlignCenter24Regular,
  TextAlignLeft24Regular,
  TextAlignRight24Regular,
  TextWrap24Regular,
  DecimalArrowLeft24Regular,
  DecimalArrowRight24Regular,
  AlignTop24Regular,
  AlignCenterVertical24Regular,
  AlignBottom24Regular,
} from "@fluentui/react-icons";
import { CATEGORY_LABELS, FUNCTIONS, formatValue, type FnDef } from "@officehere/formula";
import { STANDARD_COLORS, contrastText, themeShades } from "@officehere/core";
import type { Controller } from "@tablo/controller";
import * as E from "@tablo/actions/edit";
import { activeStyle, changeDecimals, setColor, setFill, setHAlign, setNumFmt, setVAlign, toggleWrap } from "@tablo/actions/format";
import { buildCode, detectCategory, DATE_TYPES, TIME_TYPES, type NumCategory } from "@tablo/dialogs/numberFormats";
import { nextHitIndex, type FindHit } from "@tablo/model/find";
import { hucrelerdeBul, turkceDesen } from "./bul";
import { toast } from "../shell/feedback";
import { paletteOf } from "@tablo/model/theme";
import { rectCols, rectRows } from "@tablo/model/rect";

/* ------------------------------ Ortak ------------------------------ */

export function MenuItem({ icon, label, onClick, checked, disabled, danger, hint }: { icon?: ReactNode; label: string; onClick: () => void; checked?: boolean; disabled?: boolean; danger?: boolean; hint?: string }) {
  return (
    <button type="button" className={`m-tablo-item${danger ? " is-danger" : ""}`} role={checked === undefined ? undefined : "menuitemcheckbox"} aria-checked={checked} disabled={disabled} onClick={onClick}>
      <span className="m-tablo-item-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="m-tablo-item-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {checked !== undefined && <span className={`m-tablo-check${checked ? " is-on" : ""}`}>{checked && <Checkmark20Regular />}</span>}
    </button>
  );
}

/* ------------------------------ Renk ------------------------------ */

export function ColorPanel({ ctl, kind, onDone }: { ctl: Controller; kind: "color" | "fill"; onDone: () => void }) {
  const style = activeStyle(ctl);
  const current = (kind === "color" ? style.color : style.fill)?.toUpperCase();
  const theme = paletteOf(ctl.wb.theme).colors;
  // Tema renkleri ve açık tonları (masaüstü renk seçicisinin ilk ve %60 açık satırı); ardından standart renkler
  const shades = theme.map((c) => themeShades(c));
  const rows = [shades.map((s) => s[0]), shades.map((s) => s[2])];
  const pick = (c: string | null) => {
    // Biçim masaüstü eylemiyle uygulanır (geri alınabilir)
    if (kind === "color") setColor(ctl, c);
    else setFill(ctl, c);
    onDone();
  };
  const swatch = (c: string) => (
    <button
      key={c}
      type="button"
      className={`m-tablo-swatch${current === c.toUpperCase() ? " is-on" : ""}`}
      style={{ background: c, color: contrastText(c) }}
      aria-label={c}
      title={c}
      onClick={() => pick(c)}
    >
      {current === c.toUpperCase() && <Checkmark20Regular />}
    </button>
  );
  return (
    <div className="m-tablo-colors">
      <button type="button" className="m-tablo-autocolor" onClick={() => pick(null)}>
        <span className="m-tablo-autocolor-box" data-kind={kind} aria-hidden="true" />
        {kind === "color" ? "Otomatik" : "Dolgu yok"}
      </button>
      <h3>Tema renkleri</h3>
      <div className="m-tablo-swatches">{rows.flat().map(swatch)}</div>
      <h3>Standart renkler</h3>
      <div className="m-tablo-swatches">{STANDARD_COLORS.map(swatch)}</div>
    </div>
  );
}


/* ------------------------------ Sayı biçimi ------------------------------ */

const NUM_OPTS = { decimals: 2, thousands: true, negative: 0, symbol: "₺" };
export const NUMBER_FORMATS: { id: NumCategory; label: string; code: string }[] = [
  { id: "general", label: "Genel", code: "General" },
  { id: "number", label: "Sayı", code: buildCode("number", NUM_OPTS) },
  { id: "currency", label: "Para birimi", code: buildCode("currency", NUM_OPTS) },
  { id: "percent", label: "Yüzde", code: "0%" },
  { id: "date", label: "Tarih", code: DATE_TYPES[0] },
  { id: "time", label: "Saat", code: TIME_TYPES[0] },
  { id: "text", label: "Metin", code: "@" },
];

export function NumberFormatPanel({ ctl, onDone }: { ctl: Controller; onDone: () => void }) {
  const { row, col } = ctl.sel.active;
  const v = ctl.wb.getValue(ctl.sheet, row, col);
  const cat = detectCategory(activeStyle(ctl).numFmt).cat;
  const sample = typeof v === "number" ? v : 1234.5;
  return (
    <div className="m-tablo-list">
      <div className="m-tablo-segment" role="group" aria-label="Ondalık">
        <button type="button" className="m-btn" onClick={() => changeDecimals(ctl, 1)}>
          <DecimalArrowRight24Regular /> Ondalık artır
        </button>
        <button type="button" className="m-btn" onClick={() => changeDecimals(ctl, -1)}>
          <DecimalArrowLeft24Regular /> Ondalık azalt
        </button>
      </div>
      {NUMBER_FORMATS.map((f) => (
        <button
          key={f.id}
          type="button"
          className={`m-tablo-item${cat === f.id ? " is-current" : ""}`}
          aria-pressed={cat === f.id}
          onClick={() => {
            ctl.edit && ctl.commitEdit(null);
            setNumFmt(ctl, f.code);
            onDone();
          }}
        >
          <span className="m-tablo-item-label">
            {f.label}
            <small>{f.id === "text" ? "Girildiği gibi" : formatValue(f.id === "date" || f.id === "time" ? (typeof v === "number" ? v : 45580.5) : sample, f.code).text}</small>
          </span>
          {cat === f.id && (
            <span className="m-tablo-check is-on">
              <Checkmark20Regular />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Hizalama ------------------------------ */

export function AlignPanel({ ctl }: { ctl: Controller }) {
  const s = activeStyle(ctl);
  const run = (f: () => void) => {
    ctl.edit && ctl.commitEdit(null);
    f();
  };
  const btn = (on: boolean, label: string, icon: ReactNode, f: () => void) => (
    <button type="button" className={`m-tablo-tile${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => run(f)}>
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <div className="m-tablo-tiles">
      {btn(s.hAlign === "left", "Sola", <TextAlignLeft24Regular />, () => setHAlign(ctl, "left"))}
      {btn(s.hAlign === "center", "Ortala", <TextAlignCenter24Regular />, () => setHAlign(ctl, "center"))}
      {btn(s.hAlign === "right", "Sağa", <TextAlignRight24Regular />, () => setHAlign(ctl, "right"))}
      {btn(!!s.wrap, "Metni kaydır", <TextWrap24Regular />, () => toggleWrap(ctl))}
      {btn(s.vAlign === "top", "Üste", <AlignTop24Regular />, () => setVAlign(ctl, "top"))}
      {btn(s.vAlign === "middle", "Ortaya", <AlignCenterVertical24Regular />, () => setVAlign(ctl, "middle"))}
      {btn(!s.vAlign || s.vAlign === "bottom", "Alta", <AlignBottom24Regular />, () => setVAlign(ctl, "bottom"))}
    </div>
  );
}

/* ------------------------------ Satır / sütun ------------------------------ */

export function RowsColsPanel({ ctl, onDone }: { ctl: Controller; onDone: () => void }) {
  const r = ctl.range;
  const n = rectRows(r);
  const m = rectCols(r);
  const run = (f: () => void) => {
    if (ctl.edit && !ctl.commitEdit(null)) return;
    f();
    onDone();
  };
  const rows = n > 1000 ? "" : n > 1 ? ` (${n})` : "";
  const cols = m > 100 ? "" : m > 1 ? ` (${m})` : "";
  return (
    <div className="m-tablo-list">
      <MenuItem icon={<TableInsertRow24Regular />} label={`Üste satır ekle${rows}`} onClick={() => run(() => E.insertRows(ctl))} />
      <MenuItem icon={<TableInsertRow24Regular />} label={`Alta satır ekle${rows}`} onClick={() => run(() => ctl.ops.insertRows(ctl.sheet, r.r2 + 1, n))} />
      <MenuItem icon={<TableDeleteRow24Regular />} label={`Satırı sil${rows}`} danger onClick={() => run(() => E.deleteRows(ctl))} />
      <MenuItem icon={<TableInsertColumn24Regular />} label={`Sola sütun ekle${cols}`} onClick={() => run(() => E.insertCols(ctl))} />
      <MenuItem icon={<TableInsertColumn24Regular />} label={`Sağa sütun ekle${cols}`} onClick={() => run(() => ctl.ops.insertCols(ctl.sheet, r.c2 + 1, m))} />
      <MenuItem icon={<TableDeleteColumn24Regular />} label={`Sütunu sil${cols}`} danger onClick={() => run(() => E.deleteCols(ctl))} />
    </div>
  );
}

/* ------------------------------ İşlevler ------------------------------ */

const POPULAR = ["SUM", "AVERAGE", "IF", "COUNT", "COUNTA", "MAX", "MIN", "ROUND", "VLOOKUP", "XLOOKUP", "SUMIF", "COUNTIF", "IFERROR", "CONCAT", "TODAY", "NOW", "LEN", "TEXT"];

/** Kullanıcıya gösterilen işlevler (benzersiz, Türkçe ada göre sıralı; masaüstü İşlev Ekle ile aynı). */
export function allFunctions(): FnDef[] {
  const seen = new Set<FnDef>();
  for (const d of FUNCTIONS.values()) seen.add(d);
  return [...seen].filter((d) => !d.name.startsWith("_")).sort((a, b) => a.tr.localeCompare(b.tr, "tr"));
}

/** Arama: Türkçe ya da özgün ad, sonra açıklama. */
export function searchFunctions(all: FnDef[], query: string): FnDef[] {
  const q = query.trim().toLocaleUpperCase("tr-TR");
  if (!q) return all;
  const score = (d: FnDef) => (d.tr === q || d.name === q ? 0 : d.tr.startsWith(q) || d.name.startsWith(q) ? 1 : d.tr.includes(q) || d.name.includes(q) ? 2 : d.desc.toLocaleUpperCase("tr-TR").includes(q) ? 3 : 9);
  return all
    .map((d) => ({ d, s: score(d) }))
    .filter((x) => x.s < 9)
    .sort((a, b) => a.s - b.s || a.d.tr.localeCompare(b.d.tr, "tr"))
    .map((x) => x.d);
}

export function FunctionPanel({ onPick }: { onPick: (d: FnDef) => void }) {
  const all = useMemo(allFunctions, []);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("popular");
  const list = useMemo(() => {
    if (q.trim()) return searchFunctions(all, q);
    if (cat === "popular") return POPULAR.map((n) => FUNCTIONS.get(n)).filter((d): d is FnDef => !!d);
    if (cat === "all") return all;
    return all.filter((d) => d.category === cat);
  }, [q, cat, all]);
  const cats: [string, string][] = [["popular", "Sık kullanılan"], ["all", "Tümü"], ...(Object.entries(CATEGORY_LABELS) as [string, string][])];
  return (
    <div className="m-tablo-fn">
      <input className="m-tablo-search" type="search" placeholder="İşlev ara (ör. TOPLA)" aria-label="İşlev ara" value={q} onChange={(e) => setQ(e.target.value)} />
      {!q.trim() && (
        <div className="m-tablo-chips" role="tablist" aria-label="Kategori">
          {cats.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={cat === id} className={`m-tab${cat === id ? " is-on" : ""}`} onClick={() => setCat(id)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="m-tablo-fn-list" role="list">
        {list.slice(0, 200).map((d) => (
          <button key={d.name} type="button" role="listitem" className="m-tablo-fn-item" onClick={() => onPick(d)}>
            <span className="m-tablo-fn-sig">
              <b>{d.tr}</b>({d.args})
            </span>
            <span className="m-tablo-fn-desc">{d.desc}</span>
          </button>
        ))}
        {!list.length && <p className="m-tablo-empty">Eşleşen işlev yok.</p>}
      </div>
    </div>
  );
}

/* ------------------------------ Sayfa sekmeleri ------------------------------ */

export function SheetStrip({ ctl, editable, onMenu }: { ctl: Controller; editable: boolean; onMenu: (index: number) => void }) {
  const wb = ctl.wb;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(".m-tablo-tab.is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [wb.activeIndex, wb.sheets.length]);
  return (
    <div className="m-tablo-tabs">
      <div className="m-tablo-tabs-scroll" ref={ref} role="tablist" aria-label="Sayfalar">
        {wb.sheets.map((s, i) => {
          if (s.hidden) return null;
          const active = i === wb.activeIndex;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`m-tablo-tab${active ? " is-active" : ""}`}
              onClick={() => (active ? editable && onMenu(i) : ctl.activateSheet(i))}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!editable) return;
                if (!active) ctl.activateSheet(i);
                onMenu(i);
              }}
            >
              <span>{s.name}</span>
              {s.tabColor && <i className="m-tablo-tab-color" style={{ background: s.tabColor }} />}
            </button>
          );
        })}
      </div>
      {editable && (
        <button type="button" className="m-iconbtn m-tablo-tab-add" aria-label="Yeni sayfa" title="Yeni sayfa" onClick={() => (ctl.edit && ctl.commitEdit(null), ctl.ops.addSheet(wb.activeIndex + 1))}>
          <Add24Regular />
        </button>
      )}
    </div>
  );
}

/** Sayfayı yeniden adlandırma: masaüstü ad kuralı (isValidSheetName). */
export function RenamePanel({ ctl, index, onDone }: { ctl: Controller; index: number; onDone: () => void }) {
  const sheet = ctl.wb.sheets[index];
  const [name, setName] = useState(sheet?.name ?? "");
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);
  if (!sheet) return null;
  const ok = () => {
    const e = ctl.wb.isValidSheetName(name, sheet);
    if (e) {
      setErr(e);
      return;
    }
    if (name.trim() !== sheet.name) ctl.ops.renameSheet(index, name);
    onDone();
  };
  return (
    <form
      className="m-tablo-form"
      onSubmit={(e) => {
        e.preventDefault();
        ok();
      }}
    >
      <input ref={ref} className="m-tablo-search" aria-label="Sayfa adı" value={name} maxLength={31} enterKeyHint="done" onChange={(e) => (setName(e.target.value), setErr(null))} />
      {err && (
        <p className="m-tablo-error" role="alert">
          {err}
        </p>
      )}
      <div className="m-confirm-buttons">
        <button type="button" className="m-btn" onClick={onDone}>
          Vazgeç
        </button>
        <button type="submit" className="m-btn is-primary">
          Tamam
        </button>
      </div>
    </form>
  );
}

/* ------------------------------ Bul ------------------------------ */

export function FindBar({ ctl, onClose, editable = false }: { ctl: Controller; onClose: () => void; editable?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<FindHit[]>([]);
  const [idx, setIdx] = useState(-1);
  const [degis, setDegis] = useState(false);
  const [yeni, setYeni] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const show = (h: FindHit[], i: number) => {
    setIdx(i);
    const hit = h[i];
    if (!hit) return;
    const si = ctl.wb.sheets.indexOf(hit.sheet);
    if (si !== ctl.wb.activeIndex) ctl.activateSheet(si);
    ctl.selectCell(hit.row, hit.col);
  };
  const search = (query: string) => {
    setQ(query);
    const h = hucrelerdeBul(ctl.wb, ctl.wb.sheets.filter((s) => !s.hidden), query);
    setHits(h);
    if (!h.length) {
      setIdx(-1);
      return;
    }
    // Etkin hücre eşleşiyorsa yerinde kalır, değilse sonrakine gidilir
    const a = ctl.sel.active;
    const here = h.findIndex((x) => x.sheet === ctl.sheet && x.row === a.row && x.col === a.col);
    show(h, here >= 0 ? here : nextHitIndex(h, ctl.sheet, a.row, a.col, false));
  };
  const go = (dir: 1 | -1) => {
    if (!hits.length) return;
    show(hits, idx < 0 ? 0 : (idx + dir + hits.length) % hits.length);
  };
  /** Etkin hücredeki eşleşmeyi değiştirir, sonrakine geçer. */
  const degistir = () => {
    if (ctl.edit && !ctl.commitEdit(null)) return;
    const { row, col } = ctl.sel.active;
    const burada = hits.some((h) => h.sheet === ctl.sheet && h.row === row && h.col === col);
    if (!burada) return go(1);
    ctl.ops.replaceAll(ctl.sheet, [{ row, col }], turkceDesen(q.trim(), true), yeni);
    const h = hucrelerdeBul(ctl.wb, ctl.wb.sheets.filter((s) => !s.hidden), q);
    setHits(h);
    if (!h.length) {
      setIdx(-1);
      return;
    }
    show(h, nextHitIndex(h, ctl.sheet, row, col, false));
  };
  /** Tüm eşleşmeleri değiştirir (sayfa başına tek geri alma adımı). */
  const tumu = () => {
    if (ctl.edit && !ctl.commitEdit(null)) return;
    let n = 0;
    for (const sheet of new Set(hits.map((h) => h.sheet))) {
      n += ctl.ops.replaceAll(sheet, hits.filter((h) => h.sheet === sheet).map((h) => ({ row: h.row, col: h.col })), turkceDesen(q.trim(), true), yeni);
    }
    toast(n ? `${n.toLocaleString("tr-TR")} hücrede değiştirildi.` : "Değiştirilecek eşleşme yok.", n ? "success" : "info");
    search(q);
  };
  return (
    <div className="m-tablo-findwrap">
      <div className="m-tablo-find" role="search">
        <Search24Regular className="m-tablo-find-icon" />
        <input
          ref={ref}
          type="search"
          className="m-tablo-find-input"
          aria-label="Bul"
          placeholder="Hücrelerde ara"
          value={q}
          enterKeyHint="search"
          onChange={(e) => search(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              go(e.shiftKey ? -1 : 1);
            } else if (e.key === "Escape") onClose();
          }}
        />
        <span className="m-tablo-find-count" aria-live="polite">
          {q.trim() ? (hits.length ? `${idx + 1}/${hits.length}` : "Sonuç yok") : ""}
        </span>
        <button type="button" className="m-iconbtn" aria-label="Önceki" disabled={!hits.length} onClick={() => go(-1)}>
          <ArrowUp24Regular />
        </button>
        <button type="button" className="m-iconbtn" aria-label="Sonraki" disabled={!hits.length} onClick={() => go(1)}>
          <ArrowDown24Regular />
        </button>
        {editable && (
          <button type="button" className={`m-iconbtn${degis ? " is-active" : ""}`} aria-label="Değiştir" aria-pressed={degis} onClick={() => setDegis((d) => !d)}>
            <ArrowSwap24Regular />
          </button>
        )}
        <button type="button" className="m-iconbtn" aria-label="Bulu kapat" onClick={onClose}>
          <Dismiss24Regular />
        </button>
      </div>
      {editable && degis && (
        <div className="m-tablo-find is-replace">
          <input type="text" className="m-tablo-find-input" aria-label="Yeni metin" placeholder="Yeni metin" value={yeni} enterKeyHint="done" onChange={(e) => setYeni(e.target.value)} />
          <button type="button" className="m-chip" disabled={!hits.length} onClick={degistir}>
            Değiştir
          </button>
          <button type="button" className="m-chip" disabled={!hits.length} onClick={tumu}>
            Tümü
          </button>
        </div>
      )}
    </div>
  );
}
