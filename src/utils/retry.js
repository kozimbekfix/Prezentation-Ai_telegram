// Vaqtinchalik (tarmoq uzilishi, timeout va h.k.) xatolarda so'rovni
// avtomatik qayta urinib ko'radigan umumiy yordamchi. Unsplash va Gemini
// so'rovlarida ishlatiladi — bitta tasodifiy xato butun bosqichni
// (rasmsiz qolish yoki generatsiya to'xtashi) buzib qo'ymasligi uchun.
//
// Exponential backoff: har urinishdan keyin kutish vaqti 2 baravar oshadi
// (masalan baseDelayMs=500 bo'lsa: 500ms, 1000ms, 2000ms...).

const DEFAULT_RETRIES = 1;
const DEFAULT_BASE_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `fn(attemptIndex)` funksiyasini chaqiradi. Xato bersa, `retries` marta
 * qayta urinadi (jami `retries + 1` marta chaqiriladi), har safar orasida
 * exponential backoff kutadi. Barcha urinishlar muvaffaqiyatsiz bo'lsa,
 * oxirgi xatoni tashlaydi.
 *
 * @param {(attempt: number) => Promise<any>} fn
 * @param {{ retries?: number, baseDelayMs?: number, label?: string, shouldRetry?: (err: Error) => boolean }} options
 */
export async function withRetry(fn, options = {}) {
  const {
    retries = DEFAULT_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    label = 'so\'rov',
    shouldRetry = () => true,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === retries;
      if (isLastAttempt || !shouldRetry(error)) {
        throw error;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(
        `[Retry] ${label}: urinish ${attempt + 1}/${retries + 1} muvaffaqiyatsiz ` +
        `(${error.message}) — ${delay}ms dan keyin qayta urinamiz...`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
