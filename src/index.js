import { Telegraf, Markup } from 'telegraf';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import express from 'express';
import dotenv from 'dotenv';

import { PresentationAIPipeline } from './ai/pipeline.js';
import { PresentationEngine } from './engine/pptx/index.js';
import { convertToPdf, cleanupTempFiles } from './engine/pdfEngine.js';
import os from 'os';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

// BullMQ navbatini yaratamiz
const presentationQueue = new Queue('presentation-queue', { connection });

// Til tanlanishini kutayotgan mavzular: userId -> mavzu matni.
// Foydalanuvchi mavzuni yozgach, tilni tanlagunicha shu yerda saqlanadi.
const pendingTopics = new Map();

// --- WORKER QISMI (Navbatdagi vazifalarni bajaruvchi) ---
console.log("[Worker] Background worker ishga tushdi va navbatni kutmoqda...");

const worker = new Worker('presentation-queue', async (job) => {
  const { chatId, prompt, language } = job.data;
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  let pptxPath = null;
  let pdfPath = null;

  try {
    await bot.telegram.sendMessage(chatId, "✨ AI mavzu ustida ishlayapti va ma'lumotlarni to'playapti...");

    const pipeline = new PresentationAIPipeline();
    const aiResult = await pipeline.generateFullPresentation(prompt, language);

    if (!aiResult.isSuccess) {
      throw new Error(aiResult.error);
    }

    await bot.telegram.sendMessage(chatId, "🎨 Slaydlar dizayni shakllantirilib, PowerPoint faylga yig'ilmoqda...");

    const engine = new PresentationEngine();
    pptxPath = await engine.createPresentation(aiResult.data, uniqueId);

    const safeName = prompt.substring(0, 20).replace(/\s+/g, '_');

    await bot.telegram.sendDocument(chatId, {
      source: pptxPath,
      filename: `${safeName}_presentation.pptx`
    }, {
      caption: "✅ Mana sizning professional taqdimotingiz tayyor!"
    });

    // PDF versiyasini ham yasashga harakat qilamiz. Bu qadam ixtiyoriy —
    // agar LibreOffice biror sababdan ishlamasa (masalan konteynerda
    // topilmasa yoki 15s timeout'ga uchrasa), foydalanuvchi baribir
    // yuqoridagi .pptx faylni allaqachon olgan bo'ladi, shuning uchun
    // xatoni yutib, faqat log qoldiramiz — jarayonni to'xtatmaymiz.
    try {
      await bot.telegram.sendMessage(chatId, "📄 PDF versiyasi tayyorlanmoqda...");
      pdfPath = await convertToPdf(pptxPath, os.tmpdir());
      await bot.telegram.sendDocument(chatId, {
        source: pdfPath,
        filename: `${safeName}_presentation.pdf`
      }, {
        caption: "📄 PDF versiyasi ham tayyor!"
      });
    } catch (pdfError) {
      console.error("[PDF Export Warning]", pdfError.message);
      // PDF muvaffaqiyatsiz bo'lsa ham botni qulatmaymiz — pptx allaqachon yuborilgan.
    }

  } catch (error) {
    console.error("[Worker Error]", error);
    await bot.telegram.sendMessage(chatId, `❌ Xatolik yuz berdi: ${error.message}`);
  } finally {
    await cleanupTempFiles([pptxPath, pdfPath]);
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

// Har qanday matnli xabarni mavzu sifatida qabul qilamiz -> til tanlashni so'raymiz
bot.on('text', async (ctx) => {
  const prompt = ctx.message.text;
  const userId = ctx.from.id;

  if (prompt.startsWith('/')) return;

  pendingTopics.set(userId, prompt);

  await ctx.reply(
    `Mavzu: "${prompt}"\n\nQaysi tilda tayyorlaymiz?`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('🇷🇺 Русский', 'lang_ru'),
        Markup.button.callback("🇺🇿 O'zbekcha", 'lang_uz'),
      ],
    ])
  );
});

// Til tanlangach — navbatga qo'shamiz
bot.action(/^lang_(ru|uz)$/, async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const language = ctx.match[1];
  const prompt = pendingTopics.get(userId);

  await ctx.answerCbQuery();

  if (!prompt) {
    return ctx.reply('Sessiya eskirdi, mavzuni qayta yozing.');
  }

  pendingTopics.delete(userId);

  const languageLabel = language === 'uz' ? "O'zbekcha" : 'Русский';
  await ctx.editMessageText(`Mavzu: "${prompt}"\nTil: ${languageLabel} ✅`);

  try {
    await ctx.reply(`🚀 "${prompt}" mavzusi bo'yicha navbatga qo'shildi. Iltimos, biroz kuting...`);

    await presentationQueue.add('generate-presentation', {
      chatId,
      prompt,
      language,
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
// dropPendingUpdates: eski/qolib ketgan getUpdates so'rovlarini tozalab,
// 409 Conflict xavfini kamaytiradi (ayniqsa deploy paytida eski va yangi
// container bir lahzaga bir-biriga to'qnashganda).
let botLaunched = false;

bot.launch({ dropPendingUpdates: true }).then(() => {
  botLaunched = true;
  console.log("[Telegram Bot] Muvaffaqiyatli ulandi va ishga tushdi!");
}).catch((err) => {
  console.error("[Telegram Bot] Ishga tushmadi:", err.message);
});

// Bot hali ishga tushmasdan SIGINT/SIGTERM kelsa, bot.stop() chaqirilganda
// Telegraf "Bot is not running!" deb xato tashlab, process qulab tushardi.
// Shuning uchun faqat botLaunched=true bo'lsagina to'xtatamiz.
const shutdown = (signal) => {
  console.log(`[Process] ${signal} qabul qilindi, to'xtatilmoqda...`);
  if (botLaunched) {
    bot.stop(signal);
  }
  process.exit(0);
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));