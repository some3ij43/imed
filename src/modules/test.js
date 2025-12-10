import { Markup } from "telegraf";
import db from "../db/db.js";
import { safeCall } from "../utils/safeCall.js";

const materialsMenu = Markup.inlineKeyboard([
  [{ text: "Создать тест 🆕", callback_data: "admin_create_test" }],
  [{ text: "Просмотр тестов 📖", callback_data: "admin_list_tests" }],
  [{ text: "Назад", callback_data: "admin_back" }],
]);

export function setupMaterials(bot) {
  // ==========================
  // Вход в раздел материалов
  // ==========================
  bot.action("admin_materials", async (ctx) => {
    console.log("[MATERIALS] Open menu");

    ensureSession(ctx);
    await safeCall(ctx.answerCbQuery(), "materials.open");

    await safeCall(
      ctx.editMessageText("Меню материалов:", {
        reply_markup: materialsMenu.reply_markup,
      }),
      "materials.menu"
    );
  });

  // ==========================
  // СОЗДАНИЕ ТЕСТА – шаг 1 (ввести название)
  // ==========================
  bot.action("admin_create_test", async (ctx) => {
    console.log("[MATERIALS] Creating new test");

    ensureSession(ctx);
    ctx.session.creatingTest = true;

    await safeCall(ctx.answerCbQuery(), "materials.create.start");

    await safeCall(
      ctx.editMessageText("Введите название теста:"),
      "materials.create.askTitle"
    );
  });

  // ==========================
  // ОБРАБОТКА ТЕКСТА ПРИ СОЗДАНИИ ТЕСТА / ВОПРОСОВ
  // ==========================
  bot.on("text", async (ctx) => {
    ensureSession(ctx);

    // === Создание теста ===
    if (ctx.session.creatingTest) {
      console.log("[MATERIALS] Test title entered");

      const title = ctx.message.text;

      const result = db
        .prepare("INSERT INTO tests (title) VALUES (?)")
        .run(title);

      ctx.session.creatingTest = false;
      ctx.session.testId = result.lastInsertRowid;

      console.log("[MATERIALS] Test created id =", ctx.session.testId);

      await safeCall(
        ctx.reply(`Тест создан: <b>${title}</b>`, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Добавить вопрос ➕",
                  callback_data: "admin_add_question",
                },
              ],
              [{ text: "Готово", callback_data: "admin_materials" }],
            ],
          },
        }),
        "materials.create.done"
      );

      return;
    }

    // === Добавление вопроса ===
    if (ctx.session.addingQuestion) {
      const msg = ctx.message.text;

      // FRONT
      if (ctx.session.expectingFront) {
        console.log("[MATERIALS] FRONT added");

        ctx.session.front = msg;
        ctx.session.expectingFront = false;
        ctx.session.expectingBack = true;

        await safeCall(
          ctx.reply("Введите текст задней стороны карточки (back):"),
          "materials.question.askBack"
        );

        return;
      }

      // BACK
      if (ctx.session.expectingBack) {
        console.log("[MATERIALS] BACK added");

        const testId = ctx.session.testId;

        db.prepare(
          `INSERT INTO test_questions (testId, frontText, backText)
           VALUES (?, ?, ?)`
        ).run(testId, ctx.session.front, msg);

        ctx.session.expectingBack = false;

        await safeCall(
          ctx.reply("Вопрос добавлен!", {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Добавить ещё ➕",
                    callback_data: "admin_add_question",
                  },
                ],
                [{ text: "Готово", callback_data: "admin_materials" }],
              ],
            },
          }),
          "materials.question.saved"
        );

        return;
      }
    }
  });

  // ==========================
  // СОЗДАТЬ НОВЫЙ ВОПРОС
  // ==========================
  bot.action("admin_add_question", async (ctx) => {
    console.log("[MATERIALS] Start adding question");

    ensureSession(ctx);

    ctx.session.addingQuestion = true;
    ctx.session.expectingFront = true;

    await safeCall(ctx.answerCbQuery(), "materials.question.start");

    await safeCall(
      ctx.reply("Введите текст передней стороны карточки (front):"),
      "materials.question.askFront"
    );
  });

  // ==========================
  // ПРОСМОТР СПИСКА ТЕСТОВ
  // ==========================
  bot.action("admin_list_tests", async (ctx) => {
    console.log("[MATERIALS] Listing tests");

    ensureSession(ctx);
    await safeCall(ctx.answerCbQuery(), "materials.list");

    const tests = db.prepare("SELECT * FROM tests").all();

    if (tests.length === 0) {
      await safeCall(
        ctx.editMessageText("Тестов пока нет.", {
          reply_markup: materialsMenu.reply_markup,
        }),
        "materials.list.empty"
      );
      return;
    }

    const keyboard = tests.map((t) => [
      { text: t.title, callback_data: `test_open_${t.id}` },
    ]);

    keyboard.push([{ text: "Назад", callback_data: "admin_materials" }]);

    await safeCall(
      ctx.editMessageText("Выберите тест:", {
        reply_markup: { inline_keyboard: keyboard },
      }),
      "materials.list.show"
    );
  });

  // ==========================
  // ОТКРЫТЬ ТЕСТ
  // ==========================
  bot.action(/^test_open_(\d+)$/, async (ctx) => {
    ensureSession(ctx);

    const testId = Number(ctx.match[1]);
    console.log("[TEST] Opening test id =", testId);

    await safeCall(ctx.answerCbQuery(), "test.open");

    const questions = db
      .prepare("SELECT * FROM test_questions WHERE testId = ?")
      .all(testId);

    if (questions.length === 0) {
      await safeCall(
        ctx.editMessageText("У теста нет вопросов.", {
          reply_markup: materialsMenu.reply_markup,
        }),
        "test.open.empty"
      );
      return;
    }

    ctx.session.currentTest = { testId, index: 0 };

    return showQuestion(ctx);
  });

  // ==========================
  // NEXT / PREV / FLIP – оставляем как есть
  // ==========================
  bot.action("test_next", async (ctx) => {
    ensureSession(ctx);
    await safeCall(ctx.answerCbQuery(), "test.next");

    const s = ctx.session.currentTest;
    if (!s) return;

    const count = db
      .prepare("SELECT COUNT(*) AS c FROM test_questions WHERE testId = ?")
      .get(s.testId).c;

    if (s.index < count - 1) s.index++;

    return showQuestion(ctx);
  });

  bot.action("test_prev", async (ctx) => {
    ensureSession(ctx);
    await safeCall(ctx.answerCbQuery(), "test.prev");

    const s = ctx.session.currentTest;
    if (!s) return;

    if (s.index > 0) s.index--;

    return showQuestion(ctx);
  });

  bot.action("test_flip", async (ctx) => {
    ensureSession(ctx);
    await safeCall(ctx.answerCbQuery(), "test.flip");

    const { testId, index } = ctx.session.currentTest;

    const q = db
      .prepare("SELECT * FROM test_questions WHERE testId = ? LIMIT 1 OFFSET ?")
      .get(testId, index);

    await safeCall(
      ctx.editMessageText(
        `🔄 Обратная сторона:\n\n${q.backText}`,
        questionKeyboard()
      ),
      "test.flip.show"
    );
  });
}

/*
    ===================
    ВСПОМОГАТЕЛЬНОЕ
    ===================
*/

function ensureSession(ctx) {
  if (!ctx.session) ctx.session = {};
}

function questionKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "⬅️", callback_data: "test_prev" },
          { text: "➡️", callback_data: "test_next" },
        ],
        [{ text: "🔄 Показать больше", callback_data: "test_flip" }],
        [{ text: "↩️ Назад", callback_data: "admin_list_tests" }],
      ],
    },
  };
}

async function showQuestion(ctx) {
  ensureSession(ctx);

  const { testId, index } = ctx.session.currentTest;

  const q = db
    .prepare("SELECT * FROM test_questions WHERE testId = ? LIMIT 1 OFFSET ?")
    .get(testId, index);

  await safeCall(
    ctx.editMessageText(
      `❓ Вопрос ${index + 1}\n\n${q.frontText}`,
      questionKeyboard()
    ),
    "test.showQuestion"
  );
}
