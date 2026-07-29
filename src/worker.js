import 'dotenv/config';
import { Worker } from 'bullmq';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { Telegraf } from 'telegraf';
import { generatePresentationData } from './ai/pipeline.js';
import { createPresentation } from './engine/pptx/index.js';
import { convertToPdf, cleanupTempFiles } from './engine/pdfEngine.js';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Redis URL ni ioredis tushunadigan formatga o'tkazish
import Redis from 'ioredis';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

console.log("[Worker] Background worker ishga tushdi va navbatni kutmoqda...");

const worker = new Worker('presentation-queue', async (job) => {
  const { chatId, prompt } = job.data;
  const tempDir = os.tmpdir();
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const pptxPath = path.join(tempDir, `presentation_${uniqueId}.pptx`);
  let pdfPath = null;

  try {
    // 1. Foydalanuvchiga xabar berish
    await bot.telegram.sendMessage(chatId, "✨ AI mavzu ustida ishlayapti va ma'lumotlarni to'playapti...");

    // 2. Gemini AI orqali strukturani olish
    const aiData = await generatePresentationData(prompt);

    await bot.telegram.sendMessage(chatId, "🎨 Slaydlar dizayni shakllantirilmoqda va rasmlar yuklanmoqda...");

    // 3. PPTX yaratish
    await createPresentation(aiData, pptxPath);

    await bot.telegram.sendMessage(chatId, "📄 Hujjat PDF formatiga o'girilmoqda...");

    // 4. LibreOffice yordamida PDF ga o'girish
    pdfPath = await convertToPdf(pptxPath, tempDir);

    // 5. Tayyor PDF faylni Telegram orqali yuborish
    await bot.telegram.sendDocument(chatId, {
      source: pdfPath,
      filename: `${prompt.slice(0, 25).replace(/[^a-zA-Z0-9]/g, '_')}_presentation.pdf`
    }, {
      caption: `✅ Sizning "${prompt}" mavzusidagi prezentatsiyangiz tayyor!`
    });

  } catch (error) {
    console.error(`[Job Error] ${chatId} uchun xatolik:`, error);
    await bot.telegram.sendMessage(chatId, `❌ Xatolik yuz berdi: ${error.message}`);
  } finally {
    // 6. Xotirani tozalash (Garbage Collection)
    await cleanupTempFiles([pptxPath, pdfPath]);
  }
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`[Worker Failed] Job ID ${job.id} xato bilan tugadi:`, err.message);
});