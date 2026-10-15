import { beforeEach, describe, expect, it } from "vitest";
import { EN_COK, konumAnahtari, konumOku, konumYaz } from "./konum";
import { etkinBaslik } from "./gezinme";

/** Düğüm ortamında localStorage yok: bellekte basit karşılığı. */
class Depo {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  clear() {
    this.m.clear();
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: new Depo(), configurable: true });
});

describe("kaldığın yerden devam: saklama", () => {
  it("belge cihazdaki konumuyla, yoksa ad ve boyutla tanınır; yeni belgede kimlik yok", () => {
    const data = new ArrayBuffer(1234);
    expect(konumAnahtari({ name: "rapor.docx", uri: "content://belgeler/42", data })).toBe("content://belgeler/42");
    expect(konumAnahtari({ name: "rapor.docx", data })).toBe("rapor.docx|1234");
    expect(konumAnahtari({ name: "Belge1.docx", data: null })).toBeNull();
  });

  it("yazılan konum okunur; bozuk kayıt yok sayılır", () => {
    konumYaz("a", { ust: 500, dy: -20, oran: 0.4, anchor: 510, head: 520 });
    expect(konumOku("a")).toMatchObject({ ust: 500, dy: -20, oran: 0.4, anchor: 510, head: 520 });
    expect(konumOku("yok")).toBeNull();
    localStorage.setItem("officehere.mobile.belge.konum", "{bozuk");
    expect(konumOku("a")).toBeNull();
    // Bozuk kayıt üzerine yazılabilir
    konumYaz("b", { ust: 1, oran: 0, anchor: 1, head: 1 });
    expect(konumOku("b")).not.toBeNull();
  });

  it(`en çok ${EN_COK} belge saklanır, en eskisi silinir`, () => {
    for (let i = 0; i < EN_COK + 5; i++) konumYaz(`belge${i}`, { ust: i, oran: 0, anchor: i, head: i }, 1000 + i);
    expect(konumOku("belge0")).toBeNull();
    expect(konumOku("belge4")).toBeNull();
    expect(konumOku("belge5")).not.toBeNull();
    expect(konumOku(`belge${EN_COK + 4}`)?.ust).toBe(EN_COK + 4);
  });
});

describe("gezinti: bulunulan başlık", () => {
  const liste = [10, 200, 450, 900].map((pos, i) => ({ level: 1, text: `B${i}`, pos }));
  it("konumdan önceki son başlık", () => {
    expect(etkinBaslik(liste, 0)).toBe(-1);
    expect(etkinBaslik(liste, 10)).toBe(0);
    expect(etkinBaslik(liste, 449)).toBe(1);
    expect(etkinBaslik(liste, 450)).toBe(2);
    expect(etkinBaslik(liste, 5000)).toBe(3);
    expect(etkinBaslik([], 5)).toBe(-1);
  });
});
