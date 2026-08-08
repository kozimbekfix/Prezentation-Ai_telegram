import { Telegraf, Markup } from 'telegraf';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import express from 'express';
import dotenv from 'dotenv';

import { PresentationAIPipeline } from './ai/pipeline.js';
import { PresentationEngine } from './engine/pptx/index.js';
import { ReferatEngine } from './engine/docx/referatEngine.js';
import { convertToPdf, cleanupTempFiles } from './engine/pdfEngine.js';
import {
  touchUser, getUser, resolveUser, setBlocked, isBlocked, addTokens,
  setLanguage, listUsers, canGenerate, incrementDailyUsage, refundDailyUsage, setStar,
  addCredits, consumeCredit, refundCredit,
} from './utils/userStore.js';
import { t } from './utils/messages.js';
import os from 'os';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Upstash "max requests limit exceeded" xatosiga uchraganda ioredis/BullMQ
// standart holatda deyarli darhol (millisekundlar ichida) qayta urinaveradi —
// bu esa limitni tezroq tugatadi va reset bo'lgandan keyin ham darhol yana
// tugab qolishiga sabab bo'ladi. Shuning uchun eksponensial backoff bilan
// urinishlar orasini asta-sekin uzaytiramiz (max 30s), server resurslarini
// behuda sarflamaslik va limitni "dam olishga" imkon berish uchun.
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    const delay = Math.min(times * 1000, 30000);
    console.warn(`[Redis] Qayta ulanish urinishi #${times}, ${delay}ms kutilmoqda...`);
    return delay;
  },
  reconnectOnError(err) {
    // Upstash limit xatosi ulanishni uzmaydi (bu buyruq darajasidagi xato),
    // shuning uchun reconnect shart emas — faqat haqiqiy tarmoq xatolarida
    // qayta ulanamiz.
    const targetError = 'READONLY';
    return err.message.includes(targetError);
  },
});

// BullMQ navbatini yaratamiz. defaultJobOptions orqali har bir vazifa
// uchun avtomatik "tozalash" siyosati o'rnatiladi — aks holda Redis'da
// muvaffaqiyatli/muvaffaqiyatsiz bo'lgan barcha vazifalar ABADIY saqlanib
// qolar edi (xotira vaqt o'tishi bilan asta-sekin to'lib boradi).
// Muvaffaqiyatli vazifalar: 1 soat YOKI oxirgi 500 tasi saqlanadi.
// Muvaffaqiyatsiz vazifalar: debug uchun 3 kunroq saqlanadi.
const presentationQueue = new Queue('presentation-queue', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { age: 60 * 60, count: 500 },
    removeOnFail: { age: 3 * 24 * 60 * 60 },
  },
});

// --- ALOHIDA XATOLAR KANALI ---
// .env'da ERROR_LOG_CHAT_ID (kanal/guruh/shaxsiy chat ID) sozlansa, worker
// ichida yuz beradigan barcha jiddiy xatolar (AI xatosi, fayl yaratish
// xatosi, webhook o'rnatish xatosi va h.k.) shu chatga alohida, batafsil
// xabar sifatida yuboriladi — shunda admin buni oddiy foydalanuvchi
// xabarlaridan farqli o'laroq darhol ko'radi (Render loglarini kuzatib
// o'tirishning hojati qolmaydi).
const ERROR_LOG_CHAT_ID = process.env.ERROR_LOG_CHAT_ID;

async function logErrorToChannel(context, error) {
  if (!ERROR_LOG_CHAT_ID) return;
  try {
    const details = error?.stack || error?.message || String(error);
    const text = `⚠️ *Xatolik:* ${context}\n\n\`\`\`\n${details}\n\`\`\``.slice(0, 4000);
    await bot.telegram.sendMessage(ERROR_LOG_CHAT_ID, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[ErrorChannel] Xatolar kanaliga xabar yuborib bo\'lmadi:', err.message);
  }
}

