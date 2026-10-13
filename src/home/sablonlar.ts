// Şablondan yeni belge: masaüstü Dosya › Yeni şablonları (OfficeHere'in kendi Türkçe tasarımları).
// Liste burada sabittir (başlangıç ekranı uygulama kodunu yüklemesin); ekran açılınca şablon
// masaüstü kodunun build() işleviyle kurulur. sablonlar.test.ts masaüstü listesiyle eşleştiğini denetler.
import type { AppKind, OpenedDoc } from "../platform";

export interface Sablon {
  app: AppKind;
  id: string;
  label: string;
}

export const SABLONLAR: Sablon[] = [
  { app: "belge", id: "letter", label: "Mektup" },
  { app: "belge", id: "resume", label: "Özgeçmiş" },
  { app: "belge", id: "report", label: "Rapor" },
  { app: "belge", id: "meeting", label: "Toplantı Notları" },
  { app: "belge", id: "petition", label: "Dilekçe" },
  { app: "tablo", id: "budget", label: "Aylık Bütçe" },
  { app: "tablo", id: "invoice", label: "Fatura" },
  { app: "tablo", id: "todo", label: "Yapılacaklar Listesi" },
  { app: "tablo", id: "sales", label: "Satış Raporu" },
  { app: "sunum", id: "project", label: "Proje Sunumu" },
  { app: "sunum", id: "training", label: "Eğitim" },
  { app: "sunum", id: "product", label: "Ürün Tanıtımı" },
  { app: "sunum", id: "meeting", label: "Toplantı" },
  { app: "sunum", id: "company", label: "Şirket Tanıtımı" },
];

const UZANTI: Record<AppKind, string> = { belge: "docx", tablo: "xlsx", sunum: "pptx" };

/** Şablondan yeni, kaydedilmemiş belge (ad şablonun adı; masaüstündeki gibi). */
export function sablondanYeni(s: Sablon): OpenedDoc {
  return { name: `${s.label}.${UZANTI[s.app]}`, data: null, app: s.app, template: s.id };
}
