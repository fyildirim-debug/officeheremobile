// Otomatik kurtarma: taslak deposu ve ekranın taslak yazıcısı (zamanlama, silme, sıralı yazma).
import {
  AGIR_KODLAMA_MS,
  bekleyenGorunum,
  bellekDeposu,
  bellekOturumDeposu,
  EN_COK_TASLAK,
  gorunumBekle,
  gorunumUygulandi,
  ILK_TASLAK_MS,
  OTURUM_OMRU,
  oturumuGeriGetir,
  taslakAl,
  taslaklar,
  taslakYaz,
  TaslakYazici,
  type Oturum,
  type Taslak,
  type TaslakKaynagi,
} from "./taslak";
import type { OpenedDoc, RecentFile } from "./types";

const veri = (s: string) => new TextEncoder().encode(s);
const metin = (b: ArrayBuffer) => new TextDecoder().decode(b);

function kaynak(app: TaslakKaynagi["app"] = "belge") {
  let icerik = "ilk";
  const k = {
    app,
    ad: "rapor.odt",
    kodla: vi.fn(async () => ({ data: veri(icerik), dataName: "taslak.docx" })),
    bilgi: () => ({ name: k.ad, uri: "content://x/1", ek: { bicim: "odt" } }),
    set: (s: string) => (icerik = s),
  };
  return k;
}

describe("taslak deposu", () => {
  it("en yeni önce listelenir; en çok EN_COK_TASLAK kayıt tutulur", async () => {
    const depo = bellekDeposu();
    for (let i = 0; i < EN_COK_TASLAK + 2; i++) {
      await taslakYaz({ id: `t${i}`, app: "tablo", name: `K${i}.xlsx`, dataName: "taslak.xlsx", data: veri(`${i}`).buffer as ArrayBuffer, savedAt: 1000 + i }, depo);
    }
    const l = await taslaklar(depo);
    expect(l).toHaveLength(EN_COK_TASLAK);
    expect(l[0]).toMatchObject({ id: `t${EN_COK_TASLAK + 1}`, name: `K${EN_COK_TASLAK + 1}.xlsx`, size: 1 });
    expect(l.map((t) => t.id)).not.toContain("t0");
    expect("data" in l[0]).toBe(false);
    expect(metin((await taslakAl("t3", depo))!.data)).toBe("3");
  });

  it("bozuk ya da tanınmayan kayıt yok sayılır", async () => {
    const depo = bellekDeposu();
    await depo.put({ id: "x", app: "baska", name: "a", dataName: "a", data: new ArrayBuffer(1), savedAt: 1 } as unknown as Taslak);
    expect(await taslaklar(depo)).toEqual([]);
    expect(await taslakAl("x", depo)).toBeNull();
  });
});

