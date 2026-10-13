import { Capacitor } from "@capacitor/core";
import type { Platform } from "./types";
import { webPlatform } from "./web";

export * from "./types";
export * from "./formats";

let current: Platform | null = null;

/** Çalışılan ortamın platformu (Android'de yerel, tarayıcıda web). */
export async function getPlatform(): Promise<Platform> {
  if (current) return current;
  if (Capacitor.isNativePlatform()) {
    const { nativePlatform } = await import("./native");
    current = nativePlatform;
  } else current = webPlatform;
  return current;
}
