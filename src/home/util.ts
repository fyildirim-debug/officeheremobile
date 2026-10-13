// Başlangıç ekranı yardımcıları.

/** Saate göre selamlama (masaüstü Başlangıç ile aynı). */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Günaydın";
  if (h >= 12 && h < 18) return "İyi günler";
  if (h >= 18 && h < 22) return "İyi akşamlar";
  return "İyi geceler";
}

const saat = (d: Date) => d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

/** Son açılma zamanı: "Bugün 14:32", "Dün 09:10", "3 Eki", "3 Eki 2024". */
export function recentWhen(ms: number, now = new Date()): string {
  const d = new Date(ms);
  const gun = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const fark = Math.round((gun(now) - gun(d)) / 86_400_000);
  if (fark === 0) return `Bugün ${saat(d)}`;
  if (fark === 1) return `Dün ${saat(d)}`;
  const ayni = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("tr-TR", ayni ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}
