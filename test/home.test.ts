import { greeting, recentWhen } from "../src/home/util";

describe("başlangıç yardımcıları", () => {
  it("saate göre selamlar", () => {
    expect(greeting(new Date(2026, 0, 1, 8))).toBe("Günaydın");
    expect(greeting(new Date(2026, 0, 1, 13))).toBe("İyi günler");
    expect(greeting(new Date(2026, 0, 1, 19))).toBe("İyi akşamlar");
    expect(greeting(new Date(2026, 0, 1, 2))).toBe("İyi geceler");
  });

  it("son açılma zamanını gün farkına göre yazar", () => {
    const now = new Date(2026, 9, 13, 15, 0);
    expect(recentWhen(new Date(2026, 9, 13, 9, 5).getTime(), now)).toBe("Bugün 09:05");
    expect(recentWhen(new Date(2026, 9, 12, 23, 59).getTime(), now)).toBe("Dün 23:59");
    expect(recentWhen(new Date(2026, 9, 3).getTime(), now)).toMatch(/^3 Eki/);
    expect(recentWhen(new Date(2025, 9, 3).getTime(), now)).toMatch(/2025/);
  });
});