// Admin buyruqlarini (/users, /blockuser, /unblockuser, /usertokens) faqat
// shu Telegram ID'lar ishlatishi mumkin. .env'da vergul bilan bir nechtasini
// yozish mumkin: ADMIN_IDS=111111111,222222222
// Diqqat: har bir ID ichidagi BARCHA bo'sh joy/qator o'tkazish belgilari
// olib tashlanadi (nafaqat boshi/oxiridagi) — ba'zi hosting panellari
// (masalan Render'ning mobil interfeysi) qiymatni saqlashda tasodifan
// ichkariga yashirin qator o'tkazish qo'shib qo'yishi mumkin, bu esa
// ID solishtirishni "mos kelmadi" qilib qo'yardi.
const ADMIN_IDS = (process.env.ADMIN_IDS || process.env.ADMIN_ID || '')
  .split(',')
  .map((s) => s.replace(/\s+/g, ''))
  .filter(Boolean);

console.log(`[Admin] ADMIN_IDS .env'dan o'qildi: [${ADMIN_IDS.join(', ')}] (${ADMIN_IDS.length} ta)`);

function isAdmin(ctx) {
  const userId = String(ctx.from?.id || '');
  const result = ADMIN_IDS.includes(userId);

  if (!result && ADMIN_IDS.length > 0) {
    // Tekshiruv uchun: kim admin buyruq yozib, lekin ro'yxatda topilmadi —
    // shu yerdan Render loglarida "sizning ID" va "ro'yxatdagi ID"larni
    // solishtirib, nima uchun mos kelmayotganini aniq ko'rish mumkin.
    console.log(`[Admin] Ruxsat berilmadi: kelgan ID="${userId}", ADMIN_IDS ro'yxati=[${ADMIN_IDS.join(', ')}]`);
  }

  return result;
}

// Telegram xabari 4096 belgidan uzun bo'lolmaydi — uzun ro'yxatlarni
// (masalan /users, /usertokens) shu qismlarga bo'lib yuboramiz.
async function sendChunked(ctx, text, chunkSize = 3500) {
  for (let i = 0; i < text.length; i += chunkSize) {
    await ctx.reply(text.slice(i, i + chunkSize));
  }
}

// Har bir kiruvchi update'da: (1) foydalanuvchini Redis'ga yozib/yangilab
// qo'yamiz (shu orqali /users buyrug'i to'liq ro'yxatni bilib oladi), (2)
// bloklangan foydalanuvchi hech narsa qila olmasligini ta'minlaymiz.
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  await touchUser(connection, userId, ctx.from.username);

  if (!isAdmin(ctx) && (await isBlocked(connection, userId))) {
    if (ctx.updateType === 'callback_query') {
      await ctx.answerCbQuery('🚫 Sizga ruxsat berilmagan.', { show_alert: true });
    } else {
      await ctx.reply('🚫 Siz botdan foydalanish huquqidan mahrum qilingansiz.');
    }
    return; // keyingi handlerlarga o'tkazmaymiz
  }

  return next();
});

// Foydalanuvchining joriy so'rov holati: userId -> { prompt, type, pages }.
// Mavzu yozilgach to'ldirila boshlaydi, til tanlangach navbatga qo'shilib
// tozalanadi. type: "presentation" | "referat", pages faqat referat uchun.
const pendingSessions = new Map();

// Foydalanuvchining hozirgi navbatdagi/faol vazifasi: userId -> BullMQ job ID.
// /cancel buyrug'i shu orqali qaysi vazifani to'xtatishni topadi.
const pendingJobs = new Map();

// Vazifa "active" (worker allaqachon boshlagan) holatda bekor qilinsa, uni
// darhol to'xtatib bo'lmaydi (Node.js sinxron bo'lmagan operatsiyalarni
// o'rtada kesib tashlay olmaydi) — shuning uchun Redis'ga vaqtinchalik
// "bekor qilindi" belgisi qo'yamiz, worker esa har bosqichdan keyin shu
// belgini tekshirib, iloji boricha tezroq to'xtaydi (masalan fayl
// yaratishdan oldin).
async function markJobCancelled(jobId) {
  await connection.set(`cancel:${jobId}`, '1', 'EX', 300); // 5 daqiqa amal qiladi
}

async function isJobCancelled(jobId) {
  return (await connection.get(`cancel:${jobId}`)) === '1';
}

// Har bir oddiy (star bo'lmagan) foydalanuvchi kuniga bepul necha marta
// generatsiya qila olishi. .env orqali sozlash mumkin: DAILY_FREE_LIMIT=5
const DAILY_LIMIT = parseInt(process.env.DAILY_FREE_LIMIT, 10) || 3;

