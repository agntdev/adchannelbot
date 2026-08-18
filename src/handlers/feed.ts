import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem, requireOwner } from "../toolkit/index.js";
import { pollFeed } from "../feed-poller.js";
import { setting } from "../ads-service.js";

registerMainMenuItem({ label: "Feed status", data: "feed:status", order: 30 });
const composer = new Composer<Ctx>();
composer.callbackQuery("feed:status", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const feed = setting(ctx, "FEED_URL") ? "connected" : "not set up";
  const channel = setting(ctx, "CHANNEL_ID") ? "connected" : "not set up";
  await ctx.editMessageText(`Feed: ${feed}\nChannel: ${channel}\nPolling runs every 5 minutes.`, {
    reply_markup: inlineKeyboard([[inlineButton("Poll now", "feed:poll")], [inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});
composer.callbackQuery("feed:poll", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const result = await pollFeed(ctx);
  await ctx.editMessageText(result.message, { reply_markup: inlineKeyboard([[inlineButton("Feed status", "feed:status")]]) });
});
export default composer;
