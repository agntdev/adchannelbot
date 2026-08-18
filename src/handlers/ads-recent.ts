import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem, requireOwner } from "../toolkit/index.js";
import { formatAd, publishAd, setting, storeFor } from "../ads-service.js";

registerMainMenuItem({ label: "Recent ads", data: "ads:recent", order: 20 });
const composer = new Composer<Ctx>();

async function recent(ctx: Ctx, edit: boolean): Promise<void> {
  if (!(await requireOwner(ctx))) return;
  const store = await storeFor(ctx);
  if (!store) { await ctx.reply("Ad storage isn't set up yet."); return; }
  const ads = await store.recent(String(ctx.from!.id));
  if (ads.length === 0) {
    const text = "No ads yet — tap ➕ Add ad to publish one.";
    if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard([[inlineButton("➕ Add ad", "ads:add")]]) });
    else await ctx.reply(text, { reply_markup: inlineKeyboard([[inlineButton("➕ Add ad", "ads:add")]]) });
    return;
  }
  const rows = ads.map((ad) => [inlineButton(`View: ${ad.title.slice(0, 28)}`, `ads:view:${ad.id}`)]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  const text = `Your latest ads (${ads.length}). Tap one to repost or delete it.`;
  if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) });
  else await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
}

composer.callbackQuery("ads:recent", async (ctx) => { await ctx.answerCallbackQuery(); await recent(ctx, true); });
composer.callbackQuery(/^ads:view:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const store = await storeFor(ctx); const ad = store && await store.byId(String(ctx.from!.id), Number(ctx.match[1]));
  if (!ad) { await ctx.editMessageText("That ad is no longer available."); return; }
  await ctx.editMessageText(`${formatAd(ad)}\n\nStatus: ${ad.postedStatus}.`, { reply_markup: inlineKeyboard([
    [inlineButton("Repost", `ads:repost:${ad.id}`), inlineButton("Delete", `ads:delete:${ad.id}`)],
    [inlineButton("⬅️ Recent ads", "ads:recent")],
  ]) });
});
composer.callbackQuery(/^ads:delete:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const store = await storeFor(ctx); const ad = store && await store.byId(String(ctx.from!.id), Number(ctx.match[1]));
  if (!store || !ad) { await ctx.editMessageText("That ad is no longer available."); return; }
  await ctx.editMessageText("Delete this ad from your channel?", { reply_markup: inlineKeyboard([
    [inlineButton("Delete ad", `ads:confirm-delete:${ad.id}`), inlineButton("Keep ad", `ads:view:${ad.id}`)],
  ]) });
});
composer.callbackQuery(/^ads:confirm-delete:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const store = await storeFor(ctx); const ad = store && await store.byId(String(ctx.from!.id), Number(ctx.match[1]));
  if (!store || !ad) { await ctx.editMessageText("That ad is no longer available."); return; }
  try { if (ad.channelId && ad.channelMessageId) await ctx.api.deleteMessage(ad.channelId, ad.channelMessageId); } catch { /* channel deletion can already be complete */ }
  await store.setStatus(ad.ownerId, ad.id, "deleted");
  await ctx.editMessageText("Ad deleted from your channel.", { reply_markup: inlineKeyboard([[inlineButton("Recent ads", "ads:recent")]]) });
});
composer.callbackQuery(/^ads:repost:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const store = await storeFor(ctx); const ad = store && await store.byId(String(ctx.from!.id), Number(ctx.match[1])); const channelId = setting(ctx, "CHANNEL_ID");
  if (!store || !ad || !channelId) { await ctx.editMessageText("Channel posting isn't set up yet."); return; }
  try {
    const messageId = await publishAd(ctx, ad, channelId);
    await store.setStatus(ad.ownerId, ad.id, "posted", messageId);
    await ctx.editMessageText("Ad reposted to your channel.", { reply_markup: inlineKeyboard([[inlineButton("Recent ads", "ads:recent")]]) });
  } catch { await ctx.editMessageText("I couldn't repost that ad. Check the channel access and try again."); }
});
export default composer;
