// Düzenleme kipinin alt araç çubuğu ve biçim panelleri (yazı rengi, hizalama, slayt düzenleri).
import { useMemo } from "react";
import {
  FontDecrease24Regular,
  FontIncrease24Regular,
  SlideAdd24Regular,
  TextAlignCenter24Regular,
  TextAlignJustify24Regular,
  TextAlignLeft24Regular,
  TextAlignRight24Regular,
  TextBold24Regular,
  TextBulletListLtr24Regular,
  TextColor24Regular,
  TextItalic24Regular,
  TextNumberListLtr24Regular,
  TextUnderline24Regular,
} from "@fluentui/react-icons";
import { STANDARD_COLORS } from "@officehere/core";
import { cssColor, colorLabel } from "@sunum/model/color";
import { SCHEME_ORDER, type Align, type Color, type Layout, type Presentation, type Theme } from "@sunum/model/types";
import { SlideView } from "@sunum/render/SlideView";
import { layoutPreviewSlide } from "@sunum/ribbon/common";
import { applyRun, common, growFont, setListStyle, type TextInfo } from "@sunum/state/textActions";
import type { Actions } from "@sunum/state/actions";
import { BottomToolbar, ToolButton } from "../shell/Toolbar";
import { koyuOnizleme, type KoyuSunu } from "./koyu";

export const HIZALAR: { id: Align; label: string; icon: React.ReactElement }[] = [
  { id: "l", label: "Sola hizala", icon: <TextAlignLeft24Regular /> },
  { id: "ctr", label: "Ortala", icon: <TextAlignCenter24Regular /> },
  { id: "r", label: "Sağa hizala", icon: <TextAlignRight24Regular /> },
  { id: "just", label: "İki yana yasla", icon: <TextAlignJustify24Regular /> },
];

export type Panel = "renk" | "hiza" | "duzen";

export function DuzenAracCubugu({ a, info, onPanel, theme }: { a: Actions; info: TextInfo | null; onPanel: (p: Panel) => void; theme: Theme }) {
  const runs = info?.runs ?? [];
  const has = !!info;
  const all = (k: "bold" | "italic" | "underline") => runs.length > 0 && runs.every((r) => !!r[k]);
  const toggle = (k: "bold" | "italic" | "underline") => {
    const on = !all(k);
    applyRun(a, (p) => ({ ...p, [k]: on }));
  };
  const size = common<number>(runs, "size");
  const para = info?.para;
  const bu = para?.bullet;
  const hiza = HIZALAR.find((h) => h.id === (para?.align ?? "l")) ?? HIZALAR[0];
  const renk = common<Color>(runs, "color");
  return (
    <BottomToolbar label="Düzenleme araçları">
      <ToolButton icon={<SlideAdd24Regular />} label="Yeni slayt" onClick={() => onPanel("duzen")} />
      <span className="m-sunum-ayrac" aria-hidden />
      <ToolButton icon={<TextBold24Regular />} label="Kalın" active={has && all("bold")} disabled={!has} onClick={() => toggle("bold")} />
      <ToolButton icon={<TextItalic24Regular />} label="İtalik" active={has && all("italic")} disabled={!has} onClick={() => toggle("italic")} />
      <ToolButton icon={<TextUnderline24Regular />} label="Altı çizili" active={has && all("underline")} disabled={!has} onClick={() => toggle("underline")} />
      <ToolButton icon={<FontDecrease24Regular />} label="Yazı boyutunu küçült" disabled={!has} onClick={() => growFont(a, -1)} />
      <span className={`m-sunum-boyut${has ? "" : " is-pasif"}`} aria-label="Yazı boyutu" title="Yazı boyutu">
        {has && size !== undefined ? size.toLocaleString("tr-TR", { maximumFractionDigits: 1 }) : "–"}
      </span>
      <ToolButton icon={<FontIncrease24Regular />} label="Yazı boyutunu büyüt" disabled={!has} onClick={() => growFont(a, 1)} />
      <ToolButton
        icon={
          <span className="m-sunum-renkcizgi">
            <TextColor24Regular />
            <i style={{ background: renk ? cssColor(renk, theme) : "currentColor" }} />
          </span>
        }
        label="Yazı rengi"
        disabled={!has}
        onClick={() => onPanel("renk")}
      />
      <ToolButton icon={hiza.icon} label="Hizalama" disabled={!has} onClick={() => onPanel("hiza")} />
      <ToolButton
        icon={<TextBulletListLtr24Regular />}
        label="Madde işaretleri"
        active={has && bu?.type === "char"}
        disabled={!has}
        onClick={() => setListStyle(a, bu?.type === "char" ? { type: "none" } : { type: "char", char: "•", font: "Arial" }, !para?.marL)}
      />
      <ToolButton
        icon={<TextNumberListLtr24Regular />}
        label="Numaralandırma"
        active={has && bu?.type === "auto"}
        disabled={!has}
        onClick={() => setListStyle(a, bu?.type === "auto" ? { type: "none" } : { type: "auto", scheme: "arabicPeriod" })}
      />
    </BottomToolbar>
  );
}

