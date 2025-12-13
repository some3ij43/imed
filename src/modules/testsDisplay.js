// src/modules/tests.js
import { Markup } from "telegraf";
import db from "../db/db.js";
import { safeCall } from "../utils/safeCall.js";
import { mainMenuPanel } from "./panels/MainMenuPanel.js";

// Проверка активной подписки по таблице users (expiresAt)
function hasActiveSubscription(userId) {
  const row = db
    .prepare("SELECT expiresAt FROM users WHERE id = ?")
    .get(userId);

  if (!row?.expiresAt) return false;
  return Number(row.expiresAt) > Date.now();
}

function testsListKeyboard(tests) {
  const keyboard = tests.map((t) => [
    Markup.button.callback(t.title, `tests_open_${t.id}`),
  ]);

  keyboard.push([Markup.button.callback("Назад", "tests_back")]);

  return Markup.inlineKeyboard(keyboard);
}

export function setupTests(bot) {
  bot.action("tests", async (ctx) => {
    await safeCall(ctx.answerCbQuery(), "tests.open.answerCbQuery");

    const userId = ctx.from?.id;
    if (!userId) return;

    const isSubscribed = hasActiveSubscription(userId);

    if (!isSubscribed) {
      await safeCall(
        ctx.editMessageText(
          "🔒 Доступ к разделу «Тесты» возможен только по активной подписке.\n\nОформите подписку, чтобы продолжить.",
          {
            reply_markup: Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  "⚜️ Оформить подписку",
                  "open_subscription"
                ),
              ],
              [Markup.button.callback("↩️ Назад", "tests_back")],
            ]).reply_markup,
          }
        ),
        "tests.open.noSubscription"
      );
      return;
    }

    const tests = db
      .prepare("SELECT id, title FROM tests ORDER BY id DESC")
      .all();

    if (!tests.length) {
      await safeCall(
        ctx.editMessageText("Пока нет доступных тестов.", {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback("Назад", "tests_back")],
          ]).reply_markup,
        }),
        "tests.open.empty"
      );
      return;
    }

    await safeCall(
      ctx.editMessageText("Выберите тест:", testsListKeyboard(tests)),
      "tests.open.list"
    );
  });

  bot.action("tests_back", async (ctx) => {
    await safeCall(ctx.answerCbQuery(), "tests.back.answerCbQuery");

    await safeCall(
      ctx.editMessageText("Главное меню:", {
        reply_markup: mainMenuPanel.reply_markup,
      }),
      "tests.back.toMainMenu"
    );
  });
}
