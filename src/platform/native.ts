// Android (Capacitor) platformu. Şimdilik web davranışını kullanır; yerel kaydetme,
// paylaşma ve "OfficeHere ile aç" desteği platform ajanı tarafından eklenecek.
import type { Platform } from "./types";
import { webPlatform } from "./web";

export const nativePlatform: Platform = { ...webPlatform, native: true };
