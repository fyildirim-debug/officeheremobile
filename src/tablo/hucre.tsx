// Tablo hücre panelleri: yazı tipi ve boyutu, kenarlıklar, birleştirme, sıralama ve filtre (değer listesi).
// Eylemler masaüstü Tablo'nunkilerdir (geri alınabilir, .xlsx/.ods'ye yazılır).
import { useMemo, useState, type ReactNode } from "react";
import {
  BorderAll24Regular,
  BorderBottom24Regular,
  BorderLeft24Regular,
  BorderNone24Regular,
  BorderOutside24Regular,
  BorderOutsideThick24Regular,
  BorderRight24Regular,
  BorderTop24Regular,
  Checkmark20Regular,
  Filter24Regular,
  FilterDismiss24Regular,
  FontDecrease24Regular,
  FontIncrease24Regular,
  TableCellsMerge24Regular,
  TableCellsSplit24Regular,
  TextSortAscending24Regular,
  TextSortDescending24Regular,
} from "@fluentui/react-icons";
import { colToName } from "@officehere/formula";
import { FONT_SIZES, fontStack } from "@officehere/core";
import type { Controller } from "@tablo/controller";
import { activeStyle, borders, growFont, mergeCells, setFont, setFontSize } from "@tablo/actions/format";
import { clearAllFilters, columnValues, filtersOf, quickSort, setColumnFilter, toggleAutoFilter } from "@tablo/actions/data";
import { DEFAULT_FONT, DEFAULT_SIZE } from "@tablo/model/styles";
import type { AutoFilter } from "@tablo/model/types";
import { displayText } from "@tablo/model/display";
import { toast } from "../shell/feedback";
import { yaziTipiListesi } from "../shell/yaziTipleri";
import { MenuItem } from "./panels";

const fmtBoyut = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

/** Düzenleme sürüyorsa önce onaylanır; onaylanamazsa (geçersiz formül) eylem yapılmaz. */
const onayla = (ctl: Controller) => !ctl.edit || ctl.commitEdit(null);

/* ------------------------------ Yazı tipi ------------------------------ */

