import type { Plugin } from "vite";

/** Sanal derleyici modülünü gerçek paket yoluna çevirir. */
export function kimligiCevir(id: string): string;

/** Vite eklentisi: derleme çıktısına THIRD_PARTY_NOTICES.txt ekler. */
export function lisansBildirimi(): Plugin;
