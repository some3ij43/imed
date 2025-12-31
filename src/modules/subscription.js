import { Markup } from "telegraf";
import db from "../db/db.js";
import { safeCall } from "../utils/safeCall.js";
import { loadConfig } from "../utils/config.js";
import { mainMenuPanel } from "./panels/MainMenuPanel.js";

const PROVIDER_TOKEN = process.env.PAYMENTS_PROVIDER_TOKEN; // ЮKassa

/* ==========================
   KEYBOARDS
========================== */

const subscriptionMenu = Markup.inlineKeyboard([
  [Markup.button.callback("Подписка 💵", "sub_plans")],
  [Markup.button.callback("О подписке ⚜️", "sub_about")],
  [Markup.button.callback("Промокод 🐾", "sub_promo")],
  [Markup.button.callback("Вернуться назад 👀", "sub_back")],
]);

const backButton = Markup.inlineKeyboard([
  [Markup.button.callback("Вернуться назад 👀", "sub_back")],
]);

function plansKeyboard(subscriptions) {
  const rows = subscriptions.map((s) => [
    Markup.button.callback(`${s.title} — ${s.price / 100}₽`, `sub_buy_${s.id}`),
  ]);

  rows.push([Markup.button.callback("↩️ Назад", "open_subscription")]);

  return Markup.inlineKeyboard(rows);
}

/* ==========================
   MODULE
========================== */

