import type { Context } from "grammy";
import { AdsStore, type Ad, databaseFrom } from "./ads-store.js";

export const POLL_INTERVAL_MS = 5 * 60 * 1000;
export const now = (): number => Date.now();
export const setting = (ctx: { env?: Record<string, unknown> }, key: "FEED_URL" | "CHANNEL_ID"): string | undefined => {
  const value = ctx.env?.[key] ?? (typeof process === "undefined" ? undefined : process.env[key]);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

export async function contentHash(parts: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(parts));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
}

export function formatAd(ad: Pick<Ad, "title" | "body" | "link">): string {
  return [ad.title, ad.body, ad.link].filter(Boolean).join("\n\n").slice(0, 4096);
}

export async function publishAd(ctx: Context, ad: Omit<Ad, "id" | "channelId" | "channelMessageId" | "postedStatus">, channelId: string): Promise<number> {
  const text = formatAd(ad);
  if (ad.imageUrl) {
    const message = await ctx.api.sendPhoto(channelId, ad.imageUrl, { caption: text.slice(0, 1024) });
    return message.message_id;
  }
  if (ad.videoUrl) {
    const message = await ctx.api.sendVideo(channelId, ad.videoUrl, { caption: text.slice(0, 1024) });
    return message.message_id;
  }
  const message = await ctx.api.sendMessage(channelId, text);
  return message.message_id;
}

export async function storeFor(ctx: { env?: { DB?: unknown } }): Promise<AdsStore | undefined> {
  const db = databaseFrom(ctx);
  return db ? new AdsStore(db) : undefined;
}