// /stats buyrug'i uchun oddiy Redis hisoblagichlar.
const STATS_KEYS = {
  queued: 'stats:queued',
  presentationsOk: 'stats:presentations:success',
  referatsOk: 'stats:referats:success',
  errors: 'stats:errors',
};

// Xatoning texnik tafsilotlarini konsolga yozamiz (debug uchun), lekin
// foydalanuvchiga har doim tushunarli, sodda xabar ko'rsatamiz — u
// "status: 429" yoki stack trace kabi narsalarni ko'rishi shart emas.
function friendlyErrorMessage(error, language) {
  const status = error?.status || error?.response?.status;

  if (status === 429 || status === 503) {
    return t(language, 'errorRateLimit');
  }

  return t(language, 'errorGeneric');
}

// --- WORKER QISMI (Navbatdagi vazifalarni bajaruvchi) ---
console.log("[Worker] Background worker ishga tushdi va navbatni kutmoqda...");

const worker = new Worker('presentation-queue', async (job) => {
  const { chatId, prompt, language, type, pages, useCredit } = job.data;

  if (type === 'referat') {
    await processReferatJob({ chatId, prompt, language, pages, jobId: job.id, useCredit });
  } else {
    await processPresentationJob({ chatId, prompt, language, jobId: job.id, useCredit });
  }
}, { connection });

// So'rov muvaffaqiyatsiz/bekor bo'lganda, u qaysi hisobdan (kunlik limit
// yoki sotib olingan ⭐ kredit) sarflangan bo'lsa, aynan o'sha hisobga
// qaytariladi — aks holda kredit hisobidan foydalangan kishiga bekorga
// kunlik limit qaytarilib, krediti esa isrof bo'lib qolar edi.
async function refundUsage(chatId, useCredit) {
  if (useCredit) {
    await refundCredit(connection, chatId);
  } else {
    await refundDailyUsage(connection, chatId);
  }
}

async function processPresentationJob({ chatId, prompt, language, jobId, useCredit }) {
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  let pptxPath = null;
  let pdfPath = null;
  const TOTAL_STEPS = 3;

  try {
    await bot.telegram.sendMessage(chatId, t(language, 'aiWorkingPresentation', 1, TOTAL_STEPS));

    const pipeline = new PresentationAIPipeline();
    const aiResult = await pipeline.generateFullPresentation(prompt, language);

    if (!aiResult.isSuccess) {
      throw new Error(aiResult.error);
    }

    await addTokens(connection, chatId, aiResult.data.tokensUsed);

    // /cancel orqali foydalanuvchi shu oraliqda bekor qilgan bo'lishi mumkin —
    // AI javobi allaqachon kelgan (token sarflangan), lekin fayl hali
    // yaratilmagan, shuning uchun shu yerda to'xtatish eng maqbul nuqta.
    if (await isJobCancelled(jobId)) {
      await refundUsage(chatId, useCredit);
      await bot.telegram.sendMessage(chatId, t(language, 'cancelledMidway'), MODE_KEYBOARD);
      return;
    }

    await bot.telegram.sendMessage(chatId, t(language, 'buildingPptx', 2, TOTAL_STEPS));

    const engine = new PresentationEngine();
    pptxPath = await engine.createPresentation(aiResult.data, uniqueId);

    const safeName = prompt.substring(0, 20).replace(/\s+/g, '_');

    await bot.telegram.sendDocument(chatId, {
      source: pptxPath,
      filename: `${safeName}_presentation.pptx`
    }, {
      caption: t(language, 'presentationCaption')
    });

    // PDF versiyasini ham yasashga harakat qilamiz. Bu qadam ixtiyoriy —
    // agar LibreOffice biror sababdan ishlamasa (masalan konteynerda
    // topilmasa yoki 15s timeout'ga uchrasa), foydalanuvchi baribir
    // yuqoridagi .pptx faylni allaqachon olgan bo'ladi, shuning uchun
    // xatoni yutib, faqat log qoldiramiz — jarayonni to'xtatmaymiz.
    try {
      await bot.telegram.sendMessage(chatId, t(language, 'preparingPdfPresentation', 3, TOTAL_STEPS));
      pdfPath = await convertToPdf(pptxPath, os.tmpdir());
      await bot.telegram.sendDocument(chatId, {
        source: pdfPath,
        filename: `${safeName}_presentation.pdf`
      }, {
        caption: t(language, 'presentationPdfCaption')
      });
    } catch (pdfError) {
      console.error("[PDF Export Warning]", pdfError.message);
      // PDF muvaffaqiyatsiz bo'lsa ham botni qulatmaymiz — pptx allaqachon yuborilgan.
    }

    await connection.incr(STATS_KEYS.presentationsOk);
    await bot.telegram.sendMessage(chatId, t(language, 'anythingElse'), MODE_KEYBOARD);

  } catch (error) {
    console.error("[Worker Error]", error);
    await connection.incr(STATS_KEYS.errors);
    await refundUsage(chatId, useCredit);
    await bot.telegram.sendMessage(chatId, friendlyErrorMessage(error, language), MODE_KEYBOARD);
    await logErrorToChannel(`Prezentatsiya generatsiyasi (chatId: ${chatId}, mavzu: "${prompt}")`, error);
  } finally {
    await cleanupTempFiles([pptxPath, pdfPath]);
    await connection.del(`cancel:${jobId}`);
    pendingJobs.delete(String(chatId));
  }
}

