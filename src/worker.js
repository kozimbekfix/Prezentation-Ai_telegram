import { Worker } from 'bullmq';
import { Telegraf } from 'telegraf';
import Redis from 'ioredis';
import os from 'os';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

import { PresentationAIPipeline } from './ai/pipeline.js';
import { PresentationEngine } from './engine/pptx/index.js';

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

console.log("[Worker] Background worker ishga tushdi va navbatni kutmoqda...");

const worker = new Worker('presentation-queue', async (job) => {
  const { chatId, prompt } = job.data;
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  let pptxPath = null;

  try {
    // 1. Foydalanuvchiga xabar berish
    await bot.telegram.sendMessage(chatId, "✨ AI mavzu ustida ishlayapti va ma'lumotlarni to'playapti...");

    // 2. AI Pipeline ishga tushadi (Planner, Writer, Visual, Images)
    const pipeline = new PresentationAIPipeline();
    const aiResult = await pipeline.generateFullPresentation(prompt);

    if (!aiResult.isSuccess) {
      throw new Error(aiResult.error);
    }

    await bot.telegram.sendMessage(chatId, "🎨 Slaydlar dizayni shakllantirilib, PowerPoint faylga yig'ilmoqda...");

    // 3. PPTX Engine orqali fayl yasash
    const engine = new PresentationEngine();
    pptxPath = await engine.createPresentation(aiResult.data, uniqueId);

    // 4. Tayyor faylni Telegram orqali foydalanuvchiga yuborish
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
    // Vaqtinchalik faylni xotiradan tozalash
    if (pptxPath && fs.existsSync(pptxPath)) {
      try { fs.unlinkSync(pptxPath); } catch (e) {}
    }
  }
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`[Job Failed] ID: ${job.id}, Error:`, err);
});