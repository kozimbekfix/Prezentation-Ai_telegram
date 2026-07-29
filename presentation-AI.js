// presentation-AI.js
// Модуль отвечает за общение с ИИ (Google Gemini): отправляет тему
// презентации и получает обратно строго структурированный JSON со слайдами.
//
// Эта версия заменяет ai.js (OpenRouter) на Google AI Studio (Gemini).
// Использовать вместо ai.js: require('./presentation-AI') в index.js.

const axios = require('axios');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Формирует промпт, который жёстко требует от модели
 * вернуть ТОЛЬКО валидный JSON нужной структуры.
 */
function buildPrompt(topic) {
  return `Ты помощник, который генерирует структуру презентаций.
Твоя задача — вернуть СТРОГО валидный JSON без каких-либо пояснений,
без markdown-разметки (без \`\`\`), без лишнего текста до или после JSON.

Формат JSON должен быть ТОЧНО таким:
{
  "title": "Название презентации",
  "slides": [
    {
      "slideNumber": 1,
      "title": "Заголовок слайда",
      "bullets": ["Пункт первый", "Пункт второй", "Пункт третий"]
    }
  ]
}

Требования:
- Сделай от 6 до 10 слайдов.
- Первый слайд — титульный (можно с 1-2 bullets или пустым списком bullets).
- Последний слайд — заключение/выводы.
- В каждом слайде от 3 до 5 пунктов bullets.
- Пункты должны быть краткими (не длиннее одного предложения).
- Верни ответ на русском языке, если тема дана на русском.

Тема презентации: "${topic}"`;
}

/**
 * Достаёт JSON-объект из текстового ответа модели.
 * Gemini обычно возвращает чистый JSON (особенно с responseMimeType:
 * "application/json"), но на всякий случай подстраховываемся —
 * вдруг модель всё равно обернёт ответ в ```json ... ``` или добавит
 * текст вокруг.
 */
function extractJson(rawText) {
  if (!rawText) {
    throw new Error('Пустой ответ от ИИ');
  }

  let text = rawText.trim();

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch) {
    text = fencedMatch[1].trim();
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(text);
}

/**
 * Проверяет и нормализует структуру данных, полученных от ИИ,
 * чтобы presentation.js мог безопасно на неё полагаться.
 */
function normalizeStructure(data, fallbackTitle) {
  if (!data || typeof data !== 'object') {
    throw new Error('Некорректная структура JSON от ИИ');
  }

  const title = typeof data.title === 'string' && data.title.trim()
    ? data.title.trim()
    : fallbackTitle;

  if (!Array.isArray(data.slides) || data.slides.length === 0) {
    throw new Error('ИИ не вернул список слайдов');
  }

  const slides = data.slides.map((slide, index) => {
    const slideTitle = typeof slide.title === 'string' && slide.title.trim()
      ? slide.title.trim()
      : `Слайд ${index + 1}`;

    let bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
    bullets = bullets
      .filter((b) => typeof b === 'string' && b.trim().length > 0)
      .map((b) => b.trim());

    return {
      slideNumber: Number.isInteger(slide.slideNumber) ? slide.slideNumber : index + 1,
      title: slideTitle,
      bullets,
    };
  });

  return { title, slides };
}

/**
 * Отправляет запрос к Google Gemini и возвращает готовую
 * нормализованную структуру презентации.
 *
 * @param {string} topic - тема презентации от пользователя
 * @returns {Promise<{title: string, slides: Array}>}
 */
async function generatePresentationStructure(topic) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!apiKey) {
    throw new Error('Не задан GEMINI_API_KEY в .env');
  }

  const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

  const response = await axios.post(
    url,
    {
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPrompt(topic) }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        // Просим Gemini вернуть чистый JSON без markdown-обёртки —
        // это официальная возможность Gemini API, снижает шанс мусора в ответе.
        responseMimeType: 'application/json',
      },
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60_000,
    }
  );

  const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = extractJson(rawText);
  return normalizeStructure(parsed, topic);
}

module.exports = { generatePresentationStructure };