async function processReferatJob({ chatId, prompt, language, pages, jobId, useCredit }) {
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  let docxPath = null;
  let pdfPath = null;
  const TOTAL_STEPS = 3;

  try {
    await bot.telegram.sendMessage(chatId, t(language, 'aiWorkingReferat', 1, TOTAL_STEPS));

    const pipeline = new PresentationAIPipeline();
    const aiResult = await pipeline.generateReferat(prompt, language, pages);

    if (!aiResult.isSuccess) {
      throw new Error(aiResult.error);
    }

    await addTokens(connection, chatId, aiResult.data.tokensUsed);

    if (await isJobCancelled(jobId)) {
      await refundUsage(chatId, useCredit);
      await bot.telegram.sendMessage(chatId, t(language, 'cancelledMidway'), MODE_KEYBOARD);
      return;
    }

    await bot.telegram.sendMessage(chatId, t(language, 'buildingDocx', 2, TOTAL_STEPS));

    const engine = new ReferatEngine();
    docxPath = await engine.createReferat(aiResult.data.content, language, uniqueId);

    const safeName = prompt.substring(0, 20).replace(/\s+/g, '_');

    await bot.telegram.sendDocument(chatId, {
      source: docxPath,
      filename: `${safeName}_referat.docx`
    }, {
      caption: t(language, 'referatCaption', pages)
    });

    // PDF versiyasi ham ixtiyoriy — muvaffaqiyatsiz bo'lsa docx baribir yuborilgan.
    try {
      await bot.telegram.sendMessage(chatId, t(language, 'preparingPdfReferat', 3, TOTAL_STEPS));
      pdfPath = await convertToPdf(docxPath, os.tmpdir());
      await bot.telegram.sendDocument(chatId, {
        source: pdfPath,
        filename: `${safeName}_referat.pdf`
      }, {
        caption: t(language, 'referatPdfCaption')
      });
    } catch (pdfError) {
      console.error("[PDF Export Warning]", pdfError.message);
    }

    await connection.incr(STATS_KEYS.referatsOk);
    await bot.telegram.sendMessage(chatId, t(language, 'anythingElse'), MODE_KEYBOARD);

  } catch (error) {
    console.error("[Worker Error/Referat]", error);
    await connection.incr(STATS_KEYS.errors);
    await refundUsage(chatId, useCredit);
    await bot.telegram.sendMessage(chatId, friendlyErrorMessage(error, language), MODE_KEYBOARD);
    await logErrorToChannel(`Referat generatsiyasi (chatId: ${chatId}, mavzu: "${prompt}")`, error);
  } finally {
    await cleanupTempFiles([docxPath, pdfPath]);
    await connection.del(`cancel:${jobId}`);
    pendingJobs.delete(String(chatId));
  }
}

worker.on('failed', (job, err) => {
  console.error(`[Job Failed] ID: ${job.id}, Error:`, err);
});

