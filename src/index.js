import 'dotenv/config';
import { Telegraf } from 'telegraf';
import express from 'express';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN topilmadi!");
  process.exit(1);
}

const bot = new Telegraf(token);
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

// BullMQ Navbatini ulash
const presentationQueue = new Queue('presentation-queue', { connection });

// 1. Render Health Check uchun oddiy marshrut
app.get('/', (req, res) => {
  res.status(200).send('AI Presentation Bot is running successfully!');
});

// 2. Telegram Bot Buyruqlari
bot.start((ctx) => {
  ctx.reply(
    "Assalomu alaykum! 🤖 AI Prezentatsiya botiga xush kelibsiz.\n\n" +
    "Menga xohlagan mavzuni yozib yuboring (masalan: *Sun'iy intellekt kelajagi* yoki *Marketing strategiyalari*), men siz uchun professional PDF prezentatsiya tayyorlab beraman!"
  );
});

bot.on('text', async (ctx) => {
  const prompt = ctx.message.text.trim();
  
  if (prompt.length < 3) {
    return ctx.reply("Iltimos, mavzuni biroz batafsilroq yozing.");
  }

  const chatId = ctx.chat.id;
  await ctx.reply("⏳ Sizning so'rovingiz navbatga qo'shildi. Tez orada tayyor bo'ladi...");

  // Navbatga qo'shish
  await presentationQueue.add('generate-presentation', { chatId, prompt });
});

// Botni ishga tushirish
bot.launch().then(() => {
  console.log("[Telegram Bot] Muvaffaqiyatli ishga tushdi!");
});

// Express serverni ochish (Render talabi)
app.listen(PORT, () => {
  console.log(`[HTTP Server] Port ${PORT} da ishlamoqda.`);
});

// Xavfsiz to'xtatish
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));