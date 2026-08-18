import type { Context } from "grammy";
import { adminChatId } from "./toolkit/index.js";
import { contentHash, now, publishAd, setting, storeFor } from "./ads-service.js";

type FeedItem = { title: string; body: string; link?: string; imageUrl?: string; videoUrl?: string };
type PollCtx = Pick<Context, "api"> & { env?: Record<string, unknown> };
function strip(value: string): string { return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function xmlValue(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? strip(match[1]) : undefined;
}
export function parseFeed(payload: string, type: string | null): FeedItem[] {
  if (type?.includes("json") || /^[\s\n]*[\[{]/.test(payload)) {
    const data = JSON.parse(payload) as { items?: unknown[] } | unknown[];
    const entries = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
    return entries.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const x = entry as Record<string, unknown>;
      const title = typeof x.title === "string" ? x.title.trim() : "";
      const body = typeof x.content_text === "string" ? x.content_text : typeof x.content === "string" ? strip(x.content) : typeof x.description === "string" ? strip(x.description) : "";
      const link = typeof x.url === "string" ? x.url : typeof x.link === "string" ? x.link : undefined;
      return title || body ? [{ title: (title || body).slice(0, 120), body: (body || title).slice(0, 3800), link }] : [];
    });
  }
  return payload.match(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi)?.flatMap((item) => {
    const title = xmlValue(item, "title") ?? ""; const body = xmlValue(item, "description") ?? xmlValue(item, "content") ?? title;
    const link = item.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] ?? xmlValue(item, "link");
    return title || body ? [{ title: title.slice(0, 120), body: body.slice(0, 3800), link }] : [];
  }) ?? [];
}
async function notify(ctx: PollCtx, text: string): Promise<void> {
  const owner = adminChatId(ctx);
  if (!owner) return;
  try { await ctx.api.sendMessage(owner, text); } catch { /* a blocked owner must not stop polling */ }
}
export async function pollFeed(ctx: PollCtx): Promise<{ message: string; posted: number }> {
  const owner = adminChatId(ctx); const feedUrl = setting(ctx, "FEED_URL"); const channelId = setting(ctx, "CHANNEL_ID"); const store = await storeFor(ctx);
  if (!owner || !feedUrl || !channelId || !store) return { message: "Feed posting isn't set up yet.", posted: 0 };
  let response: Response;
  try { response = await fetch(feedUrl, { headers: { accept: "application/rss+xml, application/json" } }); }
  catch { await notify(ctx, "I couldn't reach the ad feed. I'll try again in 5 minutes."); return { message: "I couldn't reach the ad feed.", posted: 0 }; }
  if (!response.ok) { await notify(ctx, "The ad feed returned an error. I'll try again in 5 minutes."); return { message: "The ad feed returned an error.", posted: 0 }; }
  let items: FeedItem[];
  try { items = parseFeed(await response.text(), response.headers.get("content-type")); }
  catch { await notify(ctx, "I couldn't read the ad feed. I'll try again in 5 minutes."); return { message: "I couldn't read the ad feed.", posted: 0 }; }
  let posted = 0;
  for (const item of items.slice(0, 20)) {
    const hash = await contentHash(item);
    if (await store.hasFeedItem(owner, hash)) continue;
    if (await store.findByHash(owner, hash)) continue;
    const draft = { ownerId: owner, ...item, sourceType: "feed" as const, timestamp: now(), contentHash: hash };
    try {
      const channelMessageId = await publishAd(ctx as Context, draft, channelId);
      await store.add({ ...draft, postedStatus: "posted", channelId, channelMessageId });
      await store.markFeedItem(owner, hash, now(), feedUrl);
      posted++;
    } catch { await store.add({ ...draft, postedStatus: "failed", channelId }); await notify(ctx, "I couldn't post a feed ad to the channel."); }
  }
  if (posted) await notify(ctx, `${posted} new feed ad${posted === 1 ? "" : "s"} posted to your channel.`);
  return { message: posted ? `${posted} new feed ad${posted === 1 ? " was" : "s were"} posted.` : "No new ads found in the feed.", posted };
}
