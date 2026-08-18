import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard, requireOwner } from "../toolkit/index.js";
import { contentHash, formatAd, now, publishAd, setting, storeFor } from "../ads-service.js";

registerMainMenuItem({ label: "➕ Add ad", data: "ads:add", order: 10 });
const composer = new Composer<Ctx>();
const cancelKeyboard = inlineKeyboard([[inlineButton("Cancel", "ads:cancel")]]);

async function begin(ctx: Ctx): Promise<void> {
  if (!(await requireOwner(ctx))) return;
  if (!setting(ctx, "CHANNEL_ID")) {
    await ctx.reply("Channel posting isn't set up yet.");
    return;
  }
  if (!(await storeFor(ctx))) {
    await ctx.reply("Ad storage isn't set up yet.");
    return;
  }
  ctx.session.step = "awaiting_ad";
  ctx.session.expiresAt = now() + 5 * 60 * 1000;
  await ctx.reply("Send the ad text. You can attach one image or video and include a link.", {
    reply_markup: cancelKeyboard,
  });
}

composer.command("add", begin);
composer.callbackQuery("ads:add", async (ctx) => {
  await ctx.answerCallbackQuery();
  await begin(ctx);
});
composer.callbackQuery("ads:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = undefined;
  ctx.session.expiresAt = undefined;
  await ctx.editMessageText("Ad submission cancelled.");
});

composer.on("message", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_ad") return next();
  if (!(await requireOwner(ctx))) return;
  const message = ctx.message;
  if (ctx.session.expiresAt !== undefined && now() > ctx.session.expiresAt) {
    ctx.session.step = undefined;
    ctx.session.expiresAt = undefined;
    await ctx.reply("Your ad draft expired. Tap Add ad to start again.");
    return;
  }
  if ("text" in message && message.text?.startsWith("/")) return;
  const photo = "photo" in message ? message.photo?.at(-1) : undefined;
  const video = "video" in message ? message.video : undefined;
  const document = "document" in message ? message.document : undefined;
  const media = photo ?? video ?? document;
  if (media?.file_size !== undefined && media.file_size > 5 * 1024 * 1024) {
    await ctx.reply("That file is over the 5 MB limit. Send a smaller image or video.");
    return;
  }
  const raw = ("text" in message ? message.text : "caption" in message ? message.caption : "")?.trim() ?? "";
  if (!raw) {
    await ctx.reply("Add some ad text, then send it again.");
    return;
  }
  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const link = raw.match(/https?:\/\/[^\s]+/i)?.[0];
  const body = lines.slice(1).join("\n") || lines[0];
  const draft = {
    ownerId: String(ctx.from!.id), title: lines[0].slice(0, 120), body: body.slice(0, 3800), link,
    imageUrl: photo?.file_id ?? (document?.mime_type?.startsWith("image/") ? document.file_id : undefined),
    videoUrl: video?.file_id ?? (document?.mime_type?.startsWith("video/") ? document.file_id : undefined),
    sourceType: "manual" as const, timestamp: now(), contentHash: "",
  };
  draft.contentHash = await contentHash({ title: draft.title, body: draft.body, link: draft.link, image: draft.imageUrl, video: draft.videoUrl });
  const store = await storeFor(ctx);
  const channelId = setting(ctx, "CHANNEL_ID");
  if (!store || !channelId) {
    await ctx.reply("Channel posting isn't set up yet.");
    return;
  }
  if (await store.findByHash(draft.ownerId, draft.contentHash)) {
    ctx.session.step = undefined;
    ctx.session.expiresAt = undefined;
    await ctx.reply("That ad was already posted, so I didn't publish it again.");
    return;
  }
  try {
    const channelMessageId = await publishAd(ctx, draft, channelId);
    await store.add({ ...draft, postedStatus: "posted", channelId, channelMessageId });
    ctx.session.step = undefined;
    ctx.session.expiresAt = undefined;
    await ctx.reply(`Ad posted.\n\n${formatAd(draft)}`, { reply_markup: inlineKeyboard([[inlineButton("View recent ads", "ads:recent")]]) });
  } catch {
    await store.add({ ...draft, postedStatus: "failed", channelId });
    await ctx.reply("I couldn't post that ad to the channel. Check the channel access and try again.");
  }
});

export default composer;
