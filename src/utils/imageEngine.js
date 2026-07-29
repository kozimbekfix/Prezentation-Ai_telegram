import axios from 'axios';

// Agar rasm topilmasa, o'rniga qo'yiladigan neytral fon rasmi
const FALLBACK_IMAGE_URL = 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1080&q=80&fit=crop';
const UNSPLASH_API_URL = 'https://api.unsplash.com/search/photos';

/**
 * Kalit so'z bo'yicha Unsplash'dan rasm topadi va uni Base64 qilib qaytaradi.
 * LibreOffice oson ishlashi uchun rasm to'g'ridan-to'g'ri Base64 ga o'giriladi.
 */
export const getEmbeddedImage = async (keyword) => {
  let targetUrl = FALLBACK_IMAGE_URL;

  // 1. URL ni aniqlash
  if (keyword && process.env.UNSPLASH_ACCESS_KEY) {
    try {
      const searchRes = await axios.get(UNSPLASH_API_URL, {
        params: { query: keyword, per_page: 1, orientation: 'landscape' },
        headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }
      });

      if (searchRes.data.results && searchRes.data.results.length > 0) {
        targetUrl = searchRes.data.results[0].urls.raw + '&w=1080&q=80&fit=crop';
      }
    } catch (err) {
      console.error(`[Unsplash Error] "${keyword}" uchun rasm topilmadi:`, err.message);
    }
  }

  // 2. Rasmni yuklab olish va Base64 formatiga o'girish
  try {
    const imageRes = await axios.get(targetUrl, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(imageRes.data, 'binary').toString('base64');
    const mimeType = imageRes.headers['content-type'] || 'image/jpeg';
    
    return `data:${mimeType};base64,${base64}`;
  } catch (downloadErr) {
    console.error(`[Download Error] Rasmni yuklab bo'lmadi:`, downloadErr.message);
    return null; // Agar xato bo'lsa bo'sh qaytadi, PptxGenJS buni tushunadi
  }
};