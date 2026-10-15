// Alttan açılan paneller: yazı tipi, renkler, paragraf, stiller, sayfa yapısı, gezinti, görünüm, belge bilgisi,
// farklı kaydet, menü. Masaüstü şeridinin Giriş, Düzen, Tasarım ve Görünüm sekmelerinin dokunmatik karşılığı.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown24Regular,
  ArrowUp24Regular,
  Checkmark20Regular,
  DocumentMargins24Regular,
  DocumentOnePage24Regular,
  Eye24Regular,
  FontDecrease24Regular,
  FontIncrease24Regular,
  Info24Regular,
  Phone24Regular,
  Print24Regular,
  SaveCopy24Regular,
  Search24Regular,
  Share24Regular,
  TextAlignCenter24Regular,
  TextAlignJustify24Regular,
  TextAlignLeft24Regular,
  TextAlignRight24Regular,
  TextBold24Regular,
  TextBulletListTree24Regular,
  TextClearFormatting24Regular,
  TextIndentDecreaseLtr24Regular,
  TextIndentIncreaseLtr24Regular,
  TextItalic24Regular,
  TextStrikethrough24Regular,
  TextSubscript24Regular,
  TextSuperscript24Regular,
  TextUnderline24Regular,
  ZoomIn24Regular,
  ZoomOut24Regular,
} from "@fluentui/react-icons";
import { FONT_SIZES, HIGHLIGHT_COLORS, STANDARD_COLORS, fontStack, themeShades, type ThemePalette } from "@officehere/core";
import type { FormatState } from "@belge/editor/formatState";
import { FORMATS, type FormatId } from "@belge/io";
import { previewStyle, type StyleDef } from "@belge/model/styles";
import { MARGIN_PRESETS, PAGE_SIZE_LIST, fmtCm, marginPresetId, pageSizeId, type PageSetup } from "@belge/model/document";
import { Sheet } from "../shell/Toolbar";
import { toast } from "../shell/feedback";
import { YAZDIR_ETIKETI, YAZDIR_IPUCU } from "../shell/yazdir";
import { MOBIL_YAZI_TIPLERI, yaziTipiListesi } from "../shell/yaziTipleri";
import { KAYIT_BICIMLERI } from "./kayit";
import type { Hiza } from "./komutlar";
import type { Baslik } from "./gezinme";

export type PanelId = "yazi" | "renk" | "vurgu" | "paragraf" | "stil" | "sayfa" | "gezinti" | "gorunum" | "bilgi" | "farkli" | "menu";

/** Biçimlendirme panelleri (açıkken belge görünür kalır, klavye kapanır). */
export const BICIM_PANELLERI: PanelId[] = ["yazi", "renk", "vurgu", "paragraf", "stil", "sayfa"];

/** Masaüstü yazı tipi listesinden mobilde sunulanlar. */
export { MOBIL_YAZI_TIPLERI };

/** Masaüstü stil galerisinden paragraf stilleri. */
export const MOBIL_STILLER = ["Normal", "NoSpacing", "Title", "Subtitle", "Heading1", "Heading2", "Heading3", "Quote", "IntenseQuote", "ListParagraph"];

const SATIR_ARALIKLARI = [1, 1.15, 1.5, 2, 2.5, 3];

const fmtSayi = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

