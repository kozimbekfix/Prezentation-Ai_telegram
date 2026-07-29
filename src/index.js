import { Telegraf } from 'telegraf';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

// BullMQ navbatini yaratamiz
const presentationQueue = new Queue('presentation-queue', { connection });

// /start komandasi
bot.start((ctx) => {
  ctx.reply("Assalomu alaykum! Prezo-AI botiga xush kelibsiz. Menga istalgan mavzuni yuboring, men sizga 6 ta slayddan iborat professional PowerPoint taqdimot tayyorlab beraman.");
});

// Har qanday matnli xabarni qabul qilish
bot.on('text', async (ctx) => {
  const prompt = ctx.message.text;
  const chatId = ctx.chat.id;

  if (prompt.startsWith('/')) return; // Komandalarni e'tiborsiz qoldirish

  await ctx.reply(`🚀 "${prompt}" mavzusi bo'yicha navbatga qo'shildi. Iltimos, biroz kuting...`);

  // Navbatga ish qo'shish
  await presentationQueue.add('generate-presentation', {
    chatId,
    prompt
  });
});

// Express server (Render/Health-check uchun)
app.get('/', (req, res) => {
  res.send('Prezo-AI Bot Server is running!');
});

app.listen(PORT, () => {
  console.log(`[Server] Web server ${PORT}-portda ishga tushdi.`);
});

// Botni ishga tushirish (Polling)
bot.launch().then(() => {
  console.log("[Telegram Bot] Muvaffaqiyatli ulandi va ishga tushdi!");
});

// Dastur to'xtaganda ulanishlarni yopish
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));