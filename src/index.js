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

// --- TELEGRAM BOT: POLLING O'RNIGA WEBHOOK ---
// Nima uchun: Render'da bir nechta konteyner (eski + yangi) bir lahzaga
// bir-biriga to'qnashganda (deploy payti) yoki eski instance to'liq
// o'chib ulgurmasdan getUpdates chaqirilganda, Telegram ikkinchi
// so'rovchini "409: Conflict" bilan rad etadi — chunki bitta bot tokeniga
// bir vaqtning o'zida faqat BITTA getUpdates (polling) mijozi ega bo'lishi
// mumkin. Webhook rejimida esa polling umuman yo'q: Telegram o'zi bizning
// URL'imizga POST so'rov yuboradi, shuning uchun bir nechta konteyner
// bir lahzaga tirik bo'lib qolsa ham konflikt yuzaga kelmaydi.
const WEBHOOK_PATH = `/telegram-webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
// Render web-service'lar uchun bu o'zgaruvchini avtomatik o'zi beradi
// (masalan https://prezentation-ai-telegram-2.onrender.com)
const PUBLIC_URL = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;

app.use(bot.webhookCallback(WEBHOOK_PATH));

app.listen(PORT, async () => {
  console.log(`[Server] Web server ${PORT}-portda ishga tushdi.`);

  if (!PUBLIC_URL) {
    console.error(
      "[Telegram Bot] PUBLIC_URL/RENDER_EXTERNAL_URL topilmadi — webhook o'rnatib bo'lmadi. " +
      "Lokal muhitda ishlayotgan bo'lsangiz, ngrok kabi tunnel orqali PUBLIC_URL'ni .env'ga qo'shing."
    );
    return;
  }

  try {
    // setWebhook — idempotent chaqiruv: bir nechta konteyner bir vaqtda
    // shu funksiyani chaqirsa ham hech qanday konflikt bo'lmaydi (409
    // yo'q), chunki bu shunchaki "qayerga POST yubor" degan sozlama,
    // polling kabi "session egallash" emas.
    await bot.telegram.setWebhook(`${PUBLIC_URL}${WEBHOOK_PATH}`);
    console.log(`[Telegram Bot] Webhook o'rnatildi: ${PUBLIC_URL}${WEBHOOK_PATH}`);
  } catch (err) {
    console.error("[Telegram Bot] Webhook o'rnatishda xatolik:", err.message);
  }
});

// Graceful shutdown — webhook rejimida bot.stop() shart emas (polling yo'q),
// faqat process'ni to'g'ri yopamiz.
const shutdown = (signal) => {
  console.log(`[Process] ${signal} qabul qilindi, to'xtatilmoqda...`);
  process.exit(0);
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));