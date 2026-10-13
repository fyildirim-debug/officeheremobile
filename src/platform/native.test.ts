// @vitest-environment jsdom
// Android platformu: Capacitor eklentisi (OfficeHereFiles) taklit edilerek kaydetme hedefleri,
// "Birlikte aç" biçim eşlemesi, son kullanılanlar ve manifest süzgeçleri denetlenir.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createNativePlatform, type NativeDeps } from "./native";
import { isLightColor, toHex } from "./nativeChrome";
import { EXT_MIMES, mimesForAccept, resolveName, sniffExt, toBase64, type NativeFile } from "./nativeFiles";
import { FORMATS } from "./formats";
import type { OpenedDoc } from "./types";

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const tick = () => new Promise((r) => setTimeout(r, 0));
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function setup() {
  let listener: ((f: NativeFile) => void) | null = null;
  const temps = new Map<string, ArrayBuffer>();
  let seq = 0;
  const files = {
    pickDocument: vi.fn(),
    readDocument: vi.fn(),
    writeDocument: vi.fn(async ({ uri }: { uri: string; path: string }) => ({ uri, name: "?" })),
    createDocument: vi.fn(),
    discard: vi.fn(async () => {}),
    releaseUnused: vi.fn(async () => ({ released: 0 })),
    addListener: vi.fn(async (_e: string, fn: (f: NativeFile) => void) => {
      listener = fn;
      return { remove: async () => {} };
    }),
  };
  const deps = {
    files: files as unknown as NativeDeps["files"],
    readTemp: async (p: string) => temps.get(p)!,
    writeTemp: vi.fn(async (rel: string) => `file:///data/cache/${rel}`),
    removeTemp: vi.fn(async () => {}),
    share: vi.fn(async () => ({})),
    notify: vi.fn(),
    home: () => (document.documentElement.getAttribute("data-app") ?? "baslangic") === "baslangic",
  } satisfies NativeDeps;
  const p = createNativePlatform(deps);
  p.init();
  /** Yerel tarafın okuduğu dosya (geçici kopyası ile). */
  const file = (f: Partial<NativeFile> & { name: string }, body = "veri"): NativeFile => {
    const path = `/data/cache/oh-in/${++seq}.bin`;
    temps.set(path, enc(body));
    return { uri: `content://belgeler/document/${seq}`, writable: true, path, ...f };
  };
  const emit = (f: NativeFile) => listener!(f);
  /** App'in açma davranışı: son kullanılanlara ekler, ekran açılınca data-app değişir. */
  const openInApp = async (d: OpenedDoc) => {
    await p.addRecent({ name: d.name, app: d.app, uri: d.uri });
    document.documentElement.setAttribute("data-app", d.app);
    await tick();
  };
  const goHome = async () => {
    document.documentElement.setAttribute("data-app", "baslangic");
    await tick();
  };
  return { p, files, deps, file, emit, openInApp, goHome };
}

const bytes = new Uint8Array([1, 2, 3]);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.setAttribute("data-app", "baslangic");
});