export function Dugme({ label, active, onClick, children, disabled }: { label: string; active?: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className={`m-belge-dugme${active ? " is-active" : ""}`} aria-label={label} title={label} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Yazı tipi                                                           */
/* ------------------------------------------------------------------ */

export interface YaziTipiProps {
  fmt: FormatState;
  onFont: (ad: string) => void;
  onSize: (pt: number) => void;
  onStep: (yon: 1 | -1) => void;
  onMark: (tur: "bold" | "italic" | "underline" | "strike" | "subscript" | "superscript", acik: boolean) => void;
  onClear: () => void;
}

export function YaziTipiIcerik({ fmt, onFont, onSize, onStep, onMark, onClear }: YaziTipiProps) {
  const fonts = yaziTipiListesi(fmt.font);
  return (
    <>
      <div className="m-belge-satir">
        <Dugme label="Yazı tipini küçült" onClick={() => onStep(-1)}>
          <FontDecrease24Regular />
        </Dugme>
        <PuntoKutusu deger={fmt.size} onSize={onSize} />
        <Dugme label="Yazı tipini büyült" onClick={() => onStep(1)}>
          <FontIncrease24Regular />
        </Dugme>
        <span className="m-belge-ayrac" />
        <Dugme label="Tüm biçimlendirmeyi temizle" onClick={onClear}>
          <TextClearFormatting24Regular />
        </Dugme>
      </div>
      <div className="m-belge-cipler" role="listbox" aria-label="Yazı tipi boyutları">
        {FONT_SIZES.map((s) => (
          <button key={s} type="button" role="option" aria-selected={Math.abs(fmt.size - s) < 0.01} className={`m-chip${Math.abs(fmt.size - s) < 0.01 ? " is-on" : ""}`} onClick={() => onSize(s)}>
            {fmtSayi(s)}
          </button>
        ))}
      </div>
      <div className="m-belge-satir">
        <Dugme label="Kalın" active={fmt.bold} onClick={() => onMark("bold", fmt.bold)}>
          <TextBold24Regular />
        </Dugme>
        <Dugme label="İtalik" active={fmt.italic} onClick={() => onMark("italic", fmt.italic)}>
          <TextItalic24Regular />
        </Dugme>
        <Dugme label="Altı çizili" active={!!fmt.underline} onClick={() => onMark("underline", !!fmt.underline)}>
          <TextUnderline24Regular />
        </Dugme>
        <Dugme label="Üstü çizili" active={fmt.strike} onClick={() => onMark("strike", fmt.strike)}>
          <TextStrikethrough24Regular />
        </Dugme>
        <Dugme label="Alt simge" active={fmt.sub} onClick={() => onMark("subscript", fmt.sub)}>
          <TextSubscript24Regular />
        </Dugme>
        <Dugme label="Üst simge" active={fmt.sup} onClick={() => onMark("superscript", fmt.sup)}>
          <TextSuperscript24Regular />
        </Dugme>
      </div>
      <h3 className="m-belge-baslik">Yazı tipi</h3>
      <div className="m-list" role="listbox" aria-label="Yazı tipi">
        {fonts.map((f) => (
          <button key={f} type="button" role="option" aria-selected={f === fmt.font} className={`m-list-item${f === fmt.font ? " is-on" : ""}`} onClick={() => onFont(f)}>
            <span style={{ fontFamily: fontStack(f), fontSize: 17 }}>{f}</span>
            {f === fmt.font && <Checkmark20Regular className="m-list-check" />}
          </button>
        ))}
      </div>
    </>
  );
}

/** Yazı tipi boyutunu yazarak girme (listede olmayan boyutlar: 10,5, 13, 15…); Enter ya da odaktan çıkınca uygulanır. */
export function PuntoKutusu({ deger, onSize }: { deger: number; onSize: (pt: number) => void }) {
  const [metin, setMetin] = useState<string | null>(null);
  const uygula = () => {
    if (metin === null) return;
    setMetin(null);
    const v = Number(metin.trim().replace(",", "."));
    if (!metin.trim() || v === deger) return;
    if (!Number.isFinite(v) || v < 1 || v > 1638) {
      toast("Yazı tipi boyutu 1 ile 1638 arasında olmalı.", "error");
      return;
    }
    onSize(Math.round(v * 2) / 2);
  };
  return (
    <input
      className="m-belge-boyut m-belge-punto"
      aria-label="Yazı tipi boyutu"
      inputMode="decimal"
      enterKeyHint="done"
      autoComplete="off"
      value={metin ?? fmtSayi(deger)}
      onFocus={(e) => {
        setMetin(fmtSayi(deger));
        const el = e.currentTarget;
        requestAnimationFrame(() => document.activeElement === el && el.select());
      }}
      onChange={(e) => setMetin(e.target.value.replace(".", ","))}
      onBlur={uygula}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          // Odaktan çıkınca uygulanır (klavye kapanır)
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setMetin(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Renkler                                                             */
/* ------------------------------------------------------------------ */

function Ornek({ renk, secili, onSec }: { renk: string; secili: boolean; onSec: (c: string) => void }) {
  return <button type="button" className={`m-belge-ornek${secili ? " is-on" : ""}`} style={{ background: renk }} aria-label={renk} title={renk} aria-pressed={secili} onClick={() => onSec(renk)} />;
}

/** Yazı tipi rengi ya da sayfa rengi (tema renkleri ve tonları, standart renkler) ya da vurgu rengi paleti (masaüstü paletleri). */
export function RenkIcerik({ tur, deger, tema, onSec }: { tur: "yazi" | "vurgu" | "sayfa"; deger: string | null; tema: ThemePalette; onSec: (c: string | null) => void }) {
  const norm = deger?.toUpperCase() ?? null;
  if (tur === "vurgu") {
    return (
      <>
        <div className="m-belge-renkler is-vurgu">
          {HIGHLIGHT_COLORS.map((c) => (
            <Ornek key={c} renk={c} secili={norm === c} onSec={onSec} />
          ))}
        </div>
        <button type="button" className="m-list-item m-belge-renksiz" onClick={() => onSec(null)}>
          <i className="m-belge-yok" aria-hidden />
          <span>Renk yok</span>
        </button>
      </>
    );
  }
  const cols = tema.colors.map((c) => themeShades(c));
  return (
    <>
      <button type="button" className="m-list-item m-belge-renksiz" onClick={() => onSec(null)}>
        <i className={tur === "sayfa" ? "m-belge-yok" : "m-belge-oto"} aria-hidden />
        <span>{tur === "sayfa" ? "Renk yok" : "Otomatik"}</span>
        {!norm && <Checkmark20Regular className="m-list-check" />}
      </button>
      <h3 className="m-belge-baslik">Tema renkleri</h3>
      <div className="m-belge-renkler">
        {[0, 1, 2, 3, 4, 5].map((row) => cols.map((col, i) => <Ornek key={`${row}-${i}`} renk={col[row]} secili={norm === col[row].toUpperCase()} onSec={onSec} />))}
      </div>
      <h3 className="m-belge-baslik">Standart renkler</h3>
      <div className="m-belge-renkler">
        {STANDARD_COLORS.map((c) => (
          <Ornek key={c} renk={c} secili={norm === c} onSec={onSec} />
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Paragraf                                                            */
/* ------------------------------------------------------------------ */

export interface ParagrafProps {
  fmt: FormatState;
  /** Etkin paragraf öncesi/sonrası boşluk (nk; kendi değeri yoksa stilinki). */
  bosluk: { once: number; sonra: number };
  onAlign: (a: Hiza) => void;
  onIndent: (yon: 1 | -1) => void;
  onLine: (v: number) => void;
  onSpace: (kenar: "spaceBefore" | "spaceAfter", nk: number) => void;
}

/** Paragraf boşluğu adımı (nk); masaüstündeki gibi 6 nk. */
const BOSLUK_ADIM = 6;

function BoslukSatiri({ ad, deger, onSec }: { ad: string; deger: number; onSec: (nk: number) => void }) {
  const kucuk = Math.max(0, Math.ceil(deger / BOSLUK_ADIM - 1.001) * BOSLUK_ADIM);
  const buyuk = Math.floor(deger / BOSLUK_ADIM + 1.001) * BOSLUK_ADIM;
  return (
    <div className="m-belge-satir" role="group" aria-label={`Paragraf ${ad.toLocaleLowerCase("tr-TR")}`}>
      <span className="m-belge-etiket">{ad}</span>
      <Dugme label={`${ad} boşluğu azalt`} disabled={deger <= 0} onClick={() => onSec(kucuk)}>
        <span className="m-belge-isaret" aria-hidden>
          −
        </span>
      </Dugme>
      <output className="m-belge-boyut is-genis" aria-label={`${ad} boşluğu`}>
        {fmtSayi(deger)} nk
      </output>
      <Dugme label={`${ad} boşluğu artır`} disabled={deger >= 1584} onClick={() => onSec(Math.min(1584, buyuk))}>
        <span className="m-belge-isaret" aria-hidden>
          +
        </span>
      </Dugme>
    </div>
  );
}

export const HIZALAR: { id: Hiza; label: string; icon: ReactNode }[] = [
  { id: "left", label: "Sola hizala", icon: <TextAlignLeft24Regular /> },
  { id: "center", label: "Ortala", icon: <TextAlignCenter24Regular /> },
  { id: "right", label: "Sağa hizala", icon: <TextAlignRight24Regular /> },
  { id: "justify", label: "İki yana yasla", icon: <TextAlignJustify24Regular /> },
];

export function ParagrafIcerik({ fmt, bosluk, onAlign, onIndent, onLine, onSpace }: ParagrafProps) {
  const line = (fmt.lineRule ?? "auto") === "auto" ? (fmt.lineHeight ?? 1.08) : null;
  return (
    <>
      <h3 className="m-belge-baslik">Hizalama</h3>
      <div className="m-belge-satir">
        {HIZALAR.map((h) => (
          <Dugme key={h.id} label={h.label} active={fmt.align === h.id} onClick={() => onAlign(h.id)}>
            {h.icon}
          </Dugme>
        ))}
        <span className="m-belge-ayrac" />
        <Dugme label="Girintiyi azalt" onClick={() => onIndent(-1)}>
          <TextIndentDecreaseLtr24Regular />
        </Dugme>
        <Dugme label="Girintiyi artır" onClick={() => onIndent(1)}>
          <TextIndentIncreaseLtr24Regular />
        </Dugme>
      </div>
      <h3 className="m-belge-baslik">Satır aralığı</h3>
      <div className="m-belge-cipler">
        {SATIR_ARALIKLARI.map((v) => (
          <button key={v} type="button" className={`m-chip${line !== null && Math.abs(line - v) < 0.01 ? " is-on" : ""}`} aria-pressed={line !== null && Math.abs(line - v) < 0.01} onClick={() => onLine(v)}>
            {v.toLocaleString("tr-TR", { minimumFractionDigits: 1 })}
          </button>
        ))}
      </div>
      <h3 className="m-belge-baslik">Paragraf aralığı</h3>
      <BoslukSatiri ad="Önce" deger={bosluk.once} onSec={(v) => onSpace("spaceBefore", v)} />
      <BoslukSatiri ad="Sonra" deger={bosluk.sonra} onSec={(v) => onSpace("spaceAfter", v)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Stiller                                                             */
/* ------------------------------------------------------------------ */

export function StilIcerik({ styles, secili, ozel, onSec }: { styles: Record<string, StyleDef>; secili: string; ozel: string[]; onSec: (id: string) => void }) {
  const ids = [...MOBIL_STILLER, ...ozel.filter((id) => !MOBIL_STILLER.includes(id))].filter((id) => styles[id] && styles[id].type === "paragraph");
  return (
    <div className="m-list" role="listbox" aria-label="Stiller">
      {ids.map((id) => (
        <button key={id} type="button" role="option" aria-selected={id === secili} className={`m-list-item m-belge-stil${id === secili ? " is-on" : ""}`} onClick={() => onSec(id)}>
          <span className="m-belge-stil-ornek" style={{ ...previewStyle(styles, id), fontSize: undefined }}>
            {styles[id].name}
          </span>
          {id === secili && <Checkmark20Regular className="m-list-check" />}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sayfa yapısı                                                        */
/* ------------------------------------------------------------------ */

export interface SayfaProps {
  sayfa: PageSetup;
  renk: string | null;
  tema: ThemePalette;
  onBoyut: (id: string) => void;
  onYon: (yon: "portrait" | "landscape") => void;
  onKenar: (id: string) => void;
  onRenk: (c: string | null) => void;
}

/** Kâğıt boyutu (A5 dahil), yönlendirme, kenar boşlukları ve sayfa rengi (masaüstü Düzen ve Tasarım). */
export function SayfaIcerik({ sayfa, renk, tema, onBoyut, onYon, onKenar, onRenk }: SayfaProps) {
  const boyut = pageSizeId(sayfa);
  const kenar = marginPresetId(sayfa);
  const cip = (on: boolean, label: string, onClick: () => void, aria?: string) => (
    <button key={label} type="button" className={`m-chip${on ? " is-on" : ""}`} aria-pressed={on} aria-label={aria} onClick={onClick}>
      {label}
    </button>
  );
  return (
    <>
      <h3 className="m-belge-baslik">Kâğıt boyutu</h3>
      <div className="m-belge-cipler" role="group" aria-label="Kâğıt boyutu">
        {PAGE_SIZE_LIST.map((s) => cip(boyut === s.id, s.label, () => onBoyut(s.id), `${s.label} (${fmtCm(s.w, 1)} x ${fmtCm(s.h, 1)})`))}
      </div>
      <h3 className="m-belge-baslik">Yönlendirme</h3>
      <div className="m-belge-cipler" role="group" aria-label="Yönlendirme">
        {cip(sayfa.orientation === "portrait", "Dikey", () => onYon("portrait"))}
        {cip(sayfa.orientation === "landscape", "Yatay", () => onYon("landscape"))}
      </div>
      <h3 className="m-belge-baslik">Kenar boşlukları</h3>
      <div className="m-belge-cipler" role="group" aria-label="Kenar boşlukları">
        {MARGIN_PRESETS.map((m) => cip(kenar === m.id, m.label, () => onKenar(m.id), `${m.label} kenar boşlukları (${fmtCm(m.m.left)})`))}
      </div>
      <h3 className="m-belge-baslik">Sayfa rengi</h3>
      <RenkIcerik tur="sayfa" deger={renk} tema={tema} onSec={onRenk} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Gezinti                                                             */
/* ------------------------------------------------------------------ */

export interface GezintiProps {
  basliklar: Baslik[];
  /** Görünür alandaki bölümün başlığı (listede işaretlenir). */
  etkin: number;
  /** Sayfa düzeninde geçerli sayfa (1 tabanlı) ve sayfa sayısı; mobil görünümde yok. */
  sayfa: { no: number; toplam: number } | null;
  onBaslik: (pos: number) => void;
  onSayfa: (n: number) => void;
  onUc: (son: boolean) => void;
}

/** Başlık listesiyle atlama (masaüstü Gezinti bölmesi), sayfaya git, başa/sona git. */
export function GezintiIcerik({ basliklar, etkin, sayfa, onBaslik, onSayfa, onUc }: GezintiProps) {
  const liste = useRef<HTMLElement>(null);
  const [no, setNo] = useState("");
  // Uzun listede bulunulan bölüm görünür açılır
  useLayoutEffect(() => {
    liste.current?.querySelector("[aria-current]")?.scrollIntoView({ block: "center" });
  }, []);
  const sayfayaGit = () => {
    if (!sayfa) return;
    const n = parseInt(no, 10);
    if (!Number.isFinite(n) || n < 1 || n > sayfa.toplam) {
      toast(`1 ile ${sayfa.toplam} arasında bir sayfa numarası yazın.`, "error");
      return;
    }
    onSayfa(n - 1);
  };
  return (
    <>
      <div className="m-belge-satir">
        <button type="button" className="m-btn" onClick={() => onUc(false)}>
          <ArrowUp24Regular /> Başa git
        </button>
        <button type="button" className="m-btn" onClick={() => onUc(true)}>
          <ArrowDown24Regular /> Sona git
        </button>
      </div>
      {sayfa && (
        <form
          className="m-belge-satir m-belge-sayfaya"
          onSubmit={(e) => {
            e.preventDefault();
            sayfayaGit();
          }}
        >
          <label htmlFor="m-belge-sayfa-no">Sayfa</label>
          <input id="m-belge-sayfa-no" className="m-belge-boyut m-belge-punto" inputMode="numeric" enterKeyHint="go" autoComplete="off" placeholder={String(sayfa.no)} value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, ""))} />
          <span className="m-muted">/ {sayfa.toplam.toLocaleString("tr-TR")}</span>
          <button type="submit" className="m-btn">
            Git
          </button>
        </form>
      )}
      <h3 className="m-belge-baslik">Başlıklar</h3>
      {basliklar.length ? (
        <nav className="m-list m-belge-gezinti" ref={liste} aria-label="Başlıklar">
          {basliklar.map((b, i) => (
            <button
              key={`${b.pos}-${i}`}
              type="button"
              className={`m-list-item m-belge-gezinti-oge is-d${Math.min(b.level, 6)}${i === etkin ? " is-on" : ""}`}
              aria-current={i === etkin ? "location" : undefined}
              title={b.text}
              onClick={() => onBaslik(b.pos)}
            >
              <span>{b.text}</span>
            </button>
          ))}
        </nav>
      ) : (
        <p className="m-belge-ipucu m-muted">Belgede başlık yok. Başlık eklemek için düzenleme kipinde Stiller'den «Başlık 1» ya da «Başlık 2»yi seçin.</p>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Görünüm                                                             */
/* ------------------------------------------------------------------ */

export function GorunumIcerik({ mod, onMod, zoom, onZoom, onSigdir }: { mod: "print" | "web"; onMod: (m: "print" | "web") => void; zoom: number; onZoom: (yon: 1 | -1) => void; onSigdir: () => void }) {
  return (
    <>
      <div className="m-list">
        <button type="button" className={`m-list-item${mod === "print" ? " is-on" : ""}`} aria-pressed={mod === "print"} onClick={() => onMod("print")}>
          <DocumentOnePage24Regular />
          <span>
            Sayfa düzeni
            <small className="m-belge-alt">Sayfalar masaüstündeki gibi, ekrana sığdırılmış</small>
          </span>
          {mod === "print" && <Checkmark20Regular className="m-list-check" />}
        </button>
        <button type="button" className={`m-list-item${mod === "web" ? " is-on" : ""}`} aria-pressed={mod === "web"} onClick={() => onMod("web")}>
          <Phone24Regular />
          <span>
            Mobil görünüm
            <small className="m-belge-alt">Metin ekran genişliğine akar, sayfa yok</small>
          </span>
          {mod === "web" && <Checkmark20Regular className="m-list-check" />}
        </button>
      </div>
      <h3 className="m-belge-baslik">{mod === "print" ? "Yakınlaştırma" : "Metin boyutu"}</h3>
      <div className="m-belge-satir">
        <Dugme label="Uzaklaştır" onClick={() => onZoom(-1)}>
          <ZoomOut24Regular />
        </Dugme>
        <output className="m-belge-boyut is-genis" aria-label="Yakınlaştırma düzeyi">
          %{Math.round(zoom)}
        </output>
        <Dugme label="Yakınlaştır" onClick={() => onZoom(1)}>
          <ZoomIn24Regular />
        </Dugme>
        <button type="button" className="m-chip" onClick={onSigdir}>
          {mod === "print" ? "Sayfa genişliği" : "%100"}
        </button>
      </div>
      <p className="m-belge-ipucu m-muted">İki parmakla da yakınlaştırabilirsiniz.</p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Belge bilgisi                                                       */
/* ------------------------------------------------------------------ */

export interface Bilgi {
  ad: string;
  bicim: FormatId;
  sayfa: number;
  words: number;
  chars: number;
  charsNoSpaces: number;
  paragraphs: number;
}

export function BilgiIcerik({ b }: { b: Bilgi }) {
  const satir = (k: string, v: ReactNode) => (
    <div className="m-belge-bilgi-satir">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
  const n = (x: number) => x.toLocaleString("tr-TR");
  return (
    <dl className="m-belge-bilgi">
      {satir("Ad", b.ad)}
      {satir("Biçim", FORMATS[b.bicim].label)}
      {satir("Sayfa", n(b.sayfa))}
      {satir("Sözcük", n(b.words))}
      {satir("Karakter (boşluksuz)", n(b.charsNoSpaces))}
      {satir("Karakter (boşluklu)", n(b.chars))}
      {satir("Paragraf", n(b.paragraphs))}
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/* Farklı kaydet ve menü                                               */
/* ------------------------------------------------------------------ */

export function FarkliKaydetIcerik({ ad, onSec }: { ad: string; onSec: (f: FormatId) => void }) {
  const base = ad.replace(/\.[^.]+$/, "");
  return (
    <div className="m-list">
      {KAYIT_BICIMLERI.map((f) => (
        <button key={f} type="button" className="m-list-item" onClick={() => onSec(f)}>
          <span>
            {FORMATS[f].label}
            <small className="m-belge-alt">
              {base}.{FORMATS[f].saveExt}
            </small>
          </span>
        </button>
      ))}
    </div>
  );
}

export interface MenuProps {
  onBul: () => void;
  onGezinti: () => void;
  /** Sayfa yapısı (yalnız düzenleme kipinde). */
  onSayfa?: () => void;
  onGorunum: () => void;
  onPaylas: () => void;
  onYazdir: () => void;
  onFarkli: () => void;
  onBilgi: () => void;
}

export function MenuIcerik({ onBul, onGezinti, onSayfa, onGorunum, onPaylas, onYazdir, onFarkli, onBilgi }: MenuProps) {
  return (
    <div className="m-list">
      <button type="button" className="m-list-item" onClick={onBul}>
        <Search24Regular />
        <span>Bul ve değiştir</span>
      </button>
      <button type="button" className="m-list-item" onClick={onGezinti}>
        <TextBulletListTree24Regular />
        <span>
          Gezinti
          <small className="m-belge-alt">Başlıklar, sayfaya git</small>
        </span>
      </button>
      {onSayfa && (
        <button type="button" className="m-list-item" onClick={onSayfa}>
          <DocumentMargins24Regular />
          <span>
            Sayfa yapısı
            <small className="m-belge-alt">Kâğıt boyutu, kenar boşlukları, sayfa rengi</small>
          </span>
        </button>
      )}
      <button type="button" className="m-list-item" onClick={onGorunum}>
        <Eye24Regular />
        <span>Görünüm</span>
      </button>
      <button type="button" className="m-list-item" onClick={onPaylas}>
        <Share24Regular />
        <span>Paylaş</span>
      </button>
      <button type="button" className="m-list-item" onClick={onYazdir}>
        <Print24Regular />
        <span>
          {YAZDIR_ETIKETI}
          <small className="m-belge-alt">{YAZDIR_IPUCU}</small>
        </span>
      </button>
      <button type="button" className="m-list-item" onClick={onFarkli}>
        <SaveCopy24Regular />
        <span>Farklı kaydet</span>
      </button>
      <button type="button" className="m-list-item" onClick={onBilgi}>
        <Info24Regular />
        <span>Belge bilgisi</span>
      </button>
    </div>
  );
}

export const PANEL_BASLIK: Record<PanelId, string> = {
  yazi: "Yazı tipi",
  renk: "Yazı tipi rengi",
  vurgu: "Metin vurgu rengi",
  paragraf: "Paragraf",
  stil: "Stiller",
  sayfa: "Sayfa yapısı",
  gezinti: "Gezinti",
  gorunum: "Görünüm",
  bilgi: "Belge bilgisi",
  farkli: "Farklı kaydet",
  menu: "Diğer",
};

/** Panel kabuğu: biçimlendirme panelleri modsuz (belge görünür kalır). */
export function Panel({ id, onClose, children }: { id: PanelId | null; onClose: () => void; children: ReactNode }) {
  return (
    <Sheet open={!!id} title={id ? PANEL_BASLIK[id] : ""} onClose={onClose} modeless={!!id && BICIM_PANELLERI.includes(id)}>
      {children}
    </Sheet>
  );
}
