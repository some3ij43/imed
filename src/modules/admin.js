import { loadConfig, saveConfig } from "../utils/config.js";
import { adminMenu } from "./panels/AdminPanel.js";
import { safeCall } from "../utils/safeCall.js";
import { mainMenuPanel } from "./panels/MainMenuPanel.js";

export function setupAdmin(bot) {
  bot.command("root", async (ctx) => {
    const { admins } = loadConfig();
    const userId = ctx.from.id;

    if (!admins.includes(userId)) {
      await safeCall(
        ctx.reply("У вас нет прав доступа к настройкам бота."),
        "admin root no access"
      );
      return;
    }

    await safeCall(
      ctx.reply("Панель администратора:", adminMenu),
      "admin root panel"
    );
  });

  function askInput(ctx, key, label) {
    const config = loadConfig();
    safeCall(
      ctx.editMessageText(
        `${label}\n\nТекущее значение:\n${config[key]}\n\nВведите новое:`
      ),
      "admin askInput editMessageText"
    );
    ctx.session = { adminEditingKey: key };
  }

  bot.action("admin_show_config", async (ctx) => {
    await safeCall(ctx.answerCbQuery(), "admin_show_config answerCbQuery");
    const {
      trialDurationDays,
      subscriptionDurationDays,
      channelUrl,
      reviewsUrl,
      supportUrl,
      subscriptionDescription,
      admins,
    } = loadConfig();

    const text =
      `Текущие настройки:\n\n` +
      `Триал (дни): ${trialDurationDays}\n` +
      `Подписка (дни): ${subscriptionDurationDays}\n` +
      `Ссылка на канал: ${channelUrl}\n` +
      `Ссылка на отзывы: ${reviewsUrl}\n\n` +
      `Ссылка на поддержку: ${supportUrl}\n\n` +
      `Описание подписки:\n${subscriptionDescription}\n\n` +
      `Администраторы:\n${admins.join(", ")}`;

    await safeCall(
      ctx.editMessageText(text, {
        reply_markup: adminMenu.reply_markup,
      }),
      "admin_show_config editMessageText"
    );
  });

  bot.action("admin_edit_trial", (ctx) => {
    safeCall(ctx.answerCbQuery(), "admin_edit_trial answerCbQuery");
    askInput(ctx, "trialDurationDays", "Редактирование триала (в днях)");
  });

  bot.action("admin_edit_support", (ctx) => {
    safeCall(ctx.answerCbQuery(), "admin_edit_support answerCbQuery");
    askInput(ctx, "supportUrl", "Редактирование ссылки на поддержку");
  });

  bot.action("admin_edit_subscription", (ctx) => {
    safeCall(ctx.answerCbQuery(), "admin_edit_subscription answerCbQuery");
    askInput(
      ctx,
      "subscriptionDurationDays",
      "Редактирование обычной подписки (в днях)"
    );
  });

  bot.action("admin_edit_channel", (ctx) => {
    safeCall(ctx.answerCbQuery(), "admin_edit_channel answerCbQuery");
    askInput(ctx, "channelUrl", "Редактирование ссылки на канал");
  });

  bot.action("admin_edit_reviews", (ctx) => {
    safeCall(ctx.answerCbQuery(), "admin_edit_reviews answerCbQuery");
    askInput(ctx, "reviewsUrl", "Редактирование ссылки на отзывы");
  });

  bot.action("admin_edit_description", (ctx) => {
    safeCall(ctx.answerCbQuery(), "admin_edit_description answerCbQuery");
    askInput(
      ctx,
      "subscriptionDescription",
      "Редактирование описания подписки"
    );
  });

  bot.action("admin_edit_admins", (ctx) => {
    safeCall(ctx.answerCbQuery(), "admin_edit_admins answerCbQuery");
    askInput(
      ctx,
      "admins",
      "Редактирование списка администраторов (введите ID через запятую)"
    );
  });

  bot.action("admin_close", async (ctx) => {
    await safeCall(ctx.answerCbQuery(), "admin_close answerCbQuery");
    await safeCall(ctx.deleteMessage(), "admin_close deleteMessage");

    await safeCall(
      ctx.telegram.sendMessage(
        ctx.chat.id,
        "Вы вышли из режима редактирования"
      ),
      "admin_close send exit msg"
    );

    await safeCall(
      ctx.telegram.sendMessage(ctx.chat.id, "Что тебя интересует?", {
        reply_markup: mainMenuPanel.reply_markup
          // inline_keyboard: [
          //   [{ text: "Демо-версия 📚", callback_data: "demo" }],
          //   [{ text: "Подписка ⚜️", callback_data: "open_subscription" }],
          //   [{ text: "Отзывы ☁️", callback_data: "reviews" }],
          //   [{ text: "Тех. Поддержка ⚒️", callback_data: "support" }],
          //   [{ text: "Telegram-канал 💅", callback_data: "channel" }],
          // ],
        
      }),
      "admin_close send main menu"
    );
  });

  bot.on("text", (ctx, next) => {
    const key = ctx.session?.adminEditingKey;

    if (!key) {
      return next();
    }

    const config = loadConfig();
    const text = ctx.message.text;

    if (key === "admins") {
      const ids = text
        .split(",")
        .map((x) => Number(x.trim()))
        .filter(Boolean);
      config.admins = ids;
    } else if (
      key === "trialDurationDays" ||
      key === "subscriptionDurationDays"
    ) {
      config[key] = Number(text);
    } else {
      config[key] = text;
    }

    saveConfig(config);

    safeCall(ctx.reply("Значение обновлено.", adminMenu), "admin text reply");
    ctx.session = null;
  });
}
