import axios from 'axios';

// Agar rasm topilmasa, o'rniga qo'yiladigan neytral fon rasmi
const FALLBACK_IMAGE_URL = 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1080&q=80&fit=crop';
const UNSPLASH_API_URL = 'https://api.unsplash.com/search/photos';
const REQUEST_TIMEOUT_MS = 15_000;

let warnedAboutMissingKey = false;

/**
 * Kalit so'z bo'yicha Unsplash'dan rasm topadi va uni Base64 qilib qaytaradi.
 * LibreOffice oson ishlashi uchun rasm to'g'ridan-to'g'ri Base64 ga o'giriladi.
 */
export const getEmbeddedImage = async (keyword) => {
  if (!process.env.UNSPLASH_ACCESS_KEY && !warnedAboutMissingKey) {
    // Faqat bir marta ogohlantiramiz — konsolni to'ldirmaslik uchun.
    // Kalit yo'q bo'lsa, HAR BIR slayd uchun bir xil zaxira (fallback)
    // rasm ishlatiladi — bu topic'ga mos individual rasmlar emas.
    console.warn(
      '[ImageEngine] OGOHLANTIRISH: UNSPLASH_ACCESS_KEY .env da topilmadi. ' +
      'Barcha slaydlar uchun bitta standart zaxira rasm ishlatiladi. ' +
      'Mavzuga mos individual rasmlar uchun https://unsplash.com/developers ' +
      'dan bepul kalit oling va uni Render Environment sozlamalariga qo\'shing.'
    );
    warnedAboutMissingKey = true;
  }

  let targetUrl = FALLBACK_IMAGE_URL;

  // 1. URL ni aniqlash
  if (keyword && process.env.UNSPLASH_ACCESS_KEY) {
    try {
      const searchRes = await axios.get(UNSPLASH_API_URL, {
        params: { query: keyword, per_page: 1, orientation: 'landscape' },
        headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
        timeout: REQUEST_TIMEOUT_MS,
      });

      if (searchRes.data.results && searchRes.data.results.length > 0) {
        targetUrl = searchRes.data.results[0].urls.raw + '&w=1080&q=80&fit=crop';
      } else {
        console.warn(`[ImageEngine] "${keyword}" uchun natija topilmadi, zaxira rasm ishlatiladi.`);
      }
    } catch (err) {
      console.error(`[ImageEngine] Unsplash qidiruv xatosi ("${keyword}"):`, err.message);
    }
  }

  // 2. Rasmni yuklab olish va Base64 formatiga o'girish.
  // Agar aniq so'ralgan rasm yuklanmasa, standart zaxira rasmga qaytamiz —
  // shunda slayd hech qachon bo'sh (rasmsiz) qolmaydi.
  const tryDownload = async (url) => {
    const imageRes = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: REQUEST_TIMEOUT_MS,
    });
    const base64 = Buffer.from(imageRes.data, 'binary').toString('base64');
    const mimeType = imageRes.headers['content-type'] || 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
  };

  try {
    return await tryDownload(targetUrl);
  } catch (downloadErr) {
    console.error(`[ImageEngine] Rasmni yuklab bo'lmadi (${targetUrl}):`, downloadErr.message);

    if (targetUrl !== FALLBACK_IMAGE_URL) {
      try {
        console.warn('[ImageEngine] Zaxira rasmga o\'tilmoqda...');
        return await tryDownload(FALLBACK_IMAGE_URL);
      } catch (fallbackErr) {
        console.error('[ImageEngine] Zaxira rasmni ham yuklab bo\'lmadi:', fallbackErr.message);
      }
    }

    return null; // Ikkalasi ham muvaffaqiyatsiz — shablon bezakli panelga o'tadi
  }
};