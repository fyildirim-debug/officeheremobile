// @vitest-environment jsdom
// Görünüm durumu: Belge seçimi ve kaydırması alınıp yeni düzenleyiciye uygulanır; uygulama döngüsü
// ekran hazır olunca başlar, oturunca ya da kullanıcı dokununca biter.
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { belgeGorunumu, gorunumUygula, HAZIRLIK_MS, OTURMA_MS, type GorunumKaynagi, type VerSonucu } from "./gorunum";

const ICERIK = "<p>Birinci paragraf.</p><p>İkinci paragraf: İğdır, Şişli.</p><p>Üçüncü.</p>";

function kur() {
  const sc = document.createElement("div");
  const el = document.createElement("div");
  sc.appendChild(el);
  document.body.appendChild(sc);
  const ed = new Editor({ element: el, extensions: [StarterKit], content: ICERIK });
  return { ed, sc };
}

describe("belgeGorunumu", () => {
  afterEach(() => (document.body.innerHTML = ""));

  it("seçim ve kaydırma alınır; yeni düzenleyiciye bir kez uygulanır", () => {
    const a = kur();
    a.ed.commands.setTextSelection({ from: 15, to: 22 });
    a.sc.scrollTop = 120;
    const g = belgeGorunumu(() => a)!.al()!;
    expect(g.secim).toEqual([15, 22]);
    expect((g.kaydirma as number[])[1]).toBe(a.sc.scrollTop);

    const b = kur();
    let o: { ed: Editor; sc: HTMLElement } | null = null;
    const k = belgeGorunumu(() => o);
    // Düzenleyici henüz yok: hazır değil.
    expect(k.ver(g)).toBe("bekle");
    o = b;
    expect(k.ver(g)).toBe("uygulandi");
    expect([b.ed.state.selection.anchor, b.ed.state.selection.head]).toEqual([15, 22]);
    // Kullanıcı seçimi değiştirdiyse yineleme seçimi ezmez.
    b.ed.commands.setTextSelection(3);
    expect(k.ver(g)).toBe("hazir");
    expect(b.ed.state.selection.head).toBe(3);
    // Ekran içeriği yeniden kurarsa (ikinci yükleme) seçim yeniden verilir.
    b.ed.commands.setContent(ICERIK);
    b.ed.commands.setTextSelection(1);
    expect(k.ver(g)).toBe("uygulandi");
    expect([b.ed.state.selection.anchor, b.ed.state.selection.head]).toEqual([15, 22]);
    a.ed.destroy();
    b.ed.destroy();
  });

  it("kaydırma kırpıldıysa düzen yerleşince yenilenir; başkası kaydırdıysa dokunulmaz", () => {
    const b = kur();
    // Kaydırma kutusu: tarayıcı gibi scrollTop'u içerik yüksekliğine göre kırpar.
    let yukseklik = 500;
    let top = 0;
    const sc = {
      scrollLeft: 0,
      clientHeight: 100,
      get scrollTop() {
        return top;
      },
      set scrollTop(v: number) {
        top = Math.max(0, Math.min(v, yukseklik - 100));
      },
      getBoundingClientRect: () => ({ top: 0 }),
    } as unknown as HTMLElement;
    const k = belgeGorunumu(() => ({ ed: b.ed, sc }));
    const g = { secim: [3, 3], kaydirma: [0, 900] };
    expect(k.ver(g)).toBe("uygulandi");
    expect(sc.scrollTop).toBe(400);
    // Sayfalar yerleşti: içerik uzadı, kaydırma hedefe tamamlanır.
    yukseklik = 2000;
    expect(k.ver(g)).toBe("hazir");
    expect(sc.scrollTop).toBe(900);
    // Ekranın kendi "kaldığın yer"i (ya da kullanıcı) başka yere kaydırdı: artık dokunulmaz.
    sc.scrollTop = 700;
    k.ver(g);
    expect(sc.scrollTop).toBe(700);
    b.ed.destroy();
  });

  it("belge kısaldıysa seçim sınırlanır; bozuk durum yok sayılır", () => {
    const b = kur();
    const k = belgeGorunumu(() => b);
    expect(k.ver({ secim: [9999, 9999], kaydirma: "x" })).toBe("uygulandi");
    expect(b.ed.state.selection.head).toBeLessThanOrEqual(b.ed.state.doc.content.size);
    expect(belgeGorunumu(() => b).ver({ secim: null })).toBe("uygulandi");
    b.ed.destroy();
  });
});

describe("gorunumUygula", () => {
  let saat = 0;
  let kareler: FrameRequestCallback[] = [];
  beforeEach(() => {
    saat = 0;
    kareler = [];
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => kareler.push(f));
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterEach(() => vi.unstubAllGlobals());
  const ilerle = (ms: number) => {
    saat += ms;
    const k = kareler;
    kareler = [];
    k.forEach((f) => f(saat));
  };

  it("hazır olunca uygular, son uygulamadan sonra oturma süresi boyunca yineler, sonra bırakır", () => {
    let durum: VerSonucu = "bekle";
    const ver = vi.fn(() => durum);
    const bitti = vi.fn();
    gorunumUygula(() => ({ al: () => undefined, ver }) satisfies GorunumKaynagi, { a: 1 }, bitti, () => saat);
    ilerle(100);
    expect(bitti).not.toHaveBeenCalled();
    durum = "uygulandi";
    ilerle(16);
    durum = "hazir";
    const n = ver.mock.calls.length;
    ilerle(OTURMA_MS / 2);
    expect(ver.mock.calls.length).toBe(n + 1);
    // İçerik yeniden kuruldu (ikinci yükleme): pencere yeniden başlar.
    durum = "uygulandi";
    ilerle(OTURMA_MS / 2);
    durum = "hazir";
    ilerle(OTURMA_MS - 1);
    expect(bitti).not.toHaveBeenCalled();
    ilerle(2);
    expect(bitti).toHaveBeenCalledTimes(1);
    expect(kareler).toEqual([]);
  });

  it("kullanıcı dokununca hemen bırakır; ekran hiç hazır olmazsa vazgeçer", () => {
    const bitti = vi.fn();
    gorunumUygula(() => ({ al: () => undefined, ver: () => "hazir" }), {}, bitti, () => saat);
    window.dispatchEvent(new Event("pointerdown"));
    expect(bitti).toHaveBeenCalledTimes(1);
    ilerle(16);

    const vazgec = vi.fn();
    gorunumUygula(() => undefined, {}, vazgec, () => saat);
    ilerle(HAZIRLIK_MS - 1);
    expect(vazgec).not.toHaveBeenCalled();
    ilerle(2);
    expect(vazgec).toHaveBeenCalledTimes(1);
  });

  it("iptal (ekran kapandı) bekleyeni silmez", () => {
    const bitti = vi.fn();
    const iptal = gorunumUygula(() => undefined, {}, bitti, () => saat);
    iptal();
    ilerle(HAZIRLIK_MS + 1);
    expect(bitti).not.toHaveBeenCalled();
  });
});