// Upstash oylik so'rovlar limiti tugaganda BullMQ ichki polling tsikli
// (bzpopmin/evalsha) to'xtovsiz xato beraveradi. Bunday holatda workerni
// bir muddatga pauza qilib qo'yamiz — aks holda log to'lib ketadi va
// limit reset bo'lgan zahoti yana zudlik bilan tugaydi.
let isPausedForRateLimit = false;
worker.on('error', async (err) => {
  console.error('[Worker Error]', err.message);

  if (!isPausedForRateLimit && err.message?.includes('max requests limit exceeded')) {
    isPausedForRateLimit = true;
    const PAUSE_MS = 5 * 60 * 1000; // 5 daqiqa
    console.error(`[Worker] Upstash limiti tugadi. Worker ${PAUSE_MS / 60000} daqiqaga pauza qilinmoqda...`);
    try {
      await worker.pause();
    } catch (pauseErr) {
      console.error('[Worker] Pauza qilishda xato:', pauseErr.message);
    }
    setTimeout(async () => {
      console.error('[Worker] Pauza tugadi, worker qayta ishga tushirilmoqda...');
      try {
        await worker.resume();
      } finally {
        isPausedForRateLimit = false;
      }
    }, PAUSE_MS);
  }
});
// ----------------------------------------------------

// Doimiy pastki klaviatura — har doim ekranning pastida turadi, foydalanuvchi
// har safar qayta so'ralmasdan turini tanlab qo'ya oladi.
const MODE_KEYBOARD = Markup.keyboard([
  ['📊 Prezentatsiya', '📄 Referat'],
]).resize();

const PRESENTATION_LABEL = '📊 Prezentatsiya';
const REFERAT_LABEL = '📄 Referat';

// Navbatga qo'shilgandan keyingi xabarga qo'shib yuboriladigan inline
// "Bekor qilish" tugmasi — foydalanuvchi endi /cancel matnini qo'lda
// yozmasdan, bitta bosish bilan so'rovni to'xtata oladi.
function cancelKeyboard(language) {
  return Markup.inlineKeyboard([
    Markup.button.callback(t(language, 'cancelButtonLabel'), 'cancel_job'),
  ]);
}

// /cancel buyrug'i VA "❌ Bekor qilish" inline tugmasi UCHUN umumiy mantiq.
// Natijada foydalanuvchiga ko'rsatiladigan xabar matni (tarjima kaliti)
// qaytariladi, chaqiruvchi kod uni ctx.reply/editMessageText bilan
// ko'rsatadi.
async function cancelActiveJob(userId, language) {
  const jobId = pendingJobs.get(String(userId));

  if (!jobId) {
    return { key: 'noActiveJob', keyboard: undefined };
  }

  const job = await presentationQueue.getJob(jobId);
  if (!job) {
    pendingJobs.delete(String(userId));
    return { key: 'alreadyFinished', keyboard: undefined };
  }

  const state = await job.getState();

  if (state === 'waiting' || state === 'delayed') {
    await job.remove();
    await refundUsage(userId, job.data?.useCredit);
    pendingJobs.delete(String(userId));
    return { key: 'cancelledBeforeStart', keyboard: MODE_KEYBOARD };
  }

  if (state === 'active') {
    await markJobCancelled(jobId);
    return { key: 'cancelledMidway', keyboard: MODE_KEYBOARD };
  }

  pendingJobs.delete(String(userId));
  return { key: 'alreadyFinished', keyboard: undefined };
}

// --- ADMIN BUYRUQLARI (faqat ADMIN_IDS'dagi ID'lar uchun) ---

// /users — botdan foydalangan barcha odamlarning ro'yxati.
bot.command('users', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const users = await listUsers(connection);
  if (users.length === 0) {
    return ctx.reply('Hali hech kim botdan foydalanmagan.');
  }

  const lines = users
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
    .map((u) => {
      const label = u.username ? `@${u.username}` : `ID:${u.id}`;
      const status = u.blocked ? '🚫 bloklangan' : (u.star ? '⭐ cheksiz' : '✅ faol');
      return `${label} — ${status} — ${u.tokens || 0} token`;
    })
    .join('\n');

  await sendChunked(ctx, `👥 Jami foydalanuvchilar: ${users.length}\n\n${lines}`);
});

