const lastBotMessages = new Map();

export async function replyWithCleanup(ctx, text, keyboard) {
  try {
    if (ctx.message) {
      await ctx.deleteMessage(ctx.message.message_id).catch(() => {});
    }

    const botMsgId = lastBotMessages.get(ctx.from.id);
    if (botMsgId) {
      await ctx.deleteMessage(botMsgId).catch(() => {});
    }
    const sent = await ctx.reply(text, keyboard ?? undefined);

    lastBotMessages.set(ctx.from.id, sent.message_id);
  } catch (err) {
    console.error('cleanup error:', err);
  }
}