describe("saveFile: ad → uri eşlemesi", () => {
  it("açılan belge aynı adla aynı konuma yazılır", async () => {
    const t = setup();
    const f = t.file({ name: "rapor.docx" });
    t.files.pickDocument.mockResolvedValue(f);
    const d = (await t.p.pickFile(".docx"))!;
    expect(d).toMatchObject({ name: "rapor.docx", app: "belge", uri: f.uri });
    expect(new TextDecoder().decode(d.data!)).toBe("veri");
    expect(t.files.discard).toHaveBeenCalledWith({ path: f.path });
    await t.openInApp(d);

    const saved = await t.p.saveFile("rapor.docx", bytes, DOCX);
    expect(saved).toEqual({ name: "rapor.docx", uri: f.uri });
    expect(t.files.writeDocument).toHaveBeenCalledWith({ uri: f.uri, path: "file:///data/cache/" + t.deps.writeTemp.mock.calls[0][0] });
    expect(t.files.createDocument).not.toHaveBeenCalled();
    expect(t.deps.removeTemp).toHaveBeenCalledWith(t.deps.writeTemp.mock.calls[0][0]);
  });

  it("farklı uzantıyla kaydetmede (.doc → .docx) yeni belge oluşturulur, sonra o konuma yazılır", async () => {
    const t = setup();
    const f = t.file({ name: "eski.doc" });
    t.files.pickDocument.mockResolvedValue(f);
    const d = (await t.p.pickFile(".doc"))!;
    await t.openInApp(d);
    t.files.createDocument.mockResolvedValue({ uri: "content://belgeler/document/yeni", name: "eski.docx" });

    const saved = await t.p.saveFile("eski.docx", bytes, DOCX);
    expect(saved).toEqual({ name: "eski.docx", uri: "content://belgeler/document/yeni" });
    // Konum seçici açılan belgenin klasöründe başlar.
    expect(t.files.createDocument).toHaveBeenCalledWith(expect.objectContaining({ name: "eski.docx", mime: DOCX, initialUri: f.uri }));
    expect(t.files.writeDocument).not.toHaveBeenCalled();

    await t.p.addRecent({ name: saved.name, app: "belge", uri: saved.uri });
    await t.p.saveFile("eski.docx", bytes, DOCX);
    expect(t.files.writeDocument).toHaveBeenCalledWith(expect.objectContaining({ uri: "content://belgeler/document/yeni" }));
    expect(t.files.createDocument).toHaveBeenCalledTimes(1);
  });

  it("seçicide ad değişirse ekranın verdiği ad da yeni konuma bağlanır", async () => {
    const t = setup();
    t.files.createDocument.mockResolvedValue({ uri: "content://x/1", name: "Rapor (1).docx" });
    document.documentElement.setAttribute("data-app", "belge");
    expect(await t.p.saveFile("Belge1.docx", bytes, DOCX)).toEqual({ name: "Rapor (1).docx", uri: "content://x/1" });
    await t.p.saveFile("Belge1.docx", bytes, DOCX);
    await t.p.saveFile("Rapor (1).docx", bytes, DOCX);
    expect(t.files.createDocument).toHaveBeenCalledTimes(1);
    expect(t.files.writeDocument).toHaveBeenCalledTimes(2);
  });

  it("yazma izni yoksa ya da izin yitirildiyse konum sorulur", async () => {
    const t = setup();
    const ro = t.file({ name: "salt.docx", writable: false });
    t.files.pickDocument.mockResolvedValueOnce(ro);
    await t.openInApp((await t.p.pickFile(".docx"))!);
    t.files.createDocument.mockResolvedValue({ uri: "content://x/2", name: "salt.docx" });
    await t.p.saveFile("salt.docx", bytes, DOCX);
    expect(t.files.writeDocument).not.toHaveBeenCalled();
    expect(t.files.createDocument).toHaveBeenCalledWith(expect.objectContaining({ initialUri: ro.uri }));

    await t.goHome();
    const gone = t.file({ name: "silinen.docx" });
    t.files.pickDocument.mockResolvedValueOnce(gone);
    await t.openInApp((await t.p.pickFile(".docx"))!);
    t.files.writeDocument.mockRejectedValueOnce(Object.assign(new Error("Dosya bulunamadı."), { code: "NOT_FOUND" }));
    t.files.createDocument.mockResolvedValue({ uri: "content://x/3", name: "silinen.docx" });
    expect(await t.p.saveFile("silinen.docx", bytes, DOCX)).toEqual({ name: "silinen.docx", uri: "content://x/3" });
  });

  it("G/Ç hatası kullanıcıya iletilir, vazgeçme AbortError olur", async () => {
    const t = setup();
    const f = t.file({ name: "a.docx" });
    t.files.pickDocument.mockResolvedValue(f);
    await t.openInApp((await t.p.pickFile(".docx"))!);
    t.files.writeDocument.mockRejectedValueOnce(Object.assign(new Error("Disk dolu"), { code: "IO" }));
    await expect(t.p.saveFile("a.docx", bytes, DOCX)).rejects.toThrow("Disk dolu");
    expect(t.files.createDocument).not.toHaveBeenCalled();

    t.files.createDocument.mockResolvedValue({ cancelled: true });
    await expect(t.p.saveFile("b.docx", bytes, DOCX)).rejects.toMatchObject({ name: "AbortError" });
    expect(t.deps.removeTemp).toHaveBeenCalledTimes(2);
  });

  it("başlangıca dönülünce yeni belge eski dosyanın üzerine yazmaz", async () => {
    const t = setup();
    const f = t.file({ name: "rapor.docx" });
    t.files.pickDocument.mockResolvedValue(f);
    await t.openInApp((await t.p.pickFile(".docx"))!);
    await t.goHome();
    document.documentElement.setAttribute("data-app", "belge");
    t.files.createDocument.mockResolvedValue({ uri: "content://x/yeni", name: "rapor.docx" });
    await t.p.saveFile("rapor.docx", bytes, DOCX);
    expect(t.files.writeDocument).not.toHaveBeenCalled();
    expect(t.files.createDocument).toHaveBeenCalledTimes(1);
  });

  it("açılması onaylanmayan dış belge açık belgenin hedefini değiştirmez", async () => {
    const t = setup();
    const f = t.file({ name: "rapor.docx" });
    t.files.pickDocument.mockResolvedValue(f);
    await t.openInApp((await t.p.pickFile(".docx"))!);
    const got: OpenedDoc[] = [];
    t.p.onExternalOpen((d) => got.push(d));
    t.emit(t.file({ name: "rapor.docx", uri: "content://whatsapp/9" }));
    await vi.waitFor(() => expect(got).toHaveLength(1));
    // Kullanıcı "Vazgeç" dedi: App addRecent çağırmaz.
    await t.p.saveFile("rapor.docx", bytes, DOCX);
    expect(t.files.writeDocument).toHaveBeenCalledWith(expect.objectContaining({ uri: f.uri }));
  });

  it("dışa aktarılan dosya (PDF) her seferinde konum sorar", async () => {
    const t = setup();
    document.documentElement.setAttribute("data-app", "belge");
    t.files.createDocument.mockResolvedValue({ uri: "content://x/pdf", name: "rapor.pdf" });
    await t.p.saveFile("rapor.pdf", bytes, "application/pdf");
    await t.p.addRecent({ name: "rapor.pdf", app: "belge", uri: "content://x/pdf" });
    await t.p.saveFile("rapor.pdf", bytes, "application/pdf");
    expect(t.files.createDocument).toHaveBeenCalledTimes(2);
    expect(t.files.writeDocument).not.toHaveBeenCalled();
  });
});

