import axios from 'axios';
import { withGeminiKey, keyCount } from '../ai/geminiPool.js';

const UNSPLASH_API_URL = 'https://api.unsplash.com/search/photos';
const REQUEST_TIMEOUT_MS = 15_000;
// "Nano Banana" — Gemini'ning rasm generatsiya qiluvchi modeli. Unsplash'da
// mavzuga mos rasm topilmasa, shu model orqali mavzuga mos rasm generatsiya
// qilamiz. Kalitlar geminiPool.js orqali MATN generatsiyasi bilan BIRGA,
// umumiy round-robin havuzdan olinadi — shunda bitta kalit faqat rasm
// chaqiruvlaridan charchab, boshqa kalitlar bo'sh turgan holat bo'lmaydi.
const IMAGE_GEN_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

let warnedAboutMissingUnsplashKey = false;

/**
 * Unsplash'dan kalit so'z bo'yicha rasm qidiradi va topilsa URL qaytaradi.
 * Hech narsa topilmasa yoki xato bo'lsa — null qaytaradi (fallback fotosurat
 * QO'YILMAYDI, chunki mavzuga aloqasi bo'lmagan tasodifiy rasm chalg'itadi).
 */
async function searchUnsplash(keyword) {
  if (!keyword || !process.env.UNSPLASH_ACCESS_KEY) {
    if (!warnedAboutMissingUnsplashKey) {
      console.warn(
        '[ImageEngine] UNSPLASH_ACCESS_KEY .env da topilmadi — Unsplash qidiruvi ' +
        'o\'tkazib yuboriladi, to\'g\'ridan-to\'g\'ri AI orqali rasm generatsiya qilinadi.'
      );
      warnedAboutMissingUnsplashKey = true;
    }
    return null;
  }

  try {
    const searchRes = await axios.get(UNSPLASH_API_URL, {
      params: { query: keyword, per_page: 1, orientation: 'landscape' },
      headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const result = searchRes.data?.results?.[0];
    if (!result) {
      console.warn(`[ImageEngine] Unsplash'da "${keyword}" uchun natija topilmadi.`);
      return null;
    }

    return result.urls.raw + '&w=1080&q=80&fit=crop';
  } catch (err) {
    console.error(`[ImageEngine] Unsplash qidiruv xatosi ("${keyword}"):`, err.message);
    return null;
  }
}

/**
 * Berilgan URL'dagi rasmni yuklab, Base64 formatga o'giradi.
 */
async function downloadAsBase64(url) {
  const imageRes = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: REQUEST_TIMEOUT_MS,
  });
  const base64 = Buffer.from(imageRes.data, 'binary').toString('base64');
  const mimeType = imageRes.headers['content-type'] || 'image/jpeg';
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Unsplash'da rasm topilmasa, Gemini ("Nano Banana") orqali mavzuga mos
 * rasm generatsiya qiladi. Muvaffaqiyatsiz bo'lsa — null qaytaradi (shablon
 * shu holatda bezakli aksent panelga o'tadi, rasmsiz qoladi).
 */
async function generateAIImage(keyword) {
  if (keyCount === 0) {
    console.warn("[ImageEngine] Gemini kaliti yo'q — AI rasm generatsiyasi o'tkazib yuborildi.");
    return null;
  }

  try {
    const prompt =
      `A professional, realistic, high-quality wide photograph representing: "${keyword}". ` +
      `No text, no watermarks, no logos in the image. Cinematic lighting, landscape orientation.`;

    const result = await withGeminiKey((client) =>
      client
        .getGenerativeModel({
          model: IMAGE_GEN_MODEL,
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        })
        .generateContent(prompt)
    );

    const parts = result.response?.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || 'image/png';
        return `data:${mimeType};base64,${part.inlineData.data}`;
      }
    }

    console.warn(`[ImageEngine] AI rasm generatsiyasi natija bermadi ("${keyword}").`);
    return null;
  } catch (err) {
    console.error(`[ImageEngine] AI rasm generatsiyasi xatosi ("${keyword}"):`, err.message);
    return null;
  }
}

/**
 * Slayd uchun rasm topadi:
 * 1) Avval Unsplash'dan mavzuga mos haqiqiy fotosurat qidiradi.
 * 2) Topilmasa — Gemini orqali mavzuga mos rasm generatsiya qiladi.
 * 3) Bu ham muvaffaqiyatsiz bo'lsa — null qaytaradi (shablon rasmsiz,
 *    bezakli panel bilan chiqadi; tasodifiy notegishli rasm HECH QACHON
 *    qo'llanilmaydi).
 */
export const getEmbeddedImage = async (keyword) => {
  const unsplashUrl = await searchUnsplash(keyword);
  if (unsplashUrl) {
    try {
      return await downloadAsBase64(unsplashUrl);
    } catch (err) {
      console.error(`[ImageEngine] Unsplash rasmni yuklab bo'lmadi:`, err.message);
      // Yuklab bo'lmasa ham, AI-generatsiyaga o'tamiz (pastda davom etadi).
    }
  }

  return generateAIImage(keyword);
};