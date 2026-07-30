import { Telegraf, Markup } from 'telegraf';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import express from 'express';
import dotenv from 'dotenv';

import { PresentationAIPipeline } from './ai/pipeline.js';
import { PresentationEngine } from './engine/pptx/index.js';
import { ReferatEngine } from './engine/docx/referatEngine.js';
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

// Foydalanuvchining joriy so'rov holati: userId -> { prompt, type, pages }.
// Mavzu yozilgach to'ldirila boshlaydi, til tanlangach navbatga qo'shilib
// tozalanadi. type: "presentation" | "referat", pages faqat referat uchun.
const pendingSessions = new Map();

// Xatoning texnik tafsilotlarini konsolga yozamiz (debug uchun), lekin
// foydalanuvchiga har doim tushunarli, sodda xabar ko'rsatamiz — u
// "status: 429" yoki stack trace kabi narsalarni ko'rishi shart emas.
function friendlyErrorMessage(error) {
  const status = error?.status || error?.response?.status;

  if (status === 429 || status === 503) {
    return (
      '⏳ Serverda vaqtinchalik yuklama yuzaga keldi.\n' +
      'Iltimos, 1 daqiqadan keyin qayta urinib ko\'ring — bu vaqt ichida ' +
      'tizim avtomatik tiklanadi, hech narsa qo\'lda o\'zgartirish shart emas.'
    );
  }

  return (
    '❌ Serverda kutilmagan xatolik yuz berdi.\n' +
    'Iltimos, 1 daqiqadan keyin qayta urinib ko\'ring. Muammo davom etsa, ' +
    'boshqa mavzu bilan sinab ko\'ring.'
  );
}

// --- WORKER QISMI (Navbatdagi vazifalarni bajaruvchi) ---
console.log("[Worker] Background worker ishga tushdi va navbatni kutmoqda...");

const worker = new Worker('presentation-queue', async (job) => {
  const { chatId, prompt, language, type, pages } = job.data;

  if (type === 'referat') {
    await processReferatJob({ chatId, prompt, language, pages });
  } else {
    await processPresentationJob({ chatId, prompt, language });
  }
}, { connection });

async function processPresentationJob({ chatId, prompt, language }) {
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

    await bot.telegram.sendMessage(chatId, 'Yana biror narsa kerakmi?', MODE_KEYBOARD);

  } catch (error) {
    console.error("[Worker Error]", error);
    await bot.telegram.sendMessage(chatId, friendlyErrorMessage(error), MODE_KEYBOARD);
  } finally {
    await cleanupTempFiles([pptxPath, pdfPath]);
  }
}

async function processReferatJob({ chatId, prompt, language, pages }) {
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  let docxPath = null;
  let pdfPath = null;

  try {
    await bot.telegram.sendMessage(chatId, "✨ AI mavzu bo'yicha referat matnini yozib chiqmoqda...");

    const pipeline = new PresentationAIPipeline();
    const aiResult = await pipeline.generateReferat(prompt, language, pages);

    if (!aiResult.isSuccess) {
      throw new Error(aiResult.error);
    }

    await bot.telegram.sendMessage(chatId, "📝 Matn Word (.docx) faylga formatlanmoqda...");

    const engine = new ReferatEngine();
    docxPath = await engine.createReferat(aiResult.data.content, language, uniqueId);

    const safeName = prompt.substring(0, 20).replace(/\s+/g, '_');

    await bot.telegram.sendDocument(chatId, {
      source: docxPath,
      filename: `${safeName}_referat.docx`
    }, {
      caption: `✅ Referatingiz tayyor! (~${pages} bet)`
    });

    // PDF versiyasi ham ixtiyoriy — muvaffaqiyatsiz bo'lsa docx baribir yuborilgan.
    try {
      await bot.telegram.sendMessage(chatId, "📄 PDF versiyasi tayyorlanmoqda...");
      pdfPath = await convertToPdf(docxPath, os.tmpdir());
      await bot.telegram.sendDocument(chatId, {
        source: pdfPath,
        filename: `${safeName}_referat.pdf`
      }, {
        caption: "📄 PDF versiyasi ham tayyor!"
      });
    } catch (pdfError) {
      console.error("[PDF Export Warning]", pdfError.message);
    }

    await bot.telegram.sendMessage(chatId, 'Yana biror narsa kerakmi?', MODE_KEYBOARD);

  } catch (error) {
    console.error("[Worker Error/Referat]", error);
    await bot.telegram.sendMessage(chatId, friendlyErrorMessage(error), MODE_KEYBOARD);
  } finally {
    await cleanupTempFiles([docxPath, pdfPath]);
  }
}

worker.on('failed', (job, err) => {
  console.error(`[Job Failed] ID: ${job.id}, Error:`, err);
});
// ----------------------------------------------------

// Doimiy pastki klaviatura — har doim ekranning pastida turadi, foydalanuvchi
// har safar qayta so'ralmasdan turini tanlab qo'ya oladi.
const MODE_KEYBOARD = Markup.keyboard([
  ['📊 Prezentatsiya', '📄 Referat'],
]).resize();

const PRESENTATION_LABEL = '📊 Prezentatsiya';
const REFERAT_LABEL = '📄 Referat';

// /start komandasi
bot.start((ctx) => {
  ctx.reply(
    "Salom! 👋 Men Prezo-AI botiman.\n\n" +
    "Sizga bir necha soniyada tayyor material yasab beraman:\n" +
    "📊 *Prezentatsiya* — 6 ta professional slaydli PowerPoint (.pptx va .pdf)\n" +
    "📄 *Referat* — 1–5 betlik tayyor matn (Word va PDF)\n\n" +
    "Pastdagi tugmalardan birini tanlang, so'ng mavzuni yozing.",
    { parse_mode: 'Markdown', ...MODE_KEYBOARD }
  );
});

