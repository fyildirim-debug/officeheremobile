// Uçtan uca testlerde ortak yardımcılar.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Download, type Page } from "@playwright/test";

const KOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Masaüstü deposundaki örnek dosyanın yolu (ör. fixture("belge", "ornek.docx")). */
export function fixture(app: "belge" | "tablo" | "sunum", name: string): string {
  return path.join(KOK, "vendor/officehere/apps", app, "src/io/__fixtures__", name);
}

/** Başlangıç ekranını açar; önceki testten kalan son kullanılanlar ve tema temizlenir. */
export async function start(page: Page) {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("button", { name: "Aç", exact: true })).toBeVisible();
}

/** "Aç" ile dosya seçer. */
export async function openFile(page: Page, file: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Aç", exact: true }).click();
  await (await chooser).setFiles(file);
}

/** Yeni boş belge/tablo/sunu oluşturur. */
export async function newDoc(page: Page, app: "belge" | "tablo" | "sunum") {
  const label = { belge: "Yeni belge", tablo: "Yeni tablo", sunum: "Yeni sunu" }[app];
  await page.getByRole("button", { name: label, exact: true }).click();
}

/** Tıklamayla başlayan indirmeyi bekler (tarayıcıda kaydetme indirme olarak iner). */
export async function download(page: Page, click: () => Promise<void>): Promise<Download> {
  const d = page.waitForEvent("download");
  await click();
  return d;
}

/**
 * İndirilen dosyayı yeniden açmak için ASCII yollu geçici dosyaya yazar
 * (dosya seçici Türkçe karakterli yollarda dosyayı yüklemiyor).
 */
export async function saveTemp(d: Download): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-e2e-"));
  const file = path.join(dir, d.suggestedFilename().normalize("NFD").replace(/[^\x20-\x7e]/g, "") || "dosya");
  await d.saveAs(file);
  return file;
}