describe("onExternalOpen", () => {
  it("dinleyici bağlanmadan gelen dosya (soğuk açılış) sonra verilir", async () => {
    const t = setup();
    const f = t.file({ name: "tablo.CSV", mime: "text/csv" }, "a;b\n1;2");
    t.emit(f);
    await tick();
    const cb = vi.fn();
    t.p.onExternalOpen(cb);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ name: "tablo.CSV", app: "tablo", uri: f.uri }));
    expect(new TextDecoder().decode(cb.mock.calls[0][0].data)).toBe("a;b\n1;2");
  });

  it("uzantısız ad MIME türünden, o da yoksa içerikten tamamlanır", async () => {
    const t = setup();
    const got: OpenedDoc[] = [];
    t.p.onExternalOpen((d) => got.push(d));
    t.emit(t.file({ name: "DOC-20260101-WA0001", mime: DOCX }));
    t.emit(t.file({ name: "sunum", mime: "application/vnd.ms-powerpoint" }));
    t.emit(t.file({ name: "ek", mime: "application/octet-stream" }, "PK\x03\x04....xl/workbook.xml...."));
    await vi.waitFor(() => expect(got).toHaveLength(3));
    expect(got.map((d) => [d.name, d.app])).toEqual([
      ["DOC-20260101-WA0001.docx", "belge"],
      ["sunum.ppt", "sunum"],
      ["ek.xlsx", "tablo"],
    ]);
  });

  it("desteklenmeyen biçim ve okunamayan dosya anlaşılır hata verir", async () => {
    const t = setup();
    const cb = vi.fn();
    t.p.onExternalOpen(cb);
    t.emit(t.file({ name: "foto.png", mime: "image/png" }));
    t.emit({ uri: "file:///sdcard/a.docx", name: "a.docx", error: "NO_ACCESS", message: "Dosyaya erişim izni yok." });
    await vi.waitFor(() => expect(t.deps.notify).toHaveBeenCalledTimes(2));
    expect(cb).not.toHaveBeenCalled();
    expect(t.deps.notify.mock.calls[0][0]).toContain("desteklenen bir biçimde değil");
    expect(t.deps.notify.mock.calls[1][0]).toContain("erişim izni yok");
  });

  it("\"Gönder\" ile gelen düz metin yeni metin belgesi olur", async () => {
    const t = setup();
    const cb = vi.fn();
    t.p.onExternalOpen(cb);
    t.emit({ name: "Toplantı notu.txt", mime: "text/plain", text: "Gündem: bütçe" });
    await vi.waitFor(() => expect(cb).toHaveBeenCalled());
    const d: OpenedDoc = cb.mock.calls[0][0];
    expect(d).toMatchObject({ name: "Toplantı notu.txt", app: "belge", uri: undefined });
    expect(new TextDecoder().decode(d.data!)).toBe("Gündem: bütçe");
  });

  it("dinleyici kaldırılınca çağrılmaz", async () => {
    const t = setup();
    const cb = vi.fn();
    const off = t.p.onExternalOpen(cb);
    off();
    t.emit(t.file({ name: "x.docx" }));
    await tick();
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("son kullanılanlar", () => {
  it("sabitlenenler başta, aynı adres tek kayıt, kaldırınca izin bırakılır", async () => {
    const t = setup();
    await t.p.addRecent({ name: "a.docx", app: "belge", uri: "content://a" });
    await t.p.addRecent({ name: "b.xlsx", app: "tablo", uri: "content://b" });
    await t.p.pinRecent("a.docx", "content://a", true);
    expect((await t.p.recent()).map((f) => f.name)).toEqual(["a.docx", "b.xlsx"]);
    // Dosya başka yerde yeniden adlandırıldı: aynı adres tek kayıt, sabitleme korunur.
    await t.p.addRecent({ name: "a2.docx", app: "belge", uri: "content://a" });
    expect((await t.p.recent()).map((f) => [f.name, !!f.pinned])).toEqual([
      ["a2.docx", true],
      ["b.xlsx", false],
    ]);
    await t.p.removeRecent("b.xlsx", "content://b");
    expect((await t.p.recent()).map((f) => f.name)).toEqual(["a2.docx"]);
    expect(t.files.releaseUnused).toHaveBeenLastCalledWith({ keep: ["content://a"] });
  });

  it("openRecent: izin yitirildiyse ya da dosya silindiyse null", async () => {
    const t = setup();
    t.files.readDocument.mockResolvedValueOnce(t.file({ name: "a.docx", uri: "content://a" }));
    expect(await t.p.openRecent({ name: "a.docx", app: "belge", uri: "content://a", openedAt: 1 })).toMatchObject({ name: "a.docx", app: "belge", uri: "content://a" });
    t.files.readDocument.mockRejectedValueOnce(Object.assign(new Error("izin"), { code: "NO_ACCESS" }));
    expect(await t.p.openRecent({ name: "a.docx", app: "belge", uri: "content://a", openedAt: 1 })).toBeNull();
    t.files.readDocument.mockRejectedValueOnce(Object.assign(new Error("yok"), { code: "NOT_FOUND" }));
    expect(await t.p.openRecent({ name: "a.docx", app: "belge", uri: "content://a", openedAt: 1 })).toBeNull();
    expect(await t.p.openRecent({ name: "a.docx", app: "belge", openedAt: 1 })).toBeNull();
  });

  it("son kullanılandan açılan belge aynı konuma kaydedilir", async () => {
    const t = setup();
    const f = t.file({ name: "a.docx", uri: "content://a" });
    t.files.readDocument.mockResolvedValueOnce(f);
    await t.openInApp((await t.p.openRecent({ name: "a.docx", app: "belge", uri: "content://a", openedAt: 1 }))!);
    await t.p.saveFile("a.docx", bytes, DOCX);
    expect(t.files.writeDocument).toHaveBeenCalledWith(expect.objectContaining({ uri: "content://a" }));
  });
});

describe("pickFile ve paylaşma", () => {
  it("vazgeçmede null, bilinmeyen biçimde anlaşılır hata", async () => {
    const t = setup();
    t.files.pickDocument.mockResolvedValueOnce({ cancelled: true });
    expect(await t.p.pickFile(".docx")).toBeNull();
    t.files.pickDocument.mockResolvedValueOnce(t.file({ name: "arsiv.zip", mime: "application/zip" }, "rastgele"));
    await expect(t.p.pickFile(".docx")).rejects.toThrow('"arsiv.zip" desteklenen bir biçimde değil.');
  });

  it("paylaşma önbellekteki kopyayı gönderir; vazgeçme hata değildir", async () => {
    const t = setup();
    await t.p.shareFile("Bütçe/2026.xlsx", bytes, "x");
    const rel = t.deps.writeTemp.mock.calls[0][0];
    expect(rel).toMatch(/^oh-share\/[^/]+\/Bütçe 2026\.xlsx$/);
    expect(t.deps.share).toHaveBeenCalledWith({ files: [`file:///data/cache/${rel}`], title: "Bütçe/2026.xlsx", dialogTitle: "Paylaş" });
    t.deps.share.mockRejectedValueOnce(new Error("Share canceled"));
    await expect(t.p.shareFile("a.docx", bytes, "x")).resolves.toBeUndefined();
  });
});

describe("yardımcılar", () => {
  it("accept → MIME listesi", () => {
    expect(mimesForAccept(".docx,.CSV")).toEqual([DOCX, "text/csv", "text/comma-separated-values", "application/csv", "application/octet-stream"]);
    expect(mimesForAccept("")).toEqual(["*/*"]);
  });

  it("ad tamamlama ve içerik tanıma", () => {
    expect(resolveName("rapor.docx", "application/octet-stream", null)).toBe("rapor.docx");
    expect(resolveName("rapor.", "application/vnd.MS-Excel", null)).toBe("rapor.xls");
    const u16 = (s: string) => s.split("").join("\0");
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new TextEncoder().encode("...." + u16("WordDocument"))]);
    expect(sniffExt(ole.buffer)).toBe("doc");
    expect(sniffExt(enc("{\\rtf1\\ansi merhaba}"))).toBe("rtf");
    expect(sniffExt(enc("PK\x03\x04mimetypeapplication/vnd.oasis.opendocument.presentation"))).toBe("odp");
    expect(sniffExt(enc("düz metin"))).toBeNull();
  });

  it("base64", () => {
    const b = new Uint8Array(70_000).map((_, i) => i % 256);
    expect(Uint8Array.from(atob(toBase64(b)), (c) => c.charCodeAt(0))).toEqual(b);
  });

  it("durum çubuğu renkleri", () => {
    expect(toHex("#3D3D8F")).toBe("#3d3d8f");
    expect(toHex("#fff")).toBe("#ffffff");
    expect(toHex("rgb(43, 43, 43)")).toBe("#2b2b2b");
    expect(toHex("color-mix(in srgb, red, blue)")).toBeNull();
    expect(isLightColor("#3d3d8f")).toBe(false);
    expect(isLightColor("#2b2b2b")).toBe(false);
    expect(isLightColor("#ffffff")).toBe(true);
    expect(isLightColor("#f3f3f3")).toBe(true);
  });
});

