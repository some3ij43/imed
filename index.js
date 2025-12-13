import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import { setupAuth, withAccess } from "./src/modules/auth.js";
import { setupMain } from "./src/modules/main.js";
import { setupSubscription } from "./src/modules/subscription.js";
import { setupDemo } from "./src/modules/demo.js";
import { setupAdmin } from "./src/modules/admin.js";
import { session } from "telegraf";
import { safeCall } from "./src/utils/safeCall.js";
import { setupMaterials } from "./src/modules/test.js";
import { setupTests } from "./src/modules/testsDisplay.js";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use((ctx, next) => {
  console.log("EVENT:", ctx.updateType, ctx.message?.text);
  return next();
});

bot.use(session());

setupAuth(bot);
setupMain(bot);
setupSubscription(bot);
setupDemo(bot);
setupAdmin(bot);
setupMaterials(bot)
setupTests(bot)


bot.command(
  "secret",
  withAccess(async (ctx) => {
    await safeCall(
      ctx.reply("🔐 Секретный контент доступен Вам!"),
      "secret.reply"
    );
  })
);

bot.command(
  "profile",
  withAccess(async (ctx) => {
    await safeCall(ctx.reply("Ваш профиль доступен."), "profile.reply");
  })
);

bot.catch((err) => {
  console.log("GLOBAL ERROR:", err.description || err);
});

safeCall(bot.launch(), "bot.launch");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
