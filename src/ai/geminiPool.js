import { GoogleGenerativeAI } from "@google/generative-ai";

// --- UMUMIY GEMINI KALIT HAVUZI ---
// Bu fayl MATN generatsiyasi (pipeline.js) VA RASM generatsiyasi
// (utils/imageEngine.js) uchun BITTA umumiy kalit ro'yxati va navbat
// holatini boshqaradi. Ilgari ikkalasi alohida edi — pipeline.js
// GEMINI_API_KEYS (ko'p kalit) dan foydalansa, imageEngine.js faqat
// bitta GEMINI_API_KEY'dan foydalanardi va hech qachon boshqa kalitlarga
// o'tmasdi. Natijada 1 ta prezentatsiya 4 ta matn + 3 tagacha rasm
// chaqiruvi qilishi mumkin bo'lsa-da, rasm chaqiruvlari doim bitta
// kalitni "urib" qolib, tezroq limitga uchrardi. Endi ikkalasi ham shu
// yerdagi BITTA umumiy havuzdan, BITTA umumiy navbat/cooldown holati
// bilan foydalanadi.
const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

if (GEMINI_API_KEYS.length === 0) {
  console.error("[GeminiPool] Ogohlantirish: GEMINI_API_KEY yoki GEMINI_API_KEYS .env'da topilmadi!");
}

const clients = GEMINI_API_KEYS.map((key) => new GoogleGenerativeAI(key));

const KEY_COOLDOWN_MS = 60_000; // 1 daqiqa
const keyCooldownUntil = new Array(GEMINI_API_KEYS.length).fill(0);

// Round-robin boshlanish nuqtasi — MATN va RASM chaqiruvlari BITTA umumiy
// hisoblagichni ishlatadi, shunda ikkala turdagi yuklama ham barcha
// kalitlar orasida teng taqsimlanadi (ayirmasiz).
let nextKeyIndex = 0;

function isOnCooldown(idx) {
  return Date.now() < keyCooldownUntil[idx];
}

function markOnCooldown(idx, reason) {
  keyCooldownUntil[idx] = Date.now() + KEY_COOLDOWN_MS;
  console.warn(
    `[GeminiPool] Kalit #${idx + 1}/${GEMINI_API_KEYS.length} ${reason} sababli ` +
    `1 daqiqaga chetlashtirildi.`
  );
}

export const keyCount = GEMINI_API_KEYS.length;

/**
 * `fn(client, keyIndex)` funksiyasini round-robin tartibida mavjud
 * kalitlar bilan sinab ko'radi — biror kalit 429/503 qaytarsa, uni
 * cooldown'ga qo'yib, keyingisiga o'tadi. Barcha kalitlar band bo'lsa,
 * oxirgi xatoni tashlaydi (chaqiruvchi kod, masalan pipeline.js, shu
 * yerdan zaxira provayderga o'tishi mumkin).
 */
export async function withGeminiKey(fn) {
  if (clients.length === 0) {
    throw new Error("Gemini kaliti mavjud emas (GEMINI_API_KEY / GEMINI_API_KEYS sozlanmagan).");
  }

  const startIndex = nextKeyIndex;
  let lastError = null;

  for (let i = 0; i < clients.length; i++) {
    const idx = (startIndex + i) % clients.length;

    if (isOnCooldown(idx)) continue;

    try {
      const result = await fn(clients[idx]);
      nextKeyIndex = (idx + 1) % clients.length; // keyingi chaqiruv navbatdagi kalitdan boshlansin
      return result;
    } catch (error) {
      const status = error?.status || error?.response?.status;
      const isRetryable = status === 503 || status === 429;
      lastError = error;

      if (isRetryable) {
        markOnCooldown(idx, status === 429 ? "429 (limit/kvota)" : "503 (band)");
        continue;
      }

      throw error; // limit bilan bog'liq bo'lmagan xato — darhol tashlaymiz
    }
  }

  throw lastError || new Error("Barcha Gemini kalitlar band.");
}