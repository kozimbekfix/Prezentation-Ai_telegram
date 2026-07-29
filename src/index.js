import { Telegraf } from 'telegraf';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';

import { PresentationAIPipeline } from './ai/pipeline.js';
import { PresentationEngine } from './engine/pptx/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

// BullMQ navbatini yaratamiz
const presentationQueue = new Queue('presentation-queue', { connection });

// --- WORKER QISMI (Navbatdagi vazifalarni bajaruvchi) ---
console.log("[Worker] Background worker ishga tushdi va navbatni kutmoqda...");

const worker = new Worker('presentation-queue', async (job) => {
  const { chatId, prompt } = job.data;
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  let pptxPath = null;

  try {
    await bot.telegram.sendMessage(chatId, "✨ AI mavzu ustida ishlayapti va ma'lumotlarni to'playapti...");

    const pipeline = new PresentationAIPipeline();
    const aiResult = await pipeline.generateFullPresentation(prompt);

    if (!aiResult.isSuccess) {
      throw new Error(aiResult.error);
    }

    await bot.telegram.sendMessage(chatId, "🎨 Slaydlar dizayni shakllantirilib, PowerPoint faylga yig'ilmoqda...");

    const engine = new PresentationEngine();
    pptxPath = await engine.createPresentation(aiResult.data, uniqueId);

    await bot.telegram.sendDocument(chatId, {
      source: pptxPath,
      filename: `${prompt.substring(0, 20).replace(/\s+/g, '_')}_presentation.pptx`
    }, {
      caption: "✅ Mana sizning professional taqdimotingiz tayyor!"
    });

  } catch (error) {
    console.error("[Worker Error]", error);
    await bot.telegram.sendMessage(chatId, `❌ Xatolik yuz berdi: ${error.message}`);
  } finally {
    if (pptxPath && fs.existsSync(pptxPath)) {
      try { fs.unlinkSync(pptxPath); } catch (e) {}
    }
  }
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`[Job Failed] ID: ${job.id}, Error:`, err);
});
// ----------------------------------------------------

// /start komandasi
bot.start((ctx) => {
  ctx.reply("Assalomu alaykum! Prezo-AI botiga xush kelibsiz. Menga istalgan mavzuni yuboring, men sizga 6 ta slayddan iborat professional PowerPoint taqdimot tayyorlab beraman.");
});

// Har qanday matnli xabarni qabul qilish
bot.on('text', async (ctx) => {
  const prompt = ctx.message.text;
  const chatId = ctx.chat.id;

  if (prompt.startsWith('/')) return;

  try {
    await ctx.reply(`🚀 "${prompt}" mavzusi bo'yicha navbatga qo'shildi. Iltimos, biroz kuting...`);

    await presentationQueue.add('generate-presentation', {
      chatId,
      prompt
    });

  } catch (error) {
    console.error("Navbatga qo'shishda xatolik:", error);
    await ctx.reply("❌ Kechirasiz, so'rovni qabul qilishda xatolik yuz berdi.");
  }
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

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));