describe("AndroidManifest", () => {
  const xml = readFileSync(resolve("android/app/src/main/AndroidManifest.xml"), "utf8");
  const filters = xml.match(/<intent-filter[\s\S]*?<\/intent-filter>/g) ?? [];
  const mimesOf = (f: string) => [...f.matchAll(/android:mimeType="([^"]+)"/g)].map((m) => m[1]);
  const all = [...new Set(Object.values(EXT_MIMES).flat())];

  it("EXT_MIMES masaüstü biçim listesinin tamamını kapsar", () => {
    expect(Object.keys(EXT_MIMES).sort()).toEqual(Object.values(FORMATS).flat().sort());
  });

  it("VIEW ve SEND süzgeçleri tüm MIME türlerini ve uzantıları içerir", () => {
    const view = filters.find((f) => f.includes("action.VIEW") && f.includes('android:scheme="content"') && !f.includes('mimeType="*/*"') && mimesOf(f).length)!;
    const send = filters.find((f) => f.includes("action.SEND"))!;
    expect(view).toContain('android:scheme="file"');
    expect(mimesOf(view).sort()).toEqual([...all].sort());
    expect(mimesOf(send).sort()).toEqual([...all].sort());
    const byExt = filters.filter((f) => f.includes('android:host="*"'));
    expect(byExt).toHaveLength(2);
    for (const f of byExt) {
      for (const ext of Object.keys(EXT_MIMES)) {
        expect(f).toContain(`android:pathSuffix=".${ext}"`);
        expect(f).toContain(`android:pathPattern=".*\\\\.${ext}"`);
      }
    }
  });

  it("izin istenmez; etkinlik dışa açık, klavyede yeniden boyutlanır", () => {
    expect(xml).not.toMatch(/uses-permission/);
    expect(xml).toMatch(/android:exported="true"/);
    expect(xml).toMatch(/android:windowSoftInputMode="adjustResize"/);
  });
});
