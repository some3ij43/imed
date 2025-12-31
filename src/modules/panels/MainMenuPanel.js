import { Markup } from "telegraf";

export const mainMenuPanel = Markup.inlineKeyboard([
  [Markup.button.callback("🧪 Тесты", "tests")],
  [Markup.button.callback("⚜️ Подписка", "open_subscription")],
  [
    Markup.button.callback("Демо-версия 📚", "demo"),
    Markup.button.callback("Отзывы ☁️", "reviews"),
  ],
  [
    Markup.button.callback("Тех. Поддержка ⚒️", "support"),
    Markup.button.callback("Telegram-канал 💅", "channel"),
  ],
]);