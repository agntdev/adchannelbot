import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, isOwner, mainMenuKeyboard } from "../toolkit/index.js";
import { setting, storeFor } from "../ads-service.js";

// The /start handler renders the bot's MAIN MENU — the primary way users operate
// a button-first bot. A feature adds its own button by calling
// `registerMainMenuItem(...)` in its own `src/handlers/<slug>.ts`; this handler
// renders whatever is registered (plus a Help button), so you do NOT edit this
// file to add a feature. Send ONE message — no placeholder line above the menu.
const composer = new Composer<Ctx>();

const WELCOME = "Channel Ad Poster\n\nChoose an action below.";

async function dashboard(ctx: Ctx): Promise<string> {
  if (!adminChatId(ctx)) return "Owner access isn't set up yet.";
  if (!isOwner(ctx)) return "Only the owner can manage channel ads.";
  const store = await storeFor(ctx);
  const ads = store ? await store.recent(String(ctx.from!.id)) : [];
  const channel = setting(ctx, "CHANNEL_ID") ? "connected" : "not set up";
  const feed = setting(ctx, "FEED_URL") ? "connected" : "not set up";
  return `${WELCOME}\n\nChannel: ${channel}\nFeed: ${feed}\nRecent posts: ${ads.filter((ad) => ad.postedStatus === "posted").length}`;
}

composer.command("start", async (ctx) => {
  await ctx.reply(await dashboard(ctx), { reply_markup: mainMenuKeyboard() });
});

// "Back to menu" — re-render the main menu in place from any sub-view.
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(await dashboard(ctx), { reply_markup: mainMenuKeyboard() });
});

export default composer;