const same = (a: Color | undefined, b: Color) => !!a && JSON.stringify(a) === JSON.stringify(b);

/** Yazı rengi: tema renkleri, standart renkler ve Otomatik (kalıtılan renk). */
export function RenkPaneli({ theme, value, onPick }: { theme: Theme; value?: Color; onPick: (c: Color | null) => void }) {
  const tema = SCHEME_ORDER.map((n) => ({ c: { scheme: n } as Color, css: cssColor({ scheme: n }, theme), label: colorLabel({ scheme: n }) }));
  const std = STANDARD_COLORS.map((h) => ({ c: { rgb: h } as Color, css: h, label: h }));
  const sw = (list: typeof tema) =>
    list.map((x) => (
      <button key={x.label} type="button" className={`m-sunum-renk${same(value, x.c) ? " is-on" : ""}`} style={{ background: x.css }} aria-label={x.label} title={x.label} aria-pressed={same(value, x.c)} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(x.c)} />
    ));
  return (
    <div className="m-sunum-palet">
      <h3>Tema renkleri</h3>
      <div className="m-sunum-palet-izgara">{sw(tema)}</div>
      <h3>Standart renkler</h3>
      <div className="m-sunum-palet-izgara">{sw(std)}</div>
      <button type="button" className="m-sunum-otomatik" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(null)}>
        <i aria-hidden />
        Otomatik
      </button>
    </div>
  );
}

export function HizaPaneli({ value, onPick }: { value?: Align; onPick: (al: Align) => void }) {
  return (
    <div className="m-sunum-hiza">
      {HIZALAR.map((h) => (
        <ToolButton key={h.id} icon={h.icon} label={h.label} showLabel active={(value ?? "l") === h.id} onClick={() => onPick(h.id)} />
      ))}
    </div>
  );
}

function DuzenOnizleme({ pres, layout, koyu, width }: { pres: Presentation; layout: Layout; koyu: KoyuSunu | null; width: number }) {
  const { p, slide, cls } = useMemo(() => {
    const sl = layoutPreviewSlide(layout);
    const d = koyu?.duzen(layout);
    if (!d?.koyu) return { p: pres, slide: sl, cls: undefined };
    return { p: d.pres, slide: koyuOnizleme(pres, sl), cls: d.className };
  }, [pres, layout, koyu]);
  const k = width / pres.width;
  return (
    <span className="m-sunum-thumb-img" style={{ width, height: pres.height * k }}>
      <SlideView pres={p} slide={slide} slideNumber={1} mode="edit" className={cls} style={{ transform: `scale(${k})`, transformOrigin: "0 0", position: "absolute", left: 0, top: 0, pointerEvents: "none" }} />
    </span>
  );
}

/** Masaüstü düzen listesi (Başlık Slaytı, Başlık ve İçerik, Bölüm Üst Bilgisi…). */
export function DuzenPaneli({ pres, koyu, onPick }: { pres: Presentation; koyu: KoyuSunu | null; onPick: (layoutId: string) => void }) {
  return (
    <div className="m-sunum-duzenler">
      {pres.layouts.map((l) => (
        <button key={l.id} type="button" className="m-sunum-duzen" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(l.id)}>
          <DuzenOnizleme pres={pres} layout={l} koyu={koyu} width={112} />
          <span>{l.name}</span>
        </button>
      ))}
    </div>
  );
}