// /blockuser @username yoki /blockuser 123456789 — foydalanuvchini botdan
// foydalanishdan to'sadi (u yozgan xabarlarga bot endi javob bermaydi).
bot.command('blockuser', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const arg = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!arg) {
    return ctx.reply('Foydalanish: /blockuser @username  yoki  /blockuser 123456789');
  }

  const user = await resolveUser(connection, arg);
  if (!user) {
    return ctx.reply("Bunday foydalanuvchi topilmadi (u hali botga hech narsa yozmagan bo'lishi mumkin).");
  }

  await setBlocked(connection, user.id, true);
  await ctx.reply(`🚫 ${user.username ? '@' + user.username : 'ID:' + user.id} bloklandi.`);
});

// /unblockuser @username yoki /unblockuser 123456789 — blokni bekor qiladi.
bot.command('unblockuser', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const arg = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!arg) {
    return ctx.reply('Foydalanish: /unblockuser @username  yoki  /unblockuser 123456789');
  }

  const user = await resolveUser(connection, arg);
  if (!user) {
    return ctx.reply('Bunday foydalanuvchi topilmadi.');
  }

  await setBlocked(connection, user.id, false);
  await ctx.reply(`✅ ${user.username ? '@' + user.username : 'ID:' + user.id} blokdan chiqarildi.`);
});

// /usertokens — har bir foydalanuvchi qancha Gemini/OpenRouter token
// sarflaganini va bu jami sarfning necha foizini tashkil qilishini ko'rsatadi.
bot.command('usertokens', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const users = await listUsers(connection);
  const total = users.reduce((sum, u) => sum + (u.tokens || 0), 0);

  if (total === 0) {
    return ctx.reply('Hali birorta so\'rov uchun token sarflanmagan.');
  }

  const lines = users
    .filter((u) => (u.tokens || 0) > 0)
    .sort((a, b) => (b.tokens || 0) - (a.tokens || 0))
    .map((u) => {
      const label = u.username ? `@${u.username}` : `ID:${u.id}`;
      const pct = ((u.tokens / total) * 100).toFixed(1);
      return `${label} — ${u.tokens} token (${pct}%)`;
    })
    .join('\n');

  await sendChunked(ctx, `📊 Jami sarflangan token: ${total}\n\n${lines}`);
});

// /stats — botning umumiy holati: foydalanuvchilar, so'rovlar, xatolar, tokenlar.
bot.command('stats', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const users = await listUsers(connection);
  const totalUsers = users.length;
  const blockedUsers = users.filter((u) => u.blocked).length;
  const totalTokens = users.reduce((sum, u) => sum + (u.tokens || 0), 0);

  const [queued, presentationsOk, referatsOk, errors] = await Promise.all([
    connection.get(STATS_KEYS.queued),
    connection.get(STATS_KEYS.presentationsOk),
    connection.get(STATS_KEYS.referatsOk),
    connection.get(STATS_KEYS.errors),
  ]);

  await ctx.reply(
    '📊 Statistika\n\n' +
    `👥 Foydalanuvchilar: ${totalUsers} (🚫 ${blockedUsers} bloklangan)\n` +
    `📨 Jami navbatga qo'shilgan so'rovlar: ${queued || 0}\n` +
    `📊 Muvaffaqiyatli prezentatsiyalar: ${presentationsOk || 0}\n` +
    `📄 Muvaffaqiyatli referatlar: ${referatsOk || 0}\n` +
    `❌ Xatoliklar: ${errors || 0}\n` +
    `🔢 Jami sarflangan token: ${totalTokens}`
  );
});

// /broadcast <xabar matni> — barcha foydalanuvchilarga xabar yuboradi
// (yangilik/e'lon qilish uchun). Telegram'ning yuborish tezligi chegarasiga
// tegmaslik uchun har bir xabar orasida kichik pauza qo'yiladi.
bot.command('broadcast', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const text = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!text) {
    return ctx.reply('Foydalanish: /broadcast Xabar matni bu yerga yoziladi');
  }

  const users = await listUsers(connection);
  await ctx.reply(`📢 ${users.length} foydalanuvchiga yuborilmoqda...`);

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await bot.telegram.sendMessage(user.id, text);
      sent++;
    } catch (error) {
      failed++; // ko'pincha: foydalanuvchi botni bloklagan/o'chirgan
    }
    await new Promise((resolve) => setTimeout(resolve, 50)); // Telegram limitiga hurmat
  }

  await ctx.reply(`✅ Yuborildi: ${sent}\n❌ Yetkazilmadi: ${failed}`);
});

