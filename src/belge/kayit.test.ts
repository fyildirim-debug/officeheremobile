// @vitest-environment jsdom
// Kaydetme: hedef ad/biçim seçimi ve masaüstü yazıcılarıyla kodlama (gidiş-dönüş).
import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { defaultSettings, type BelgeDocument } from "@belge/model/document";
import { openDocument } from "@belge/io";
import { KAYIT_BICIMLERI, farkliHedef, kayitBelgesi, kayitHedefi, kodla, mimeOf } from "./kayit";

const belge = (...content: JSONContent[]): BelgeDocument => ({ content: { type: "doc", content: [{ type: "section", content }] }, settings: defaultSettings() });
const p = (text: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] });
const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe("kayıt hedefi", () => {
  it("yazılabilen biçim aynı ad ve biçimle kaydedilir", () => {
    expect(kayitHedefi("rapor.docx", "docx")).toEqual({ name: "rapor.docx", format: "docx", donustu: false });
    expect(kayitHedefi("notlar.odt", "odt")).toEqual({ name: "notlar.odt", format: "odt", donustu: false });
    expect(kayitHedefi("mektup.rtf", "rtf")).toEqual({ name: "mektup.rtf", format: "rtf", donustu: false });
    expect(kayitHedefi("BENİOKU.md", "md")).toEqual({ name: "BENİOKU.md", format: "md", donustu: false });
    expect(kayitHedefi("not.markdown", "md")).toEqual({ name: "not.markdown", format: "md", donustu: false });
    expect(kayitHedefi("sayfa.htm", "html")).toEqual({ name: "sayfa.htm", format: "html", donustu: false });
    expect(kayitHedefi("liste.txt", "txt")).toEqual({ name: "liste.txt", format: "txt", donustu: false });
  });

  it(".doc yazılamaz: .docx olur (özgün dosya değişmez)", () => {
    expect(kayitHedefi("eski.doc", "doc")).toEqual({ name: "eski.docx", format: "docx", donustu: true });
    // .doc uzantılı HTML/RTF de .docx'e döner.
    expect(kayitHedefi("eski.doc", "html")).toEqual({ name: "eski.docx", format: "docx", donustu: true });
  });

  it("şablon ve makrolu uzantılar düz belge uzantısını alır", () => {
    expect(kayitHedefi("sablon.dotx", "docx")).toEqual({ name: "sablon.docx", format: "docx", donustu: true });
    expect(kayitHedefi("makro.docm", "docx")).toEqual({ name: "makro.docx", format: "docx", donustu: true });
    expect(kayitHedefi("sablon.ott", "odt")).toEqual({ name: "sablon.odt", format: "odt", donustu: true });
  });

  it("uzantı ile içerik biçimi farklıysa içeriğin uzantısı kullanılır", () => {
    expect(kayitHedefi("aslinda-rtf.txt", "rtf")).toEqual({ name: "aslinda-rtf.rtf", format: "rtf", donustu: true });
  });

  it("uzantısız ad .docx olur", () => {
    expect(kayitHedefi("Belge1", "docx")).toEqual({ name: "Belge1.docx", format: "docx", donustu: true });
  });

  it("farklı kaydet: ad aynı, uzantı seçilen biçimin", () => {
    expect(farkliHedef("rapor.docx", "odt")).toEqual({ name: "rapor.odt", format: "odt", donustu: true });
    expect(farkliHedef("rapor.docx", "docx")).toEqual({ name: "rapor.docx", format: "docx", donustu: false });
    expect(farkliHedef("eski.doc", "md").name).toBe("eski.md");
    expect(farkliHedef("a.b.rtf", "txt").name).toBe("a.b.txt");
    expect(KAYIT_BICIMLERI).toEqual(["docx", "odt", "rtf", "md", "txt", "html"]);
  });

  it("MIME türleri", () => {
    expect(mimeOf("docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(mimeOf("odt")).toBe("application/vnd.oasis.opendocument.text");
    expect(mimeOf("md")).toBe("text/markdown");
    expect(mimeOf("doc")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });
});

describe("kodlama (masaüstü yazıcıları)", () => {
  it("yazar boşsa kullanıcı adı, değiştirme tarihi yazılır; dolu yazar korunur", () => {
    const b = belge(p("x"));
    const now = new Date("2026-01-02T03:04:05Z");
    const k = kayitBelgesi(b, now);
    expect(k.settings.properties.author).toBeTruthy();
    expect(k.settings.properties.modified).toBe(now.toISOString());
    b.settings.properties.author = "Ayşe";
    expect(kayitBelgesi(b).settings.properties.author).toBe("Ayşe");
  });

  it(".docx gidiş-dönüş: metin ve kalın korunur", async () => {
    const b = belge(p("Merhaba "), p("kalın İĞÜŞÖÇ", [{ type: "bold" }]));
    const bytes = await kodla("docx", b, { title: "t" });
    const { doc, format } = await openDocument("t.docx", buf(bytes));
    expect(format).toBe("docx");
    const json = JSON.stringify(doc.content);
    expect(json).toContain("kalın İĞÜŞÖÇ");
    expect(json).toMatch(/"text":"kalın İĞÜŞÖÇ","marks":\[\{"type":"bold"/);
  });

  it("her kayıt biçimi açılabilir dosya üretir", async () => {
    const b = belge(p("Biçim denemesi ığüşöç"));
    for (const f of KAYIT_BICIMLERI) {
      const bytes = await kodla(f, b, { title: "deneme", html: () => "<p>Biçim denemesi ığüşöç</p>" });
      expect(bytes.byteLength).toBeGreaterThan(0);
      const { doc } = await openDocument(`deneme.${f}`, buf(bytes));
      expect(JSON.stringify(doc.content)).toContain("Biçim denemesi ığüşöç");
    }
  });

  it(".txt UTF-8 BOM ile başlar", async () => {
    const bytes = await kodla("txt", belge(p("a")), { title: "t" });
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
