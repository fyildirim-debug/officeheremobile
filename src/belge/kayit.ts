// Kaydetme: hedef ad/biçim seçimi ve belgenin baytlara kodlanması (masaüstü yazıcıları ve kaydetme ayarları).
import { getUserName } from "@officehere/ui";
import { FORMATS, docToText, formatOfExt, htmlDocument, isWritable, writeDocx, writeMarkdown, writeOdt, writeRtf, type FormatId } from "@belge/io";
import type { BelgeDocument } from "@belge/model/document";
import { MIME, baseOf, extOf } from "../platform/formats";

export interface KayitHedefi {
  name: string;
  format: FormatId;
  /** Ad ya da biçim değişti (kullanıcıya bildirilir). */
  donustu: boolean;
}

/** Farklı kaydetmede sunulan biçimler (masaüstü sırası). */
export const KAYIT_BICIMLERI: FormatId[] = ["docx", "odt", "rtf", "md", "txt", "html"];

/**
 * Kaydet: biçim yazılabiliyor ve uzantı biçimle uyuşuyorsa aynı ad ve biçim. Yazılamayan biçim (.doc)
 * .docx olur; şablon/makrolu uzantılar (.dotx, .docm, .ott…) da yazıcının ürettiği biçimin uzantısını alır.
 */
export function kayitHedefi(name: string, format: FormatId): KayitHedefi {
  const ext = extOf(name);
  const extFmt = formatOfExt(ext);
  if (!isWritable(format) || !extFmt || !isWritable(extFmt)) return { name: `${baseOf(name)}.docx`, format: "docx", donustu: true };
  const save = FORMATS[format].saveExt!;
  // Uzantı başka biçimi gösteriyorsa (içerik imzası farklı) içerik biçiminin uzantısı kullanılır.
  if (extFmt !== format) return { name: `${baseOf(name)}.${save}`, format, donustu: true };
  // docx/odt ailesinde şablon ve makrolu uzantılar düz belgeye döner (yazıcı makro/şablon üretmez).
  if ((format === "docx" || format === "odt") && ext !== save) return { name: `${baseOf(name)}.${save}`, format, donustu: true };
  return { name, format, donustu: false };
}

/** Farklı kaydet: ad aynı, uzantı seçilen biçimin. */
export function farkliHedef(name: string, format: FormatId): KayitHedefi {
  const save = FORMATS[format].saveExt ?? "docx";
  const fmt: FormatId = FORMATS[format].saveExt ? format : "docx";
  const yeni = `${baseOf(name)}.${save}`;
  return { name: yeni, format: fmt, donustu: yeni !== name };
}

export function mimeOf(format: FormatId): string {
  return MIME[FORMATS[format].saveExt ?? "docx"] ?? "application/octet-stream";
}

/** Masaüstündeki gibi: yazar boşsa kullanıcı adı, değiştirme tarihi şimdi. */
export function kayitBelgesi(doc: BelgeDocument, now = new Date()): BelgeDocument {
  const p = doc.settings.properties;
  return { content: doc.content, settings: { ...doc.settings, properties: { ...p, author: p.author || getUserName(), modified: now.toISOString() } } };
}

/**
 * Belgeyi biçimine göre kodlar (masaüstü useFileOps.encode ile aynı yazıcılar).
 * html: düzenleyicinin HTML'i (dipnotlar işlenmiş) gerekir.
 */
export async function kodla(format: FormatId, doc: BelgeDocument, opts: { html?: () => string; title: string }): Promise<Uint8Array> {
  const d = kayitBelgesi(doc);
  const metin = (s: string) => new TextEncoder().encode(s);
  switch (format) {
    case "odt":
      return writeOdt(d);
    case "rtf":
      return metin(writeRtf(d));
    case "md":
      return metin(writeMarkdown(d));
    case "html":
      return metin(htmlDocument(opts.html?.() ?? "", d.settings, d.settings.properties.title || opts.title));
    case "txt":
      return metin("﻿" + docToText(d.content));
    default:
      return writeDocx(d);
  }
}