// /cancel — foydalanuvchining hozirgi navbatdagi yoki bajarilayotgan
// so'rovini bekor qiladi. Hali navbatda (boshlanmagan) bo'lsa to'liq
// bekor qilinadi; allaqachon ishlayotgan bo'lsa, worker keyingi qulay
// bosqichda (fayl yaratishdan oldin) to'xtashga harakat qiladi.
bot.command('cancel', async (ctx) => {
  const userId = ctx.from.id;
  const language = (await getUser(connection, userId))?.language || 'uz';

  const { key, keyboard } = await cancelActiveJob(userId, language);
  return ctx.reply(t(language, key), keyboard);
});

// Xuddi /cancel bilan bir xil — lekin generatsiya davomida yuboriladigan
// xabardagi inline "❌ Bekor qilish" tugmasi orqali.
bot.action('cancel_job', async (ctx) => {
  const userId = ctx.from.id;
  const language = (await getUser(connection, userId))?.language || 'uz';

  await ctx.answerCbQuery();
  const { key, keyboard } = await cancelActiveJob(userId, language);

  // Tugma bosilgan xabarni tahrirlab, tugmani olib tashlaymiz (qayta
  // bosilib ketmasligi uchun), natija haqidagi xabarni esa alohida yuboramiz.
  try {
    await ctx.editMessageReplyMarkup(undefined);
  } catch {
    // Xabar allaqachon o'zgargan/eski bo'lishi mumkin — muhim emas.
  }

  return ctx.reply(t(language, key), keyboard);
});

// /staruser @username yoki /staruser 123456789 — bu foydalanuvchiga kunlik
// limit qo'llanilmaydi (⭐ cheksiz generatsiya). Masalan kunlik 3 talik
// limiti tugagan, lekin sizga yaqin/ishonchli odamga qo'shimcha bermoqchi
// bo'lsangiz shu buyruq bilan uni butunlay limitsiz qilib qo'yasiz.
bot.command('staruser', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const arg = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!arg) {
    return ctx.reply('Foydalanish: /staruser @username  yoki  /staruser 123456789');
  }

  const user = await resolveUser(connection, arg);
  if (!user) {
    return ctx.reply("Bunday foydalanuvchi topilmadi (u hali botga hech narsa yozmagan bo'lishi mumkin).");
  }

  await setStar(connection, user.id, true);
  await ctx.reply(`⭐ ${user.username ? '@' + user.username : 'ID:' + user.id} endi kunlik limitsiz (cheksiz) foydalanadi.`);
});

// /unstaruser — ⭐ holatini bekor qiladi, foydalanuvchi qayta kunlik
// limitga (DAILY_FREE_LIMIT) qaytadi.
bot.command('unstaruser', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const arg = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!arg) {
    return ctx.reply('Foydalanish: /unstaruser @username  yoki  /unstaruser 123456789');
  }

  const user = await resolveUser(connection, arg);
  if (!user) {
    return ctx.reply('Bunday foydalanuvchi topilmadi.');
  }

  await setStar(connection, user.id, false);
  await ctx.reply(`${user.username ? '@' + user.username : 'ID:' + user.id} endi qaytadan kunlik ${DAILY_LIMIT} talik limitga ega.`);
});