export function YaziTipiPanel({ ctl }: { ctl: Controller }) {
  const s = activeStyle(ctl);
  const boyut = s.size ?? DEFAULT_SIZE;
  const font = s.font ?? DEFAULT_FONT;
  const run = (f: () => void) => onayla(ctl) && f();
  return (
    <div className="m-tablo-font">
      <div className="m-tablo-font-row">
        <button type="button" className="m-iconbtn" aria-label="Yazı tipini küçült" title="Yazı tipini küçült" onClick={() => run(() => growFont(ctl, -1))}>
          <FontDecrease24Regular />
        </button>
        <output className="m-tablo-font-size" aria-label="Yazı tipi boyutu">
          {fmtBoyut(boyut)}
        </output>
        <button type="button" className="m-iconbtn" aria-label="Yazı tipini büyült" title="Yazı tipini büyült" onClick={() => run(() => growFont(ctl, 1))}>
          <FontIncrease24Regular />
        </button>
      </div>
      <div className="m-tablo-chips m-tablo-sizes" role="listbox" aria-label="Yazı tipi boyutları">
        {FONT_SIZES.map((n) => (
          <button key={n} type="button" role="option" aria-selected={Math.abs(boyut - n) < 0.01} className={`m-chip${Math.abs(boyut - n) < 0.01 ? " is-on" : ""}`} onClick={() => run(() => setFontSize(ctl, n))}>
            {fmtBoyut(n)}
          </button>
        ))}
      </div>
      <h3>Yazı tipi</h3>
      <div className="m-tablo-list" role="listbox" aria-label="Yazı tipi">
        {yaziTipiListesi(font).map((f) => (
          <button key={f} type="button" role="option" aria-selected={f === font} className={`m-tablo-item${f === font ? " is-current" : ""}`} onClick={() => run(() => setFont(ctl, f))}>
            <span className="m-tablo-item-label" style={{ fontFamily: fontStack(f), fontSize: 17 }}>
              {f}
            </span>
            {f === font && (
              <span className="m-tablo-check is-on">
                <Checkmark20Regular />
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Kenarlıklar ------------------------------ */

export const KENARLIKLAR: { id: string; label: string; icon: ReactNode }[] = [
  { id: "all", label: "Tüm kenarlıklar", icon: <BorderAll24Regular /> },
  { id: "outside", label: "Dış kenarlıklar", icon: <BorderOutside24Regular /> },
  { id: "thickOutside", label: "Kalın dış kenarlık", icon: <BorderOutsideThick24Regular /> },
  { id: "bottom", label: "Alt kenarlık", icon: <BorderBottom24Regular /> },
  { id: "top", label: "Üst kenarlık", icon: <BorderTop24Regular /> },
  { id: "left", label: "Sol kenarlık", icon: <BorderLeft24Regular /> },
  { id: "right", label: "Sağ kenarlık", icon: <BorderRight24Regular /> },
  { id: "none", label: "Kenarlık yok", icon: <BorderNone24Regular /> },
];

export function KenarlikPanel({ ctl, onDone }: { ctl: Controller; onDone: () => void }) {
  return (
    <div className="m-tablo-tiles">
      {KENARLIKLAR.map((k) => (
        <button
          key={k.id}
          type="button"
          className="m-tablo-tile"
          onClick={() => {
            if (!onayla(ctl)) return;
            borders(ctl, k.id);
            onDone();
          }}
        >
          {k.icon}
          <span>{k.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Birleştirme ------------------------------ */

/** Etkin hücre birleştirilmiş alanda mı. */
export const birlesik = (ctl: Controller) => !!ctl.sheet.mergeAt(ctl.sel.active.row, ctl.sel.active.col);

/** Araç çubuğu düğmesi: birleşikse çözer, birden çok hücre seçiliyse birleştirip ortalar. */
export function birlestirVeOrtala(ctl: Controller): void {
  if (!onayla(ctl)) return;
  const r = ctl.range;
  if (birlesik(ctl) && ctl.sel.ranges.every((x) => ctl.sheet.mergeAt(x.r1, x.c1))) {
    mergeCells(ctl, "unmerge");
    return;
  }
  if (r.r1 === r.r2 && r.c1 === r.c2) {
    toast("Birleştirmek için birden çok hücre seçin (uzun basıp sürükleyin).");
    return;
  }
  mergeCells(ctl, "center");
}

export function BirlestirSecenekleri({ ctl, onDone }: { ctl: Controller; onDone: () => void }) {
  const tek = ctl.sel.ranges.every((r) => r.r1 === r.r2 && r.c1 === r.c2);
  const run = (mode: "center" | "across" | "merge" | "unmerge") => () => {
    if (!onayla(ctl)) return;
    mergeCells(ctl, mode);
    onDone();
  };
  return (
    <div className="m-tablo-tiles">
      <button type="button" className="m-tablo-tile" disabled={tek} onClick={run("center")}>
        <TableCellsMerge24Regular />
        <span>Birleştir ve ortala</span>
      </button>
      <button type="button" className="m-tablo-tile" disabled={tek} onClick={run("merge")}>
        <TableCellsMerge24Regular />
        <span>Hücreleri birleştir</span>
      </button>
      <button type="button" className="m-tablo-tile" disabled={tek} onClick={run("across")}>
        <TableCellsMerge24Regular />
        <span>Satır satır birleştir</span>
      </button>
      <button type="button" className="m-tablo-tile" disabled={!birlesik(ctl)} onClick={run("unmerge")}>
        <TableCellsSplit24Regular />
        <span>Birleştirmeyi çöz</span>
      </button>
    </div>
  );
}

/* ------------------------------ Sıralama ve filtre ------------------------------ */

/** Etkin hücreyi içeren filtre (otomatik filtre ya da tablo filtresi). */
export function filtreBul(ctl: Controller, col = ctl.sel.active.col, row = ctl.sel.active.row): AutoFilter | null {
  const fs = filtersOf(ctl.sheet);
  return fs.find((f) => col >= f.range.c1 && col <= f.range.c2 && row >= f.range.r1 && row <= f.range.r2) ?? fs.find((f) => col >= f.range.c1 && col <= f.range.c2) ?? null;
}

/** Filtre sonucu (masaüstü durum iletisi: "5 kayıttan 2 tanesi bulundu"). */
function filtreBildir(ctl: Controller) {
  if (ctl.status.endsWith("bulundu")) toast(ctl.status);
}

/** Sütun başlığındaki ad (boşsa sütun harfi). */
export function sutunAdi(ctl: Controller, f: AutoFilter, col: number): string {
  return displayText(ctl.wb, ctl.sheet, f.range.r1, col).trim() || `${colToName(col)} sütunu`;
}

export function SiralaFiltrePanel({ ctl, onFilter, onDone }: { ctl: Controller; onFilter: (col: number) => void; onDone: () => void }) {
  const col = ctl.sel.active.col;
  const f = filtreBul(ctl);
  const acik = !!f;
  const kriterVar = filtersOf(ctl.sheet).some((x) => Object.keys(x.columns).length > 0);
  const run = (fn: () => void) => () => {
    if (!onayla(ctl)) return;
    fn();
    onDone();
  };
  return (
    <div className="m-tablo-list">
      <MenuItem icon={<TextSortAscending24Regular />} label="A'dan Z'ye sırala" hint={`${colToName(col)} sütununa göre, küçükten büyüğe`} onClick={run(() => quickSort(ctl, false))} />
      <MenuItem icon={<TextSortDescending24Regular />} label="Z'den A'ya sırala" hint={`${colToName(col)} sütununa göre, büyükten küçüğe`} onClick={run(() => quickSort(ctl, true))} />
      <MenuItem icon={<Filter24Regular />} label="Filtre" hint="Başlık satırına filtre düğmeleri" checked={acik} onClick={run(() => toggleAutoFilter(ctl))} />
      {f && col >= f.range.c1 && col <= f.range.c2 && <MenuItem icon={<Filter24Regular />} label={`«${sutunAdi(ctl, f, col)}» sütununu süz…`} onClick={() => onayla(ctl) && onFilter(col)} />}
      <MenuItem
        icon={<FilterDismiss24Regular />}
        label="Filtreleri temizle"
        disabled={!kriterVar}
        onClick={run(() => {
          clearAllFilters(ctl);
          toast("Tüm satırlar gösteriliyor.");
        })}
      />
    </div>
  );
}

/** Sütun filtresi: değer listesi (masaüstü filtre menüsünün değer bölümü) ve sütuna göre sıralama. */
export function FiltrePanel({ ctl, col, onDone }: { ctl: Controller; col: number; onDone: () => void }) {
  const f = filtreBul(ctl, col);
  const { values, hasBlank } = useMemo(() => (f ? columnValues(ctl.wb, ctl.sheet, f, col) : { values: [], hasBlank: false }), [ctl, f, col]);
  const mevcut = f?.columns[col - (f?.range.c1 ?? 0)];
  const [secili, setSecili] = useState<Set<string>>(() => {
    if (mevcut?.kind === "values") {
      const up = new Set(mevcut.values.map((v) => v.toLocaleUpperCase("tr-TR")));
      return new Set(values.filter((v) => up.has(v.toLocaleUpperCase("tr-TR"))));
    }
    return new Set(values);
  });
  const [bos, setBos] = useState(mevcut?.kind === "values" ? mevcut.blanks : true);
  const [ara, setAra] = useState("");
  if (!f) return <p className="m-tablo-empty">Bu sütunda filtre yok.</p>;
  const q = ara.trim().toLocaleUpperCase("tr-TR");
  const gorunen = q ? values.filter((v) => v.toLocaleUpperCase("tr-TR").includes(q)) : values;
  const hepsi = gorunen.every((v) => secili.has(v)) && (!hasBlank || q !== "" || bos);
  const tumu = () => {
    const s = new Set(secili);
    if (hepsi) gorunen.forEach((v) => s.delete(v));
    else gorunen.forEach((v) => s.add(v));
    setSecili(s);
    if (!q && hasBlank) setBos(!hepsi);
  };
  const degistir = (v: string) => {
    const s = new Set(secili);
    if (s.has(v)) s.delete(v);
    else s.add(v);
    setSecili(s);
  };
  const hicbiri = secili.size === 0 && !(hasBlank && bos);
  const uygula = () => {
    if (!onayla(ctl)) return;
    const tam = values.every((v) => secili.has(v)) && (!hasBlank || bos);
    setColumnFilter(ctl, f, col, tam ? null : { kind: "values", values: values.filter((v) => secili.has(v)), blanks: hasBlank && bos });
    filtreBildir(ctl);
    onDone();
  };
  const sirala = (desc: boolean) => {
    if (!onayla(ctl)) return;
    ctl.selectCell(f.range.r1, col, false);
    quickSort(ctl, desc);
    onDone();
  };
  return (
    <div className="m-tablo-filter">
      <div className="m-tablo-segment" role="group" aria-label="Sırala">
        <button type="button" className="m-btn" onClick={() => sirala(false)}>
          <TextSortAscending24Regular /> A'dan Z'ye
        </button>
        <button type="button" className="m-btn" onClick={() => sirala(true)}>
          <TextSortDescending24Regular /> Z'den A'ya
        </button>
      </div>
      {values.length > 8 && <input className="m-tablo-search" type="search" placeholder="Değerlerde ara" aria-label="Değerlerde ara" value={ara} onChange={(e) => setAra(e.target.value)} />}
      <div className="m-tablo-list m-tablo-filter-list" role="group" aria-label="Gösterilecek değerler">
        <MenuItem label={q ? "Tüm arama sonuçlarını seç" : "Tümünü seç"} checked={hepsi} onClick={tumu} />
        {gorunen.slice(0, 500).map((v) => (
          <MenuItem key={v} label={v} checked={secili.has(v)} onClick={() => degistir(v)} />
        ))}
        {hasBlank && !q && <MenuItem label="(Boş)" checked={bos} onClick={() => setBos(!bos)} />}
        {q && !gorunen.length && <p className="m-tablo-empty">Eşleşen değer yok.</p>}
      </div>
      <div className="m-confirm-buttons">
        {mevcut && (
          <button
            type="button"
            className="m-btn"
            onClick={() => {
              if (!onayla(ctl)) return;
              setColumnFilter(ctl, f, col, null);
              onDone();
            }}
          >
            Filtreyi kaldır
          </button>
        )}
        <button type="button" className="m-btn is-primary" disabled={hicbiri} onClick={uygula}>
          Uygula
        </button>
      </div>
    </div>
  );
}
