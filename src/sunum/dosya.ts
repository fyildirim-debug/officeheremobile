// Sunum dosya işlemleri: açma (masaüstü okuyucuları), kaydetme biçimi ve adı, yazma.
import { FORMATS, isSunuFormat, readPresentationFile, writePresentationFormat, type SaveFormat, type SunuFormat } from "@sunum/io/formats";
import { blankPresentation } from "@sunum/model/presentation";
import { TEMPLATES } from "@sunum/templates/templates";
import type { Presentation } from "@sunum/model/types";
import { baseOf, extOf, MIME, type OpenedDoc } from "../platform";

export interface AcilanSunu {
  pres: Presentation;
  /** Dosyanın tanınan biçimi (yeni sunuda "pptx"). */
  bicim: SunuFormat;
  /** Ekranda ve kaydederken kullanılacak dosya adı. */
  ad: string;
  /** Açılışta gösterilecek bilgi (eski biçim, makro, şablon). */
  bildirim?: string;
  /** Slayt gösterisi dosyası: gösteri teklif edilir. */
  gosteri?: boolean;
  /** Şablondan yeni sunu (diskte karşılığı yok). */
  yeni?: boolean;
  /** Otomatik kurtarılan taslak: kaydedilmemiş olarak açılır. */
  kurtarildi?: boolean;
}

/** Belgeyi açar: veri yoksa masaüstünün varsayılan yeni sunusu (başlık slaydı). */
export async function sunuAc(doc: OpenedDoc): Promise<AcilanSunu> {
  if (!doc.data) {
    // Yeni boş sunu ya da masaüstü şablonundan (Proje Sunumu, Eğitim…) yeni sunu.
    const t = doc.template ? TEMPLATES.find((x) => x.id === doc.template) : undefined;
    return { pres: t ? t.build() : blankPresentation(), bicim: "pptx", ad: doc.name, yeni: true };
  }
  if (doc.recovered) {
    // Kurtarılan taslak .pptx olarak kodlanmıştır; ad ve kaydetme biçimi özgün belgenin.
    const { pres } = await readPresentationFile(doc.data, doc.recovered.dataName);
    const ek = doc.recovered.ek as { bicim?: string } | undefined;
    return { pres, bicim: ek?.bicim && isSunuFormat(ek.bicim) ? ek.bicim : "pptx", ad: doc.name, kurtarildi: true };
  }
  const { pres, format } = await readPresentationFile(doc.data, doc.name);
  const info = FORMATS[format];
  if (info.template) {
    // Masaüstündeki gibi şablon adsız yeni sunu olarak açılır (özgün dosyanın üzerine yazılmaz).
    return { pres, bicim: "pptx", ad: `${baseOf(doc.name)}.pptx`, yeni: true, bildirim: `“${doc.name}” şablonundan yeni sunu oluşturuldu.` };
  }
  let bildirim: string | undefined;
  if (info.legacy) bildirim = "Bu sunu 97-2003 biçiminde (uyumluluk modu). Kaydedince .pptx olur.";
  else if (info.macro) bildirim = "Bu dosyadaki makrolar yok sayıldı. Kaydedince makrosuz .pptx olur.";
  return { pres, bicim: format, ad: doc.name, bildirim, gosteri: info.show };
}

/** Kaydetme biçimi: biçim yazılabiliyorsa kendisi, değilse .pptx (dönüşür). */
export function kayitBicimi(bicim: string): { bicim: SaveFormat; donusur: boolean } {
  const yazilir = isSunuFormat(bicim) ? FORMATS[bicim].writable : undefined;
  return yazilir ? { bicim: yazilir, donusur: false } : { bicim: "pptx", donusur: true };
}

/** Kaydedilecek dosya adı (uzantı biçime göre). */
export function kayitAdi(ad: string, bicim: SaveFormat): string {
  return `${baseOf(ad) || "Sunu"}.${bicim}`;
}

const SUNUM_MIME: Record<string, string> = {
  ppsx: "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  potx: "application/vnd.openxmlformats-officedocument.presentationml.template",
};

/** Dosya türü (ortak tablo; gösteri ve şablon için sunu türleri). */
export function sunumMime(ad: string): string {
  const e = extOf(ad);
  return MIME[e] ?? SUNUM_MIME[e] ?? "application/octet-stream";
}

/** Sunuyu masaüstü yazıcılarıyla baytlara yazar (başlık özelliği boşsa dosya adı). */
export function sunuBaytlari(pres: Presentation, bicim: SaveFormat, ad: string): Promise<Uint8Array> {
  return writePresentationFormat({ ...pres, props: { ...pres.props, title: pres.props.title || baseOf(ad) } }, bicim);
}

/** Slayt boyutu bilgisi: oran adı ve santimetre. */
export function slaytBoyutu(pres: Pick<Presentation, "width" | "height">): string {
  const cm = (px: number) => ((px / 96) * 2.54).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const r = pres.width / pres.height;
  const ad = Math.abs(r - 16 / 9) < 0.01 ? "Geniş ekran (16:9)" : Math.abs(r - 4 / 3) < 0.01 ? "Standart (4:3)" : Math.abs(r - 16 / 10) < 0.01 ? "16:10" : r >= 1 ? "Özel (yatay)" : "Özel (dikey)";
  return `${ad} · ${cm(pres.width)} × ${cm(pres.height)} cm`;
}
