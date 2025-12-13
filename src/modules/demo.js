import { Markup } from "telegraf";
import db from "../db/db.js";
import { mainMenuPanel } from "./panels/MainMenuPanel.js";
import { loadConfig } from "../utils/config.js";
import { safeCall } from "../utils/safeCall.js";

const { channelUrl, channelId, trialDurationDays } = loadConfig();

/* ==========================
   KEYBOARDS
========================== */

const demoKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("Проверить", "demo_check"),
    Markup.button.url("Подписаться", channelUrl || ""),
  ],
  [Markup.button.callback("Назад", "demo_back")],
]);

/* ==========================
   HELPERS
========================== */

// Выдача trial (ОДИН РАЗ В ЖИЗНИ)
function giveTrial(userId) {
  const expiresAt =
    Date.now() + trialDurationDays * 24 * 60 * 60 * 1000;

  db.prepare(`
    INSERT INTO users (id, expiresAt, trialUsed)
    VALUES (?, ?, 1)
    ON CONFLICT(id)
    DO UPDATE SET
      expiresAt = excluded.expiresAt,
      trialUsed = 1
  `).run(userId, expiresAt);

  return expiresAt;
}

/* ==========================
   MODULE
========================== */

export function setupDemo(bot) {
  /* ==========================
     OPEN DEMO
  ========================== */
  bot.action("demo", async (ctx) => {
    await safeCall(ctx.answerCbQuery(), "demo.open");

    const userId = ctx.from.id;
    const now = Date.now();

    const row = db
      .prepare(`SELECT expiresAt, trialUsed FROM users WHERE id = ?`)
      .get(userId);

    // 1️⃣ Есть активная подписка (trial или платная)
    if (row && row.expiresAt && row.expiresAt > now) {
      await safeCall(
        ctx.editMessageText(
          `У вас уже есть активная подписка до:\n<b>${new Date(
            row.expiresAt
          ).toLocaleString("ru-RU")}</b>`,
          {
            reply_markup: mainMenuPanel.reply_markup,
            parse_mode: "HTML",
          }
        ),
        "demo.active"
      );
      return;
    }

    // 2️⃣ Trial уже был и закончился → повтор запрещён
    if (row && row.trialUsed === 1 && row.expiresAt <= now) {
      await safeCall(
        ctx.editMessageText(
          "❌ Пробная подписка уже была использована ранее.\n\nПовторное получение trial недоступно.",
          { reply_markup: mainMenuPanel.reply_markup }
        ),
        "demo.trialBlocked"
      );
      return;
    }

    // 3️⃣ Trial ещё не был → проверяем подписку на канал
    let member;
    try {
      member = await ctx.telegram.getChatMember(channelId, userId);
    } catch {
      member = null;
    }

    const isSubscribed =
      member && member.status !== "left" && member.status !== "kicked";

    if (!isSubscribed) {
      await safeCall(
        ctx.editMessageText(
          "Для получения пробной подписки необходимо подписаться на канал:",
          { reply_markup: demoKeyboard.reply_markup }
        ),
        "demo.needSubscribe"
      );
      return;
    }

    // 4️⃣ Всё ок → выдаём trial
    const expiresAt = giveTrial(userId);
    const date = new Date(expiresAt).toLocaleString("ru-RU");

    await safeCall(
      ctx.editMessageText(
        `🎉 Пробная подписка активирована до:\n<b>${date}</b>`,
        {
          reply_markup: mainMenuPanel.reply_markup,
          parse_mode: "HTML",
        }
      ),
      "demo.trialGranted"
    );
  });

  /* ==========================
     CHECK BUTTON
  ========================== */
  bot.action("demo_check", async (ctx) => {
    await safeCall(ctx.answerCbQuery(), "demo.check");

    const userId = ctx.from.id;
    const now = Date.now();

    const row = db
      .prepare(`SELECT expiresAt, trialUsed FROM users WHERE id = ?`)
      .get(userId);

    // Trial уже был → блок
    if (row && row.trialUsed === 1 && row.expiresAt <= now) {
      await safeCall(
        ctx.editMessageText(
          "❌ Пробная подписка уже была использована ранее.",
          { reply_markup: mainMenuPanel.reply_markup }
        ),
        "demo.check.blocked"
      );
      return;
    }

    // Проверяем подписку на канал
    let member;
    try {
      member = await ctx.telegram.getChatMember(channelId, userId);
    } catch {
      member = null;
    }

    if (!member || member.status === "left" || member.status === "kicked") {
      await safeCall(
        ctx.editMessageText(
          "Вы ещё не подписались на канал.\nПодпишитесь и нажмите «Проверить» ещё раз.",
          { reply_markup: demoKeyboard.reply_markup }
        ),
        "demo.check.notSubscribed"
      );
      return;
    }

    // Выдаём trial
    const expiresAt = giveTrial(userId);
    const date = new Date(expiresAt).toLocaleString("ru-RU");

    await safeCall(
      ctx.editMessageText(
        `🎉 Пробная подписка активирована до:\n<b>${date}</b>`,
        {
          reply_markup: mainMenuPanel.reply_markup,
          parse_mode: "HTML",
        }
      ),
      "demo.check.success"
    );
  });

  /* ==========================
     BACK
  ========================== */
  bot.action("demo_back", async (ctx) => {
    await safeCall(ctx.answerCbQuery(), "demo.back");

    try {
      await ctx.deleteMessage();
    } catch {}

    await safeCall(
      ctx.telegram.sendMessage(ctx.chat.id, "Что тебя интересует?", {
        reply_markup: mainMenuPanel.reply_markup,
      }),
      "demo.back.toMain"
    );
  });
}