// Doimiy klaviatura tugmalari bosilganda — turini eslab qolamiz va
// mavzuni yozishni so'raymiz (qo'shimcha savol-javobsiz).
bot.hears(PRESENTATION_LABEL, async (ctx) => {
  const userId = ctx.from.id;
  pendingSessions.set(userId, { ...(pendingSessions.get(userId) || {}), type: 'presentation' });
  await ctx.reply('📊 Prezentatsiya tanlandi. Endi mavzuni yozing:');
});

bot.hears(REFERAT_LABEL, async (ctx) => {
  const userId = ctx.from.id;
  pendingSessions.set(userId, { ...(pendingSessions.get(userId) || {}), type: 'referat' });
  await ctx.reply('📄 Referat tanlandi. Endi mavzuni yozing:');
});

// Har qanday matnli xabarni mavzu sifatida qabul qilamiz. Agar tur
// (prezentatsiya/referat) doimiy tugma orqali oldindan tanlangan bo'lsa,
// qo'shimcha savolsiz to'g'ridan-to'g'ri keyingi qadamga o'tamiz.
bot.on('text', async (ctx) => {
  const prompt = ctx.message.text;
  const userId = ctx.from.id;

  if (prompt.startsWith('/')) return;
  if (prompt === PRESENTATION_LABEL || prompt === REFERAT_LABEL) return; // yuqorida bot.hears orqali ishlangan

  const existing = pendingSessions.get(userId);
  const preselectedType = existing?.type;

  pendingSessions.set(userId, { prompt, type: preselectedType });

  if (preselectedType === 'referat') {
    await ctx.reply(
      `Mavzu: "${prompt}"\nTur: Referat 📄\n\nNecha bet hajmida bo'lsin?`,
      Markup.inlineKeyboard([
        [1, 2, 3, 4, 5].map((n) => Markup.button.callback(`${n}`, `pages_${n}`)),
      ])
    );
    return;
  }

  if (preselectedType === 'presentation') {
    await ctx.reply(`Mavzu: "${prompt}"\nTur: Prezentatsiya 📊`);
    await askLanguage(ctx);
    return;
  }

  // Tur tanlanmagan bo'lsa — avvalgidek so'raymiz.
  await ctx.reply(
    `Mavzu: "${prompt}"\n\nNimani tayyorlaymiz?`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 Prezentatsiya', 'type_presentation'),
        Markup.button.callback('📄 Referat', 'type_referat'),
      ],
    ])
  );
});

// Prezentatsiya tanlansa — to'g'ridan-to'g'ri til tanlashga o'tamiz.
bot.action('type_presentation', async (ctx) => {
  const userId = ctx.from.id;
  const session = pendingSessions.get(userId);

  await ctx.answerCbQuery();

  if (!session) {
    return ctx.reply('Sessiya eskirdi, mavzuni qayta yozing.');
  }

  session.type = 'presentation';
  await ctx.editMessageText(`Mavzu: "${session.prompt}"\nTur: Prezentatsiya 📊`);
  await askLanguage(ctx);
});

// Referat tanlansa — avval bet sonini so'raymiz.
bot.action('type_referat', async (ctx) => {
  const userId = ctx.from.id;
  const session = pendingSessions.get(userId);

  await ctx.answerCbQuery();

  if (!session) {
    return ctx.reply('Sessiya eskirdi, mavzuni qayta yozing.');
  }

  session.type = 'referat';
  await ctx.editMessageText(`Mavzu: "${session.prompt}"\nTur: Referat 📄`);
  await ctx.reply(
    'Necha bet hajmida bo\'lsin?',
    Markup.inlineKeyboard([
      [1, 2, 3, 4, 5].map((n) => Markup.button.callback(`${n}`, `pages_${n}`)),
    ])
  );
});

// Bet soni tanlangach — til tanlashga o'tamiz.
bot.action(/^pages_([1-5])$/, async (ctx) => {
  const userId = ctx.from.id;
  const session = pendingSessions.get(userId);

  await ctx.answerCbQuery();

  if (!session) {
    return ctx.reply('Sessiya eskirdi, mavzuni qayta yozing.');
  }

  session.pages = parseInt(ctx.match[1], 10);
  await ctx.editMessageText(`Mavzu: "${session.prompt}"\nTur: Referat 📄\nHajmi: ${session.pages} bet`);
  await askLanguage(ctx);
});

async function askLanguage(ctx) {
  await ctx.reply(
    'Qaysi tilda tayyorlaymiz?',
    Markup.inlineKeyboard([
      [
        Markup.button.callback('🇷🇺 Русский', 'lang_ru'),
        Markup.button.callback("🇺🇿 O'zbekcha", 'lang_uz'),
      ],
    ])
  );
}

// Til tanlangach — navbatga qo'shamiz (prezentatsiya yoki referat, sessiyada
// belgilangan turga qarab).
bot.action(/^lang_(ru|uz)$/, async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const language = ctx.match[1];
  const session = pendingSessions.get(userId);

  await ctx.answerCbQuery();

  if (!session || !session.prompt || !session.type) {
    return ctx.reply('Sessiya eskirdi, mavzuni qayta yozing.');
  }

  const { prompt, type, pages } = session;
  pendingSessions.delete(userId);

  const languageLabel = language === 'uz' ? "O'zbekcha" : 'Русский';
  await ctx.editMessageText(`Mavzu: "${prompt}"\nTil: ${languageLabel} ✅`);

  try {
    await ctx.reply(`🚀 "${prompt}" mavzusi bo'yicha navbatga qo'shildi. Iltimos, biroz kuting...`);

    await presentationQueue.add('generate-document', {
      chatId,
      prompt,
      language,
      type,
      pages,
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