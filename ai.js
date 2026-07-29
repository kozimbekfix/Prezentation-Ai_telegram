// ai.js
// Модуль отвечает за общение с ИИ: отправляет тему презентации
// и получает обратно строго структурированный JSON со слайдами.

const axios = require('axios');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Формирует системный промпт, который жёстко требует от модели
 * вернуть ТОЛЬКО валидный JSON нужной структуры.
 */
function buildSystemPrompt() {
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
- Верни ответ на русском языке, если тема дана на русском.`;
}

/**
 * Достаёт JSON-объект из текстового ответа модели.
 * Некоторые модели всё равно оборачивают ответ в ```json ... ```
 * или добавляют текст вокруг — на этот случай делаем аккуратный парсинг.
 */
function extractJson(rawText) {
  if (!rawText) {
    throw new Error('Пустой ответ от ИИ');
  }

  let text = rawText.trim();

  // Убираем возможные markdown-ограждения ```json ... ``` или ``` ... ```
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch) {
    text = fencedMatch[1].trim();
  }

  // Если модель всё равно что-то добавила до/после JSON — вырезаем
  // содержимое между первой '{' и последней '}'.
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
 * Отправляет запрос к ИИ через OpenRouter и возвращает
 * готовую нормализованную структуру презентации.
 *
 * @param {string} topic - тема презентации от пользователя
 * @returns {Promise<{title: string, slides: Array}>}
 */
async function generatePresentationStructure(topic) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';

  if (!apiKey) {
    throw new Error('Не задан OPENROUTER_API_KEY в .env');
  }

  const response = await axios.post(
    OPENROUTER_URL,
    {
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: `Тема презентации: "${topic}"` },
      ],
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Эти два заголовка опциональны, но OpenRouter рекомендует их указывать
        'HTTP-Referer': 'https://t.me',
        'X-Title': 'tg-pptx-bot',
      },
      timeout: 60_000,
    }
  );

  const rawText = response.data?.choices?.[0]?.message?.content;
  const parsed = extractJson(rawText);
  return normalizeStructure(parsed, topic);
}

module.exports = { generatePresentationStructure };
