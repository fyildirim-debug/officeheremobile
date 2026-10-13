// Koyu Sayfa'da dolgular ve grafikler (yalnız ekranda, CSS ile; model, yazdırma ve kayıt değişmez).
// Ölçüt ve formüller Tablo/Sunum'la aynı (darkCanvas): açık nötr/pastel dolgu aynı renk tonunda koyulaşır
// (beyaz → #1E1E1E) ve içindeki koyu metin Koyu Sayfa mürekkep kuralıyla açılır; belirgin/doygun dolgu
// (sarı vurgu, koyu mavi başlık) kâğıttaki gibi kalır ve metni özgün rengini korur. Grafiğin zemini koyu,
// yazıları açık, kılavuz çizgileri koyu tona döner; seri renkleri ve resimler değişmez. Masaüstü kuralının
// beyaz zemin verdiği tablo stilleri (grid-/list-/light-) de bu kurala uyar. Sayfanın kendi rengi varsa
// masaüstündeki gibi hiçbiri uygulanmaz (kapsam seçicisi).
import type { JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { DocSettings } from "@belge/model/document";
import type { StyleDef } from "@belge/model/styles";
import { darkGround, ink, lightNeutral, parseColor } from "../tablo/darkCanvas";

/** Masaüstü dark-page.css kapsamı (+ .m-belge: masaüstü kurallarından özgül). */
export const KOYU_KAPSAM = ':root[data-bl-page="dark"] .m-belge .bl-workspace:not(.bl-offscreen *):not(:has(.bl-pages > :is(.bl-page, .bl-body)[style*="background"]))';

/** Koyu Sayfa mürekkep formülü (masaüstü dark-page.css ile aynı). */
const MUREKKEP = "oklch(from currentColor clamp(l, calc((0.5 - l) * 1000), calc(0.92 - 0.55 * l)) c h)";
const ACIK_METIN = `-webkit-text-fill-color:${MUREKKEP};text-decoration-color:${MUREKKEP};caret-color:#e4e4e4`;
const KAGIT_METIN = "-webkit-text-fill-color:currentColor;text-decoration-color:currentColor;caret-color:currentColor";

/** Belge düğüm/işaret özniteliklerinden zemin renkleri: metin kutusu dolgusu, gölgelendirme, hücre, vurgu. */
export function zeminRenkleri(doc: PMNode, settings?: DocSettings): string[] {
  const out = new Set<string>();
  const ekle = (v: unknown) => {
    if (typeof v === "string" && v.trim() && v !== "transparent") out.add(v.trim());
  };
  const isaretler = (marks: readonly { type: { name: string } | string; attrs?: Record<string, unknown> }[] | undefined) => {
    for (const m of marks ?? []) {
      ekle(m.attrs?.backgroundColor);
      if ((typeof m.type === "string" ? m.type : m.type.name) === "highlight") ekle(m.attrs?.color);
    }
  };
  const json = (j: JSONContent | null | undefined) => {
    if (!j) return;
    ekle(j.attrs?.fill);
    ekle(j.attrs?.shading);
    ekle(j.attrs?.background);
    isaretler(j.marks as never);
    j.content?.forEach(json);
  };
  doc.descendants((n) => {
    ekle(n.attrs.fill);
    ekle(n.attrs.shading);
    ekle(n.attrs.background);
    isaretler(n.marks);
    // Dipnot/son not metni düğüm özniteliğinde.
    if (n.type.name === "note") (n.attrs.content as JSONContent[] | null)?.forEach(json);
    return true;
  });
  if (settings) {
    for (const k of ["header", "footer", "headerFirst", "footerFirst", "headerEven", "footerEven"] as const) json(settings[k]);
    for (const hf of Object.values(settings.sectionHf ?? {})) for (const j of Object.values(hf)) json(j);
  }
  return [...out];
}

const esc = (s: string) => s.replace(/["\\]/g, "\\$&");

/**
 * Rengin satır içi zemin olarak yazıldığı öğeler: düğüm görünümlerinin ham yazımı ("background:#DAE9F7")
 * ve tarayıcının CSSOM'dan yeniden yazdığı biçim ("background-color: rgb(226, 239, 217);").
 */
function zeminSecicileri(c: string): string[] {
  const v = esc(c);
  const sel: string[] = [];
  for (const p of ["background-color:", "background-color: ", "background:", "background: "]) sel.push(`[style*="${p}${v};" i]`, `[style$="${p}${v}" i]`);
  const rgb = parseColor(c);
  if (rgb) {
    const n = rgb[3] < 1 ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${rgb[3]})` : `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    sel.push(`[style*="background-color: ${n}"]`, `[style*="background: ${n}"]`);
  }
  sel.push(`[data-bg="${v}" i]`, `mark[data-color="${v}" i]`);
  return sel;
}

/** Masaüstü document.css tablo stillerinin dolgulu bölgeleri. */
const TABLO_DOLGULARI: { sel: string; bg: string }[] = (() => {
  const t = (id: string) => `table[data-table-style="${id}"]`;
  const bas = (id: string) => `${t(id)}[data-header-row="true"] tr:first-child > *`;
  const bant = (id: string) => `${t(id)}[data-banded-rows="true"] tr:nth-child(even of :not(.bl-pg)) > *:not([data-bg])`;
  return [
    { sel: bas("grid-blue"), bg: "#156082" },
    { sel: bant("grid-blue"), bg: "#c1e4f5" },
    { sel: `${t("grid-blue")}:not([data-header-row="true"])[data-banded-rows="true"] tr:nth-child(odd of :not(.bl-pg)) > *:not([data-bg])`, bg: "#c1e4f5" },
    { sel: bas("grid-orange"), bg: "#e97132" },
    { sel: bant("grid-orange"), bg: "#fbe2d5" },
    { sel: bas("grid-green"), bg: "#196b24" },
    { sel: bant("grid-green"), bg: "#c1f0c7" },
    { sel: bas("grid-gray"), bg: "#000000" },
    { sel: bant("grid-gray"), bg: "#cccccc" },
    { sel: bas("list-blue"), bg: "#156082" },
    { sel: bas("light-blue"), bg: "#dae9f7" },
    { sel: bant("light-blue"), bg: "#f2f7fc" },
    { sel: bas("light-purple"), bg: "#f2ceef" },
    { sel: bant("light-purple"), bg: "#faebf8" },
  ];
})();

const DOLGULU_TABLO = 'table:is([data-table-style^="grid-"], [data-table-style^="list-"], [data-table-style^="light-"])';

/** Belgeden bağımsız kurallar: dolgulu tablo stilleri ve grafik (ChartSvg renkleri). */
export function sabitKoyuCss(S = KOYU_KAPSAM): string {
  const r: string[] = [];
  const d = `${S} .bl-doc`;
  // Masaüstü bu tablolara beyaz zemin ve kâğıt metni verir: zemin sayfanın olur, metin açılır.
  r.push(`${d} ${DOLGULU_TABLO}{background:transparent}`);
  r.push(`${d} ${DOLGULU_TABLO},${d} ${DOLGULU_TABLO} *{${ACIK_METIN}}`);
  for (const { sel, bg } of TABLO_DOLGULARI) {
    if (lightNeutral(bg)) r.push(`${d} ${sel}{background:${darkGround(bg)}}`);
    else r.push(`${d} ${sel},${d} ${sel} *{${KAGIT_METIN}}`);
  }
  // Grafik: alan zemini ve çerçevesi, yazılar, kılavuz/eksen çizgileri, dilim ayraçları.
  const g = `${d} .bl-chart svg`;
  r.push(`${g} > rect:first-child{fill:${darkGround("#FFFFFF")};stroke:${darkGround("#D9D9D9")}}`);
  r.push(`${g} text[fill="#595959" i]{fill:${ink("#595959")}}`);
  r.push(`${g} line[stroke="#d9d9d9" i]{stroke:${darkGround("#D9D9D9")}}`);
  r.push(`${g} line[stroke="#bfbfbf" i]{stroke:${darkGround("#BFBFBF")}}`);
  r.push(`${g} :is(path, circle)[stroke="#fff" i]{stroke:${darkGround("#FFFFFF")}}`);
  return r.join("\n");
}

/**
 * Belgedeki zemin renklerine göre kurallar. Açık nötr/pastel dolgular koyulaşır ve metni açılır;
 * diğer dolgular kâğıttaki gibi kalır (içindeki koyulaşan dolgu yine açık metinle çizilir).
 */
export function koyuNesneCss(renkler: string[], styles: Record<string, StyleDef> = {}, S = KOYU_KAPSAM): string {
  const r: string[] = [];
  const d = `${S} .bl-doc`;
  const acik: string[] = [];
  for (const c of renkler) {
    if (!parseColor(c) || !lightNeutral(c)) continue;
    const sel = zeminSecicileri(c);
    acik.push(...sel);
    r.push(`${d} :is(${sel.join(",")}){background-color:${darkGround(c)} !important}`);
  }
  const M = acik.length ? `:is(${acik.join(",")})` : "";
  if (M) r.push(`${d} ${M},${d} ${M} *{${ACIK_METIN}}`);
  // Kâğıttaki gibi kalan dolgular (dolgulu tablo stilinin açık metin kuralını da geçersiz kılar).
  const kagit = `:is(mark,.bl-hit,[data-bg],[style*="background"]):not([style*="background:transparent"],[style*="background: transparent"])${M ? `:not(${M})` : ""}`;
  r.push(`${d} ${kagit},${d} ${kagit} *{${KAGIT_METIN}}`);
  if (M) {
    r.push(`${d} ${kagit} ${M},${d} ${kagit} ${M} *{${ACIK_METIN}}`);
    for (const { sel, bg } of TABLO_DOLGULARI) if (!lightNeutral(bg)) r.push(`${d} ${sel} ${M},${d} ${sel} ${M} *{${ACIK_METIN}}`);
  }
  // Paragraf stillerindeki gölgelendirme (stil sayfası kuralı; satır içi değil).
  for (const [id, def] of Object.entries(styles)) {
    const sh = def.props?.shading;
    if (def.type !== "paragraph" || !sh || !parseColor(sh)) continue;
    const sel = def.level ? `h${def.level}` : `p[data-style="${esc(id)}"]`;
    if (lightNeutral(sh)) r.push(`${d} ${sel}{background-color:${darkGround(sh)}}`);
    else r.push(`${d} ${sel},${d} ${sel} *{${KAGIT_METIN}}`);
  }
  return r.join("\n");
}