export function setupSubscription(bot) {
  /* ==========================
     OPEN SUB MENU
  ========================== */
  bot.action("open_subscription", async (ctx) => {
    await safeCall(ctx.answerCbQuery(), "sub.open");

    const userId = ctx.from.id;
    const activeSub = getActiveSubscription(userId);

    // ✅ ЕСТЬ АКТИВНАЯ ПОДПИСКА
    if (activeSub) {
      const until = new Date(activeSub.expiresAt).toLocaleString("ru-RU");

      await safeCall(
        ctx.editMessageText(
          `⚜️ <b>Ваша подписка активна</b>\n\n` +
            `📦 План: <b>${activeSub.title}</b>\n` +
            `⏳ Действует до: <b>${until}</b>`,
          {
            parse_mode: "HTML",
            reply_markup: backButton.reply_markup,
          }
        ),
        "sub.active"
      );
      return;
    }

    // ❌ ПОДПИСКИ НЕТ → обычное меню
    await safeCall(
      ctx.editMessageText("Меню подписки:", {
        reply_markup: subscriptionMenu.reply_markup,
      }),
      "sub.menu"
    );
  });

  /* ==========================
     ABOUT
  ========================== */
  bot.action("sub_about", async (ctx) => {
    const { subscriptionDescription } = loadConfig();

    await safeCall(ctx.answerCbQuery(), "sub.about");

    await safeCall(
      ctx.editMessageText(subscriptionDescription, {
        parse_mode: "HTML",
        reply_markup: backButton.reply_markup,
      }),
      "sub.about.text"
    );
  });

  /* ==========================
     LIST PLANS FROM DB
  ========================== */
  bot.action("sub_plans", async (ctx) => {
    await safeCall(ctx.answerCbQuery(), "sub.plans");

    const subs = db
      .prepare(`SELECT * FROM subscriptions ORDER BY price ASC`)
      .all();

    if (!subs.length) {
      await safeCall(
        ctx.editMessageText("Подписок пока нет. Попробуйте позже.", {
          reply_markup: backButton.reply_markup,
        }),
        "sub.plans.empty"
      );
      return;
    }

    await safeCall(
      ctx.editMessageText("Выберите вариант подписки:", {
        reply_markup: plansKeyboard(subs).reply_markup,
      }),
      "sub.plans.list"
    );
  });

  /* ==========================
     CREATE PAYMENT (INVOICE)
  ========================== */
  bot.action(/^sub_buy_(\d+)$/, async (ctx) => {
    await safeCall(ctx.answerCbQuery(), "sub.buy");

    const subId = Number(ctx.match[1]);

    const sub = db
      .prepare(`SELECT * FROM subscriptions WHERE id = ?`)
      .get(subId);

    if (!sub) {
      await safeCall(ctx.reply("❌ Подписка не найдена."), "sub.buy.notFound");
      return;
    }

    await ctx.replyWithInvoice({
      title: sub.title,
      description: `Срок действия: ${sub.durationDays} дней`,
      payload: `subscription_${sub.id}`,
      provider_token: process.env.PAYMENTS_PROVIDER_TOKEN_TEST,
      currency: "RUB",
      prices: [
        {
          label: sub.title,
          amount: sub.price, // ⚠️ в копейках
        },
      ],
    });
  });

  /* ==========================
     REQUIRED FOR PAYMENTS
  ========================== */
  bot.on("pre_checkout_query", async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on("successful_payment", async (ctx) => {
    const payment = ctx.message.successful_payment;
    const userId = ctx.from.id;

    // payload вида: subscription_3
    const payload = payment.invoice_payload;

    const match = payload.match(/^subscription_(\d+)$/);
    if (!match) {
      console.log("❌ Unknown payment payload:", payload);
      return;
    }

    const subscriptionId = Number(match[1]);

    // получаем подписку
    const sub = db
      .prepare(`SELECT * FROM subscriptions WHERE id = ?`)
      .get(subscriptionId);

    if (!sub) {
      console.log("❌ Subscription not found:", subscriptionId);
      return;
    }

    const expiresAt = Date.now() + sub.durationDays * 24 * 60 * 60 * 1000;

    // ⬇️ ВАЖНО: ЗАПИСЬ В USERS
    db.prepare(
      `
    INSERT INTO users (id, subscriptionId, expiresAt)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      subscriptionId = excluded.subscriptionId,
      expiresAt = excluded.expiresAt
  `
    ).run(userId, subscriptionId, expiresAt);

    console.log("✅ SUBSCRIPTION ACTIVATED:", {
      userId,
      subscriptionId,
      expiresAt,
    });

    // сообщение пользователю
    await safeCall(
      ctx.reply("✅ Оплата прошла успешно!\n\nПодписка активирована 🎉"),
      "payment.success.message"
    );

    // главное меню новым сообщением
    await safeCall(
      ctx.telegram.sendMessage(ctx.chat.id, "Что тебя интересует?", {
        reply_markup: mainMenuPanel.reply_markup
      }),
      "payment.success.mainMenu"
    );
  });

  /* ==========================
     PROMO (STUB)
  ========================== */
  bot.action("sub_promo", async (ctx) => {
    await safeCall(ctx.answerCbQuery(), "sub.promo");

    await safeCall(
      ctx.editMessageText("Введите промокод:", {
        reply_markup: backButton.reply_markup,
      }),
      "sub.promo.text"
    );
  });

  /* ==========================
     BACK TO MAIN MENU
  ========================== */
  bot.action("sub_back", async (ctx) => {
    await safeCall(ctx.answerCbQuery(), "sub.back");

    try {
      await ctx.deleteMessage();
    } catch {}

    await safeCall(
      ctx.telegram.sendMessage(ctx.chat.id, "Что тебя интересует?", {
        reply_markup: mainMenuPanel.reply_markup
      }),
      "sub.back.menu"
    );
  });

  //TODO удалить

    bot.command("clear_subscription", async (ctx) => {
    const userId = ctx.from.id;

    const result = db
      .prepare(`
        UPDATE users
        SET subscriptionId = NULL,
            expiresAt = NULL
        WHERE id = ?
      `)
      .run(userId);

    if (result.changes === 0) {
      await ctx.reply("ℹ У вас не было активной подписки.");
      return;
    }

    await ctx.reply(
      "🧹 Подписка полностью очищена.\n\n" +
      "Теперь вы считаетесь пользователем без подписки."
    );
  });
}

function getActiveSubscription(userId) {
  return db
    .prepare(
      `
      SELECT s.*, u.expiresAt
      FROM users u
      JOIN subscriptions s ON u.subscriptionId = s.id
      WHERE u.id = ? AND u.expiresAt > ?
      `
    )
    .get(userId, Date.now());
}
