import axios from 'axios';
import sharp from 'sharp';
import { withGeminiKey, keyCount } from '../ai/geminiPool.js';
import { withRetry } from './retry.js';

const UNSPLASH_API_URL = 'https://api.unsplash.com/search/photos';
const REQUEST_TIMEOUT_MS = 15_000;

// --- SLAYDDAGI RASM QUTISINING NISBATI (Aspect Ratio) ---
// hero.js, imageLeft.js, ending.js shablonlarida rasm qutisi doim
// w=4.35in, h=5.63in o'lchamda joylashtiriladi. pptxgenjs'ning
// `sizing: { type: "cover" }` funksiyasi base64 ("data:") rasmlar uchun
// HAQIQIY piksel o'lchamini o'qiy OLMAYDI (kutubxonaning o'zidagi eski
// cheklov) — shu sababli u hech qanday kesish qilmasdan, rasmni to'g'ridan
// to'g'ri qutiga CHO'ZIB-TORAYTIRIB (stretch) joylashtiradi. Natijada, masalan,
// 1900px kenglikdagi kенг rasm tor 4.35x5.63 qutiga yassilanib tushib qoladi.
//
// Yechim: rasmni pptx'ga qo'yishdan OLDIN, shu yerda (`sharp` bilan) qutining
// aniq nisbatiga moslab markazdan kesib-o'lchamlaymiz — shunda pptxgenjs'ga
// hech narsani hisoblashning hojati qolmaydi, u tayyor to'g'ri nisbatdagi
// rasmni shunchaki joylashtiradi.
const SLIDE_IMAGE_BOX = { w: 4.35, h: 5.63 };
const SLIDE_IMAGE_ASPECT = SLIDE_IMAGE_BOX.w / SLIDE_IMAGE_BOX.h; // ≈ 0.7727
const TARGET_PX_WIDTH = 1000;
const TARGET_PX_HEIGHT = Math.round(TARGET_PX_WIDTH / SLIDE_IMAGE_ASPECT); // ≈ 1294
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
    // Tarmoq uzilishi/timeout kabi vaqtinchalik xatolarda 1 marta qayta
    // uriniladi (429/403 kabi "qidiruv umuman natija bermaydi" xatolarda
    // qayta urinishning foydasi yo'q, shuning uchun shouldRetry orqali
    // faqat tarmoq darajasidagi xatolarni qayta uringan qilamiz).
    const searchRes = await withRetry(
      () =>
        axios.get(UNSPLASH_API_URL, {
          params: { query: keyword, per_page: 1, orientation: 'landscape' },
          headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
          timeout: REQUEST_TIMEOUT_MS,
        }),
      {
        label: `Unsplash qidiruv ("${keyword}")`,
        shouldRetry: (err) => !err.response || err.response.status >= 500,
      }
    );

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
  const imageRes = await withRetry(
    () => axios.get(url, { responseType: 'arraybuffer', timeout: REQUEST_TIMEOUT_MS }),
    { label: 'Rasmni yuklab olish', shouldRetry: (err) => !err.response || err.response.status >= 500 }
  );
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

    // withGeminiKey o'zi 429/503'da kalitlar orasida almashadi — bu yerdagi
    // qo'shimcha withRetry esa shunga aloqasiz, vaqtinchalik tarmoq
    // uzilishi/timeout kabi holatlarni qoplaydi (barcha kalitlar shu bitta
    // tarmoq muammosidan bir vaqtda aziyat chekishi mumkin).
    const result = await withRetry(
      () =>
        withGeminiKey((client) =>
          client
            .getGenerativeModel({
              model: IMAGE_GEN_MODEL,
              generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
            })
            .generateContent(prompt)
        ),
      { label: `Gemini AI-rasm ("${keyword}")` }
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
 * Berilgan Base64 data-URI rasmni slayddagi rasm qutisining aniq nisbatiga
 * (4.35:5.63) moslab, markazdan kesib (object-fit: cover kabi) qayta
 * o'lchamlaydi. Bu funksiya pptxgenjs'ning base64 rasmlar uchun ishlamaydigan
 * `sizing: { type: "cover" }" kamchiligini butunlay chetlab o'tadi — chunki
 * kirish rasmi qanday o'lchamda bo'lishidan qat'i nazar (masalan 1900x800
 * yoki 600x1900), chiqishda har doim to'g'ri nisbatdagi, sifatli kesilgan
 * rasm bo'ladi.
 *
 * Muvaffaqiyatsiz bo'lsa (masalan buzilgan rasm formati) — asl rasmni
 * o'zgarishsiz qaytaradi, shunda jarayon baribir davom etadi (rasm biroz
 * cho'zilgan bo'lishi mumkin, lekin bot qulamaydi).
 */
async function cropToSlideBox(dataUri) {
  if (!dataUri) return dataUri;

  try {
    const commaIdx = dataUri.indexOf(',');
    const base64Part = commaIdx >= 0 ? dataUri.slice(commaIdx + 1) : dataUri;
    const inputBuffer = Buffer.from(base64Part, 'base64');

    const outputBuffer = await sharp(inputBuffer)
      .resize(TARGET_PX_WIDTH, TARGET_PX_HEIGHT, {
        fit: 'cover',
        position: 'attention', // eng "diqqatga sazovor" qismini markazda saqlashga harakat qiladi (yuzlar, kontrast va h.k.)
      })
      .jpeg({ quality: 88 })
      .toBuffer();

    return `data:image/jpeg;base64,${outputBuffer.toString('base64')}`;
  } catch (err) {
    console.error('[ImageEngine] Rasmni qutiga moslab kesishda xatolik, asl rasm ishlatiladi:', err.message);
    return dataUri;
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
      const raw = await downloadAsBase64(unsplashUrl);
      return await cropToSlideBox(raw);
    } catch (err) {
      console.error(`[ImageEngine] Unsplash rasmni yuklab bo'lmadi:`, err.message);
      // Yuklab bo'lmasa ham, AI-generatsiyaga o'tamiz (pastda davom etadi).
    }
  }

  const aiImage = await generateAIImage(keyword);
  return cropToSlideBox(aiImage);
};