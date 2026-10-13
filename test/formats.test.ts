import { acceptFor, appFor, baseOf, extOf, mimeFor } from "../src/platform/formats";
import { sortRecent } from "../src/platform/web";

describe("biçim eşlemesi", () => {
  it("uzantıdan uygulama bulur", () => {
    expect(appFor("Rapor.DOCX")).toBe("belge");
    expect(appFor("eski.doc")).toBe("belge");
    expect(appFor("not.md")).toBe("belge");
    expect(appFor("veri.tsv")).toBe("tablo");
    expect(appFor("hesap.xls")).toBe("tablo");
    expect(appFor("sunu.ppsx")).toBe("sunum");
    expect(appFor("sunu.odp")).toBe("sunum");
    expect(appFor("resim.png")).toBeNull();
    expect(appFor("uzantisiz")).toBeNull();
  });

  it("ad ve uzantıyı ayırır", () => {
    expect(extOf("a.b.Docx")).toBe("docx");
    expect(baseOf("a.b.docx")).toBe("a.b");
    expect(baseOf(".gizli")).toBe(".gizli");
  });

  it("seçici kabul listesi uygulamaya göre süzülür", () => {
    expect(acceptFor("tablo").split(",")).toContain(".ods");
    expect(acceptFor("tablo")).not.toContain(".docx");
    expect(acceptFor()).toContain(".pptx");
  });

  it("MIME türü", () => {
    expect(mimeFor("x.docx")).toContain("wordprocessingml");
    expect(mimeFor("x.bilinmez")).toBe("application/octet-stream");
  });

  it("son kullanılanlarda sabitlenenler başta, sonra en yeni", () => {
    const list = sortRecent([
      { name: "a", app: "belge", openedAt: 3 },
      { name: "b", app: "tablo", openedAt: 1, pinned: true },
      { name: "c", app: "sunum", openedAt: 5 },
    ]);
    expect(list.map((f) => f.name)).toEqual(["b", "c", "a"]);
  });
});
