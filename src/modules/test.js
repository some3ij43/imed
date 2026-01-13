import { Markup } from "telegraf";
import db from "../db/db.js";
import { safeCall } from "../utils/safeCall.js";

const materialsMenu = Markup.inlineKeyboard([
  [{ text: "Создать тест 🆕", callback_data: "admin_create_test" }],
  [{ text: "Просмотр тестов 📖", callback_data: "admin_list_tests" }],
  [{ text: "Назад", callback_data: "admin_back" }],
]);

export function setupMaterials(bot) {
  const ensureSession = (ctx) => {
    if (!ctx.session) ctx.session = {};
  };

  bot.action("admin_materials", async (ctx) => {
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
  // СОЗДАНИЕ ТЕСТА
  // ==========================
  bot.action("admin_create_test", async (ctx) => {
    ensureSession(ctx);

    ctx.session = {
      creatingTest: true,
    };

    await safeCall(ctx.answerCbQuery(), "materials.create.start");

    await safeCall(
      ctx.editMessageText("Введите название теста:"),
      "materials.create.askTitle"
    );
  });

  // ==========================
  // ВВОД ТЕКСТА / КАРТИНОК
  // ==========================
  bot.on("text", async (ctx) => {
    ensureSession(ctx);
    const msg = ctx.message.text;

    // === Создание теста ===
    if (ctx.session.creatingTest) {
      const title = msg;

      const result = db
        .prepare("INSERT INTO tests (title) VALUES (?)")
        .run(title);

      ctx.session.creatingTest = false;
      ctx.session.testId = result.lastInsertRowid;

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
      // FRONT TEXT
      //   if (ctx.session.expectingFrontText) {
      //     ctx.session.frontText = msg;
      //     ctx.session.expectingFrontText = false;
      //     ctx.session.expectingFrontImage = true;

      //     await safeCall(
      //       ctx.reply("Отправьте изображение для FRONT или /skip"),
      //       "materials.question.askFrontImage"
      //     );

      //     return;
      //   }
      // FRONT TEXT
      if (ctx.session.addingQuestion && ctx.session.expectingFrontText) {
        ctx.session.frontText = msg;

        ctx.session.expectingFrontText = false;
        ctx.session.expectingFrontImage = true; // <-- обязательная строка!

        await safeCall(
          ctx.reply("Отправьте изображение для FRONT или /skip"),
          "materials.question.askFrontImage"
        );

        return;
      }

      // BACK TEXT
      if (ctx.session.addingQuestion && ctx.session.expectingBackText) {
        ctx.session.backText = msg;
        ctx.session.expectingBackText = false;
        ctx.session.expectingBackImage = true;

        await safeCall(
          ctx.reply("Отправьте изображение для BACK или /skip"),
          "materials.question.askBackImage"
        );

        return;
      }
    }
  });

  // ==========================
  // ОБРАБОТКА КАРТИНОК
  // ==========================
  bot.on("photo", async (ctx) => {
    ensureSession(ctx);

    const fileId = ctx.message.photo.at(-1).file_id;

    // FRONT IMAGE
    if (ctx.session.expectingFrontImage) {
      ctx.session.frontImageId = fileId;
      ctx.session.expectingFrontImage = false;
      ctx.session.expectingBackText = true;

      await safeCall(
        ctx.reply("Введите текст BACK:"),
        "materials.frontImage.done"
      );

      return;
    }

    // BACK IMAGE
    if (ctx.session.expectingBackImage) {
      ctx.session.backImageId = fileId;
      ctx.session.expectingBackImage = false;

      await saveQuestion(ctx);
      return;
    }
  });

  bot.command("skip", async (ctx) => {
    ensureSession(ctx);

    if (!ctx.session.addingQuestion) {
      await safeCall(ctx.reply("Сейчас пропускать нечего."), "skip.nothing");
      return;
    }

    // === SKIP FRONT IMAGE ===
    if (ctx.session.expectingFrontImage) {
      ctx.session.frontImageId = null;
      ctx.session.expectingFrontImage = false;
      ctx.session.expectingBackText = true;

      await safeCall(ctx.reply("Введите текст BACK:"), "skip.frontImage");
      return;
    }

    // === SKIP BACK IMAGE ===
    if (ctx.session.expectingBackImage) {
      ctx.session.backImageId = null;
      ctx.session.expectingBackImage = false;

      await saveQuestion(ctx);
      return;
    }

    await safeCall(ctx.reply("Сейчас пропускать нечего."), "skip.nothing");
  });

  // ==========================
  // НАЧАТЬ ДОБАВЛЕНИЕ ВОПРОСА
  // ==========================
  bot.action("admin_add_question", async (ctx) => {
    ensureSession(ctx);

    ctx.session.addingQuestion = true;
    ctx.session.expectingFrontText = true;

    await safeCall(ctx.answerCbQuery(), "materials.question.start");

    await safeCall(
      ctx.reply("Введите текст FRONT:"),
      "materials.question.askFront"
    );
  });

  // ==========================
  // СПИСОК ТЕСТОВ
  // ==========================
  bot.action("admin_list_tests", async (ctx) => {
    ensureSession(ctx);
    await safeCall(ctx.answerCbQuery(), "materials.list");

    const tests = db.prepare("SELECT * FROM tests").all();

    if (tests.length === 0) {
      return safeCall(
        ctx.editMessageText("Тестов пока нет.", {
          reply_markup: materialsMenu.reply_markup,
        }),
        "materials.list.empty"
      );
    }

    const keyboard = tests.map((t) => [
      { text: t.title, callback_data: `test_open_${t.id}` },
      { text: "🗑 Удалить", callback_data: `test_delete_${t.id}` },
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

    const questions = db
      .prepare("SELECT * FROM test_questions WHERE testId = ?")
      .all(testId);

    if (!questions.length) {
      return safeCall(
        ctx.editMessageText("У теста нет вопросов.", {
          reply_markup: materialsMenu.reply_markup,
        }),
        "test.open.empty"
      );
    }

    ctx.session.currentTest = { testId, index: 0 };
    return showQuestion(ctx);
  });

  // листание
  bot.action("test_next", async (ctx) => {
    ensureSession(ctx);

    const s = ctx.session.currentTest;
    if (!s) return;

    const qty = db
      .prepare("SELECT COUNT(*) AS c FROM test_questions WHERE testId = ?")
      .get(s.testId).c;

    if (s.index < qty - 1) s.index++;
    return showQuestion(ctx);
  });

  bot.action("test_prev", async (ctx) => {
    ensureSession(ctx);

    const s = ctx.session.currentTest;
    if (!s) return;

    if (s.index > 0) s.index--;
    return showQuestion(ctx);
  });

  bot.action("test_flip", async (ctx) => {
    ensureSession(ctx);
    await safeCall(ctx.answerCbQuery(), "test.flip");

    const state = ctx.session.currentTest;
    if (!state) return;

    const { testId, index } = state;

    const q = db
      .prepare("SELECT * FROM test_questions WHERE testId = ? LIMIT 1 OFFSET ?")
      .get(testId, index);

    const kb = questionKeyboard();

    const showingBack = !!state.showingBack;

    if (!showingBack) {
      // сейчас была FRONT, показываем BACK
      if (q.backImageId) {
        await safeCall(
          ctx.editMessageMedia(
            {
              type: "photo",
              media: q.backImageId,
              caption: `🔄 Обратная сторона\n\n${q.backText || "—"}`,
            },
            kb
          ),
          "test.flip.toBack.image"
        );
      } else {
        await safeCall(
          ctx.editMessageText(
            `🔄 Обратная сторона:\n\n${q.backText || "—"}`,
            kb
          ),
          "test.flip.toBack.text"
        );
      }
      state.showingBack = true;
    } else {
      // сейчас BACK, возвращаем FRONT
      if (q.frontImageId) {
        await safeCall(
          ctx.editMessageMedia(
            {
              type: "photo",
              media: q.frontImageId,
              caption: `❓ Вопрос ${index + 1}\n\n${q.frontText || "—"}`,
            },
            kb
          ),
          "test.flip.toFront.image"
        );
      } else {
        await safeCall(
          ctx.editMessageText(
            `❓ Вопрос ${index + 1}\n\n${q.frontText || "—"}`,
            kb
          ),
          "test.flip.toFront.text"
        );
      }
      state.showingBack = false;
    }
  });

  // ==========================
  // УДАЛЕНИЕ ВОПРОСА
  // ==========================
  bot.action("test_delete_question", async (ctx) => {
    ensureSession(ctx);
    await safeCall(ctx.answerCbQuery(), "question.delete.ask");

    await safeCall(
      ctx.editMessageReplyMarkup({
        inline_keyboard: [
          [
            {
              text: "❌ Да, удалить вопрос",
              callback_data: "test_delete_question_confirm",
            },
          ],
          [{ text: "Отмена", callback_data: "test_flip" }],
        ],
      }),
      "question.delete.confirmAsk"
    );
  });

  bot.action("test_delete_question_confirm", async (ctx) => {
    ensureSession(ctx);
    await safeCall(ctx.answerCbQuery(), "question.delete.confirm");

    const state = ctx.session.currentTest;
    if (!state) return;

    const { testId, index } = state;

    const q = db
      .prepare(
        "SELECT id FROM test_questions WHERE testId = ? LIMIT 1 OFFSET ?"
      )
      .get(testId, index);

    if (!q) return;

    db.prepare("DELETE FROM test_questions WHERE id = ?").run(q.id);

    const remaining = db
      .prepare("SELECT COUNT(*) AS c FROM test_questions WHERE testId = ?")
      .get(testId).c;

    // если вопросов не осталось → выходим к списку тестов
    if (remaining === 0) {
      delete ctx.session.currentTest;

      const tests = db.prepare("SELECT * FROM tests").all();
      const keyboard = tests.map((t) => [
        { text: t.title, callback_data: `test_open_${t.id}` },
      ]);
      keyboard.push([{ text: "Назад", callback_data: "admin_materials" }]);

      await safeCall(
        ctx.editMessageText("Все вопросы удалены. Выберите тест:", {
          reply_markup: { inline_keyboard: keyboard },
        }),
        "question.delete.emptyBack"
      );

      return;
    }

    // корректируем индекс
    if (index >= remaining) state.index = remaining - 1;

    await showQuestion(ctx);
  });

  bot.action("test_back", async (ctx) => {
    ensureSession(ctx);
    await safeCall(ctx.answerCbQuery(), "test.back");

    ctx.session.currentTest = null;

    const tests = db.prepare("SELECT * FROM tests").all();

    const keyboard = tests.map((t) => [
      { text: t.title, callback_data: `test_open_${t.id}` },
    ]);
    keyboard.push([{ text: "Назад", callback_data: "admin_materials" }]);

    try {
      await ctx.deleteMessage();
    } catch (e) {
      console.log("deleteMessage failed, falling back to edit", e.description);
    }

    // 2️⃣ отправляем новое сообщение
    await safeCall(
      ctx.telegram.sendMessage(ctx.chat.id, "Выберите тест:", {
        reply_markup: { inline_keyboard: keyboard },
      }),
      "test.back.showList"
    );
  });

  bot.action("test_add_question", async (ctx) => {
    ensureSession(ctx);
    await safeCall(ctx.answerCbQuery(), "test.addQuestionExisting");

    const state = ctx.session.currentTest;
    if (!state) return;

    // используем ID текущего теста
    ctx.session.testId = state.testId;

    ctx.session.addingQuestion = true;

    ctx.session.expectingFrontText = true;
    ctx.session.expectingFrontImage = false;
    ctx.session.expectingBackText = false; 
    ctx.session.expectingBackImage = false;

    ctx.session.frontText = null;
    ctx.session.backText = null;
    ctx.session.frontImageId = null;
    ctx.session.backImageId = null;

    await safeCall(
      ctx.reply("Введите текст FRONT для нового вопроса:"),
      "test.addQuestionExisting.askFront"
    );
  });

  // ==========================
  // УДАЛЕНИЕ ТЕСТА (Шаг 1 — вопрос пользователю)
  // ==========================
  bot.action(/^test_delete_(\d+)$/, async (ctx) => {
    ensureSession(ctx);
    await safeCall(ctx.answerCbQuery(), "test.delete.ask");

    const testId = Number(ctx.match[1]);

    await safeCall(
      ctx.editMessageReplyMarkup({
        inline_keyboard: [
          [
            {
              text: "❌ Да, удалить тест",
              callback_data: `test_delete_confirm_${testId}`,
            },
          ],
          [{ text: "Отмена", callback_data: "admin_list_tests" }],
        ],
      }),
      "test.delete.askButtons"
    );
  });

  // ==========================
  // УДАЛЕНИЕ ТЕСТА (Шаг 2 — подтверждение + удаление)
  // ==========================
  bot.action(/^test_delete_confirm_(\d+)$/, async (ctx) => {
    ensureSession(ctx);
    await safeCall(ctx.answerCbQuery(), "test.delete.confirm");

    const testId = Number(ctx.match[1]);

    // удаляем вопросы
    db.prepare("DELETE FROM test_questions WHERE testId = ?").run(testId);

    // удаляем сам тест
    db.prepare("DELETE FROM tests WHERE id = ?").run(testId);

    // получаем обновлённый список тестов
    const tests = db.prepare("SELECT * FROM tests").all();

    const keyboard = tests.map((t) => [
      { text: t.title, callback_data: `test_open_${t.id}` },
      { text: "🗑 Удалить", callback_data: `test_delete_${t.id}` },
    ]);
    keyboard.push([{ text: "Назад", callback_data: "admin_materials" }]);

    await safeCall(
      ctx.editMessageText("Тест удалён. Выберите тест:", {
        reply_markup: { inline_keyboard: keyboard },
      }),
      "test.delete.finish"
    );
  });

  // ========================
  // HELPERS
  // ========================

  async function saveQuestion(ctx) {
    const { testId, frontText, frontImageId, backText, backImageId } =
      ctx.session;

    db.prepare(
      `INSERT INTO test_questions 
       (testId, frontText, frontImageId, backText, backImageId)
       VALUES (?, ?, ?, ?, ?)`
    ).run(testId, frontText, frontImageId, backText, backImageId);

    ctx.session.addingQuestion = false;

    await safeCall(
      ctx.reply("Вопрос добавлен!", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Добавить ещё ➕", callback_data: "admin_add_question" }],
            [{ text: "Готово", callback_data: "admin_materials" }],
          ],
        },
      }),
      "materials.question.saved"
    );
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
          [
            {
              text: "➕ Добавить вопрос к тесту",
              callback_data: "test_add_question",
            },
          ],
          [{ text: "🗑 Удалить вопрос", callback_data: "test_delete_question" }],
          [{ text: "↩️ Назад", callback_data: "test_back" }],
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

    const kb = questionKeyboard();

    // если есть картинка фронта — показываем через editMessageMedia
    if (q.frontImageId) {
      await safeCall(
        ctx.editMessageMedia(
          {
            type: "photo",
            media: q.frontImageId,
            caption: `❓ Вопрос ${index + 1}\n\n${q.frontText}`,
          },
          kb
        ),
        "test.show.image"
      );
      return;
    }

    // иначе обычный текст
    await safeCall(
      ctx.editMessageText(`❓ Вопрос ${index + 1}\n\n${q.frontText}`, kb),
      "test.show.text"
    );
  }
}
