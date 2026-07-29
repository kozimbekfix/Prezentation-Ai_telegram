// index.js
// Точка входа: инициализация Telegram-бота и обработка сценария
// "/start -> тема -> генерация -> отправка файла".

require('dotenv').config();

const { Telegraf } = require('telegraf');
const { generatePresentationStructure } = require('./presentation-AI');
const { buildPptx, cleanupFile } = require('./presentation');
const { convertToPdf } = require('./pdf');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('Ошибка: не задан BOT_TOKEN в .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Простое множество для защиты от повторных запросов от одного
// пользователя, пока предыдущая генерация ещё не завершилась.
const usersInProgress = new Set();

bot.start((ctx) => {
  ctx.reply(
    'Привет! Я создаю презентации (.pptx) по любой теме с помощью ИИ.\n\n' +
    'Просто напиши тему презентации, например:\n' +
    '«История искусственного интеллекта»'
  );
});

bot.help((ctx) => {
  ctx.reply('Напиши тему презентации текстом — я сгенерирую .pptx файл и пришлю его сюда же.');
});

// Обрабатываем любое текстовое сообщение как тему презентации
// (кроме команд, которые начинаются с "/").
bot.on('text', async (ctx) => {
  const topic = ctx.message.text.trim();

  if (topic.startsWith('/')) {
    return; // неизвестная команда — игнорируем
  }

  if (!topic) {
    return ctx.reply('Пожалуйста, напиши тему презентации текстом.');
  }

  const userId = ctx.from.id;
  if (usersInProgress.has(userId)) {
    return ctx.reply('Подожди, предыдущая презентация ещё генерируется 🙂');
  }

  usersInProgress.add(userId);
  let pptxPath = null;
  let pdfPath = null;

  try {
    const statusMsg = await ctx.reply('Генерирую структуру презентации...');

    const structure = await generatePresentationStructure(topic);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      undefined,
      'Структура готова, собираю .pptx файл...'
    );

    pptxPath = await buildPptx(structure);

    await ctx.replyWithDocument(
      { source: pptxPath, filename: `${structure.title}.pptx` },
      { caption: 'Ваша презентация готова (PPTX)!' }
    );

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      undefined,
      'Готовлю PDF-версию...'
    );

    try {
      pdfPath = await convertToPdf(pptxPath);
      await ctx.replyWithDocument(
        { source: pdfPath, filename: `${structure.title}.pdf` },
        { caption: 'И PDF-версия 📄' }
      );
    } catch (pdfErr) {
      // PDF — не критичная часть сценария: если конвертация не удалась,
      // пользователь уже получил .pptx, поэтому просто логируем ошибку.
      console.error('Ошибка конвертации в PDF:', pdfErr);
    }

    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
  } catch (err) {
    console.error('Ошибка при генерации презентации:', err);
    await ctx.reply(
      'Что-то пошло не так при генерации презентации 😔\n' +
      'Попробуй ещё раз чуть позже или с другой темой.'
    );
  } finally {
    usersInProgress.delete(userId);
    if (pptxPath) cleanupFile(pptxPath);
    if (pdfPath) cleanupFile(pdfPath);
  }
});

bot.catch((err, ctx) => {
  console.error(`Необработанная ошибка для ${ctx.updateType}`, err);
});

bot.launch();
console.log('Бот запущен...');

// Render Web Service требует открытый HTTP-порт, иначе деплой
// зависает в статусе "In Progress". Этот же эндпоинт удобно
// использовать для keep-alive пинга (cron-job.org и т.п.).
const http = require('http');
const PORT = process.env.PORT || 3000;

http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Бот работает');
  })
  .listen(PORT, () => {
    console.log(`HTTP-сервер слушает порт ${PORT}`);
  });

// Корректное завершение работы
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