describe("TaslakYazici", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("değişiklikten aralık sonra yazar; ad, konum ve ek bilgiyle", async () => {
    const depo = bellekDeposu();
    const k = kaynak();
    const y = new TaslakYazici("o1", k, depo, 1000);
    y.degisti(true);
    y.degisti(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(k.kodla).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await y.bitti();
    expect(k.kodla).toHaveBeenCalledTimes(1);
    const t = (await taslakAl("o1", depo))!;
    expect(t).toMatchObject({ app: "belge", name: "rapor.odt", uri: "content://x/1", dataName: "taslak.docx", ek: { bicim: "odt" } });
    expect(metin(t.data)).toBe("ilk");
    expect(y.taslakVar).toBe(true);
  });

  it("arka plana geçince hemen yazar; değişiklik yoksa yeniden kodlamaz", async () => {
    const depo = bellekDeposu();
    const k = kaynak("sunum");
    const y = new TaslakYazici("o2", k, depo, 60_000);
    y.degisti(true);
    await y.simdiYaz();
    await y.simdiYaz();
    expect(k.kodla).toHaveBeenCalledTimes(1);
    k.set("ikinci");
    y.degisti(true);
    await y.simdiYaz();
    expect(metin((await taslakAl("o2", depo))!.data)).toBe("ikinci");
    // Zamanlayıcı da iptal edildi: sonradan ek yazma yok.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(k.kodla).toHaveBeenCalledTimes(2);
  });

  it("kaydedilince (kirli değil) ve ekran kapanınca taslak silinir", async () => {
    const depo = bellekDeposu();
    const k = kaynak("tablo");
    const y = new TaslakYazici("o3", k, depo);
    y.degisti(true);
    await y.simdiYaz();
    expect(await taslakAl("o3", depo)).not.toBeNull();
    y.degisti(false);
    await y.bitti();
    expect(await taslakAl("o3", depo)).toBeNull();
    // Kirli değilken arka plana geçiş yazmaz.
    await y.simdiYaz();
    expect(await taslakAl("o3", depo)).toBeNull();
    y.degisti(true);
    await y.simdiYaz();
    y.kapat();
    await y.bitti();
    expect(await taslakAl("o3", depo)).toBeNull();
    // Kapandıktan sonra değişiklik yok sayılır; yeniden başlatılınca sürer (StrictMode).
    y.degisti(true);
    await y.simdiYaz();
    expect(await taslakAl("o3", depo)).toBeNull();
    y.baslat();
    y.degisti(true);
    await y.simdiYaz();
    expect(await taslakAl("o3", depo)).not.toBeNull();
  });

  it("yazma sürerken kapatılırsa yazılan taslak kalmaz", async () => {
    const depo = bellekDeposu();
    let bitir: () => void = () => {};
    const k = kaynak();
    k.kodla.mockImplementationOnce(() => new Promise((r) => (bitir = () => r({ data: veri("yarım"), dataName: "taslak.docx" }))));
    const y = new TaslakYazici("o4", k, depo);
    y.degisti(true);
    const p = y.simdiYaz();
    y.kapat();
    bitir();
    await p;
    await y.bitti();
    expect(await taslakAl("o4", depo)).toBeNull();
  });

  it("büyük belgede düzenlerken aralıklı yazmaz; arka plana geçişte yazar", async () => {
    const depo = bellekDeposu();
    const k = { ...kaynak(), agir: () => true };
    const y = new TaslakYazici("o6", k, depo, 1000);
    y.degisti(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(k.kodla).not.toHaveBeenCalled();
    await y.simdiYaz();
    expect(await taslakAl("o6", depo)).not.toBeNull();
  });

  it("kodlaması uzun süren belgede sonraki aralıklı yazmalar bırakılır", async () => {
    const depo = bellekDeposu();
    const k = kaynak();
    let saat = 0;
    k.kodla.mockImplementation(async () => {
      saat += AGIR_KODLAMA_MS + 50;
      return { data: veri("x"), dataName: "taslak.docx" };
    });
    const y = new TaslakYazici("o7", k, depo, 1000, () => saat);
    y.degisti(true);
    await vi.advanceTimersByTimeAsync(1000);
    await y.bitti();
    expect(k.kodla).toHaveBeenCalledTimes(1);
    y.degisti(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(k.kodla).toHaveBeenCalledTimes(1);
  });

  it("ilk taslak ilk değişiklikten kısa süre sonra, sonrakiler aralıkla yazılır", async () => {
    const depo = bellekDeposu();
    const k = kaynak();
    const y = new TaslakYazici("o8", k, depo, 30_000);
    y.degisti(true);
    await vi.advanceTimersByTimeAsync(ILK_TASLAK_MS);
    await y.bitti();
    expect(k.kodla).toHaveBeenCalledTimes(1);
    k.set("ikinci");
    y.degisti(true);
    await vi.advanceTimersByTimeAsync(ILK_TASLAK_MS * 2);
    expect(k.kodla).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    await y.bitti();
    expect(k.kodla).toHaveBeenCalledTimes(2);
    expect(metin((await taslakAl("o8", depo))!.data)).toBe("ikinci");
  });

  it("kodlama hatasında sonraki fırsatta yeniden dener", async () => {
    const depo = bellekDeposu();
    const k = kaynak();
    k.kodla.mockRejectedValueOnce(new Error("bozuk"));
    const y = new TaslakYazici("o5", k, depo);
    y.degisti(true);
    await y.simdiYaz();
    expect(await taslakAl("o5", depo)).toBeNull();
    await y.simdiYaz();
    expect(await taslakAl("o5", depo)).not.toBeNull();
  });
});

describe("oturum: arka plana geçiş", () => {
  it("önce oturum kaydı (belge, konum, görünüm), sonra taslak; ekran kapanınca kendi kaydı silinir", async () => {
    const depo = bellekDeposu();
    const od = bellekOturumDeposu();
    const k = kaynak();
    const y = new TaslakYazici("e1", k, depo, 60_000, undefined, od);
    y.degisti(true);
    const sure = await y.arkaPlan({ secim: [3, 7] });
    expect(sure).toBeGreaterThanOrEqual(0);
    expect(await od.al()).toMatchObject({ ekran: "e1", app: "belge", name: "rapor.odt", uri: "content://x/1", taslak: true, gorunum: { secim: [3, 7] } });
    expect(await taslakAl("e1", depo)).not.toBeNull();
    // Başka ekranın kaydı silinmez.
    const baska = new TaslakYazici("e2", kaynak(), bellekDeposu(), 60_000, undefined, od);
    baska.kapat();
    await baska.bitti();
    expect((await od.al())?.ekran).toBe("e1");
    y.kapat();
    await y.bitti();
    expect(await od.al()).toBeNull();
  });

  it("kaydedilmiş belge: taslaksız oturum (konumdan açılır); yeni ve değişmemiş belge: kayıt kalmaz", async () => {
    const od = bellekOturumDeposu();
    const y = new TaslakYazici("e3", kaynak("tablo"), bellekDeposu(), 60_000, undefined, od);
    await y.arkaPlan();
    expect(await od.al()).toMatchObject({ ekran: "e3", taslak: false, uri: "content://x/1" });
    const yeni = { ...kaynak(), bilgi: () => ({ name: "Belge1.docx" }) };
    const z = new TaslakYazici("e4", yeni, bellekDeposu(), 60_000, undefined, od);
    await z.arkaPlan({ secim: [1, 1] });
    expect(await od.al()).toBeNull();
  });

  it("kapandıktan sonra arka plana geçiş bir şey yazmaz", async () => {
    const od = bellekOturumDeposu();
    const y = new TaslakYazici("e5", kaynak(), bellekDeposu(), 60_000, undefined, od);
    y.kapat();
    await y.arkaPlan();
    await y.bitti();
    expect(await od.al()).toBeNull();
  });
});

describe("oturum: süreç sonlanmasından dönüş", () => {
  const SIMDI = 1_800_000_000_000;
  const oturum = (o: Partial<Oturum> = {}): Oturum => ({ ekran: "s1", app: "belge", name: "rapor.docx", uri: "content://x/9", taslak: true, gorunum: { kaydirma: [0, 400] }, zaman: SIMDI - 5000, ...o });
  const acan = (sonuc: OpenedDoc | null | Error) =>
    vi.fn(async (f: RecentFile) => {
      if (sonuc instanceof Error) throw sonuc;
      return sonuc && { ...sonuc, uri: f.uri };
    });
  const dosya: OpenedDoc = { name: "rapor.docx", data: veri("dosya").buffer as ArrayBuffer, app: "belge" };

  it("taslak varsa kaydedilmemiş hâliyle; özgün konum okunabiliyorsa kayıt yeri o", async () => {
    const depo = bellekDeposu();
    const od = bellekOturumDeposu();
    await taslakYaz({ id: "s1", app: "belge", name: "rapor.docx", uri: "content://x/9", dataName: "taslak.docx", data: veri("taslak").buffer as ArrayBuffer, savedAt: SIMDI - 4000 }, depo);
    await od.yaz(oturum());
    const ac = acan(dosya);
    const g = (await oturumuGeriGetir(ac, od, depo, SIMDI))!;
    expect(g.gorunum).toEqual({ kaydirma: [0, 400] });
    expect(g.doc).toMatchObject({ name: "rapor.docx", app: "belge", uri: "content://x/9", recovered: { id: "s1", dataName: "taslak.docx", savedAt: SIMDI - 4000 } });
    expect(metin(g.doc.data!)).toBe("taslak");
    expect(ac).toHaveBeenCalledTimes(1);
    // Özgün dosyaya erişim yoksa taslak yine açılır, kaydederken konum sorulur.
    await od.yaz(oturum());
    const g2 = (await oturumuGeriGetir(acan(null), od, depo, SIMDI))!;
    expect(g2.doc.uri).toBeUndefined();
    expect(metin(g2.doc.data!)).toBe("taslak");
  });

  it("aynı kayıt ikinci kez denenmez (açılışta çöken belge döngüye girmez)", async () => {
    const depo = bellekDeposu();
    const od = bellekOturumDeposu();
    await od.yaz(oturum({ taslak: false }));
    expect(await oturumuGeriGetir(acan(dosya), od, depo, SIMDI)).not.toBeNull();
    expect((await od.al())?.deneme).toBe(1);
    expect(await oturumuGeriGetir(acan(dosya), od, depo, SIMDI)).toBeNull();
    expect(await od.al()).toBeNull();
  });

  it("taslak yoksa kayıtlı konumdan açılır; açılamazsa, eskiyse ya da bozuksa başlangıç ekranı", async () => {
    const depo = bellekDeposu();
    const od = bellekOturumDeposu();
    await od.yaz(oturum());
    const g = (await oturumuGeriGetir(acan(dosya), od, depo, SIMDI))!;
    expect(g.doc.recovered).toBeUndefined();
    expect(metin(g.doc.data!)).toBe("dosya");

    await od.yaz(oturum());
    expect(await oturumuGeriGetir(acan(new Error("izin yok")), od, depo, SIMDI)).toBeNull();
    expect(await od.al()).toBeNull();

    await od.yaz(oturum({ zaman: SIMDI - OTURUM_OMRU - 1 }));
    expect(await oturumuGeriGetir(acan(dosya), od, depo, SIMDI)).toBeNull();
    await od.yaz({ ...oturum(), app: "baska" } as unknown as Oturum);
    expect(await oturumuGeriGetir(acan(dosya), od, depo, SIMDI)).toBeNull();
    expect(await od.al()).toBeNull();
    // Konumsuz yeni belge (taslağı da yok): geri getirilecek bir şey yok.
    await od.yaz(oturum({ uri: undefined }));
    expect(await oturumuGeriGetir(acan(dosya), od, depo, SIMDI)).toBeNull();
  });

  it("bekleyen görünüm yalnız aynı uygulama ve adda, uygulanana ya da ömrü dolana dek", () => {
    gorunumBekle("belge", "a.docx", { secim: [1, 2] }, 1000);
    expect(bekleyenGorunum("tablo", "a.docx", 1000)).toBeUndefined();
    expect(bekleyenGorunum("belge", "b.docx", 1000)).toBeUndefined();
    expect(bekleyenGorunum("belge", "a.docx", 1000)).toEqual({ secim: [1, 2] });
    // StrictMode ikinci bağlaması da görür.
    expect(bekleyenGorunum("belge", "a.docx", 1001)).toEqual({ secim: [1, 2] });
    gorunumUygulandi();
    expect(bekleyenGorunum("belge", "a.docx", 1002)).toBeUndefined();
    gorunumBekle("sunum", "s.pptx", { slayt: 2 }, 1000);
    expect(bekleyenGorunum("sunum", "s.pptx", 1000 + 60_000)).toBeUndefined();
  });
});
