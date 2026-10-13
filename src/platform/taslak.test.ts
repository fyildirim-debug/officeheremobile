// Otomatik kurtarma: taslak deposu ve ekranın taslak yazıcısı (zamanlama, silme, sıralı yazma).
import { AGIR_KODLAMA_MS, bellekDeposu, EN_COK_TASLAK, taslakAl, taslaklar, taslakYaz, TaslakYazici, type Taslak, type TaslakKaynagi } from "./taslak";

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