// --------------------------------------------------------

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

  // Shu tilni foydalanuvchining "so'nggi tanlagan tili" sifatida eslab
  // qolamiz — shundan keyin /cancel kabi generatsiyadan tashqari buyruqlar
  // ham shu tilda javob beradi.
  await setLanguage(connection, userId, language);

  const languageLabel = language === 'uz' ? "O'zbekcha" : 'Русский';
  await ctx.editMessageText(`Mavzu: "${prompt}"\nTil: ${languageLabel} ✅`);

  // Kunlik bepul limitni tekshiramiz (star foydalanuvchilar uchun cheksiz,
  // sotib olingan ⭐ kreditlar bo'lsa — shulardan foydalanishga ruxsat
  // beriladi, useCredit=true bilan).
  const { allowed, useCredit } = await canGenerate(connection, userId, DAILY_LIMIT);
  if (!allowed) {
    return ctx.reply(
      t(language, 'dailyLimitReached', DAILY_LIMIT),
      Markup.inlineKeyboard([
        Markup.button.callback(t(language, 'buyCreditButtonLabel'), 'buy_credit'),
      ])
    );
  }

  try {
    await ctx.reply(
      `🚀 "${prompt}" mavzusi bo'yicha navbatga qo'shildi. Iltimos, biroz kuting...`,
      cancelKeyboard(language)
    );

    const job = await presentationQueue.add('generate-document', {
      chatId,
      prompt,
      language,
      type,
      pages,
      useCredit,
    });

    if (useCredit) {
      await consumeCredit(connection, userId);
    } else {
      await incrementDailyUsage(connection, userId);
    }
    await connection.incr(STATS_KEYS.queued);
    pendingJobs.set(String(userId), job.id);

  } catch (error) {
    console.error("Navbatga qo'shishda xatolik:", error);
    await ctx.reply("❌ Kechirasiz, so'rovni qabul qilishda xatolik yuz berdi.");
    await logErrorToChannel(`Navbatga qo'shishda xatolik (userId: ${userId})`, error);
  }
});

// --- ⭐ TELEGRAM STARS ORQALI QO'SHIMCHA GENERATSIYA SOTIB OLISH ---
// Kunlik bepul limit tugaganda ko'rsatiladigan tugma orqali chaqiriladi.
// Telegram Stars (XTR) — Telegram'ning o'z ichki valyutasi, alohida
// to'lov provayderi (provider_token) SHART EMAS.
bot.action('buy_credit', async (ctx) => {
  const userId = ctx.from.id;
  const language = (await getUser(connection, userId))?.language || 'uz';

  await ctx.answerCbQuery();

  try {
    await ctx.replyWithInvoice({
      title: t(language, 'invoiceTitle'),
      description: t(language, 'invoiceDescription'),
      payload: `extra_credit_${userId}_${Date.now()}`,
      provider_token: '', // Telegram Stars uchun bo'sh qoldiriladi
      currency: 'XTR',
      prices: [{ label: t(language, 'invoiceLabel'), amount: 1 }], // 1 ta Star
    });
  } catch (error) {
    console.error('[Stars] Invoice yuborishda xatolik:', error);
    await ctx.reply(t(language, 'paymentFailed'));
    await logErrorToChannel(`Stars invoice yuborishda xatolik (userId: ${userId})`, error);
  }
});

// Telegram to'lovni tasdiqlashdan oldin so'raydigan tekshiruv — deyarli
// har doim to'g'ridan-to'g'ri tasdiqlanadi (bu yerda maxsus zaxira/inventar
// tekshiruvi shart emas, chunki "tovar" cheksiz — shunchaki kredit balansi).
bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

// To'lov muvaffaqiyatli yakunlangach — foydalanuvchi balansiga +1 kredit
// qo'shiladi.
bot.on('successful_payment', async (ctx) => {
  const userId = ctx.from.id;
  const language = (await getUser(connection, userId))?.language || 'uz';

  await addCredits(connection, userId, 1);
  await ctx.reply(t(language, 'creditPurchased'), MODE_KEYBOARD);
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
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBHOOK_PATH = `/telegram-webhook/${BOT_TOKEN}`;

// Loglarda to'liq bot tokeni chiqib ketmasligi uchun (masalan Render/CI
// log'lari uchinchi shaxslarga ko'rinishi mumkin) — faqat boshi va oxiri
// ko'rsatiladi, qolgani "..." bilan yashiriladi.
function maskToken(token) {
  if (!token || token.length < 10) return '***';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}
const MASKED_WEBHOOK_PATH = `/telegram-webhook/${maskToken(BOT_TOKEN)}`;
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
    console.log(`[Telegram Bot] Webhook o'rnatildi: ${PUBLIC_URL}${MASKED_WEBHOOK_PATH}`);
  } catch (err) {
    console.error("[Telegram Bot] Webhook o'rnatishda xatolik:", err.message);
    await logErrorToChannel("Webhook o'rnatishda xatolik", err);
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