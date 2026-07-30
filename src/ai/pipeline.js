import { GoogleGenerativeAI } from "@google/generative-ai";
import { plannerSchema, contentSchema, visualSchema, imageSelectorSchema, referatSchema } from "./schemas.js";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

// --- KO'P KALITLI GEMINI HAVUZI (round-robin) ---
// Google'ning bepul tarif limiti API KALITIGA emas, balki LOYIHAGA (Google
// Cloud project) bog'liq. Shuning uchun bitta loyihada bir nechta kalit
// yaratish foyda bermaydi — har biri MUSTAQIL loyihada bo'lishi shart.
// Bunday kalitlar GEMINI_API_KEYS o'zgaruvchisida vergul bilan ajratib
// yoziladi:
//   GEMINI_API_KEYS=kalit1,kalit2,kalit3,kalit4
// Orqaga moslik uchun eski GEMINI_API_KEY (bitta kalit) ham hali ishlaydi.
const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL || "gemini-flash-latest";

const geminiKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

if (geminiKeys.length === 0) {
  console.error("[Pipeline] Ogohlantirish: GEMINI_API_KEY yoki GEMINI_API_KEYS .env'da topilmadi!");
}

// Har bir kalit uchun alohida model instansi tayyorlaymiz.
const geminiModels = geminiKeys.map((key) =>
  new GoogleGenerativeAI(key).getGenerativeModel({
    model: GEMINI_MODEL_NAME,
    generationConfig: { responseMimeType: "application/json" },
  })
);

// Har bir kalit uchun "bu vaqtgacha band/limitda" belgisi (millisekund,
// Date.now() bilan solishtiriladi). Kalit 429/503 bersa, shu kalit 1
// daqiqaga chetlashtiriladi va navbat KEYINGI kalitga o'tadi.
const KEY_COOLDOWN_MS = 60_000; // 1 daqiqa
const keyCooldownUntil = new Array(geminiKeys.length).fill(0);

// Round-robin boshlanish nuqtasi — har chaqiruvda keyingi kalitdan
// boshlanadi, shunda yuklama barcha kalitlar orasida teng taqsimlanadi
// (doim bitta kalit "urib" qolmaydi).
let nextKeyIndex = 0;

function isKeyOnCooldown(idx) {
  return Date.now() < keyCooldownUntil[idx];
}

function markKeyOnCooldown(idx, reason) {
  keyCooldownUntil[idx] = Date.now() + KEY_COOLDOWN_MS;
  console.warn(
    `[AI Pool] Gemini kalit #${idx + 1}/${geminiKeys.length} ${reason} sababli ` +
    `1 daqiqaga chetlashtirildi. Navbat keyingi kalitga o'tmoqda...`
  );
}

// --- ZAXIRA (FALLBACK) AI: OpenRouter ---
// Barcha Gemini kalitlari bir vaqtning o'zida limitga uchrasa (bir nechta
// kalit bo'lsa juda kam uchraydigan holat), OPENROUTER_API_KEY sozlangan
// bo'lsa, so'rov shu yerga yo'naltiriladi. Bepul model ro'yxati o'zgarib
// turadi — standart model ishlamay qolsa, https://openrouter.ai/models?max_price=0
// dan boshqasini tanlab OPENROUTER_MODEL'ga yozing.
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat:free";

async function callOpenRouterFallback(prompt) {
  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: OPENROUTER_MODEL,
      messages: [
        {
          role: "system",
          content: "You return ONLY strictly valid JSON. No markdown, no code fences, no explanations — just the raw JSON object.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 60_000,
    }
  );

  let text = response.data?.choices?.[0]?.message?.content || "";
  // Ba'zi bepul modellar ko'rsatmaga qaramay ```json qobig'ini qo'shib
  // yuborishi mumkin — shuni tozalaymiz.
  text = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

  // Chaqiruvchi kod har doim `result.response.text()` shaklida foydalanadi
  // (Gemini SDK'ning javob formatiga o'xshatib) — shu bilan pipeline'ning
  // qolgan qismini o'zgartirmasdan barcha provayderlarni bir xil interfeys
  // orqali ishlatishimiz mumkin.
  return { response: { text: () => text } };
}

export class PresentationAIPipeline {

  // Avval mavjud Gemini kalitlarini round-robin tartibida sinab ko'radi
  // (har biri band/limitda bo'lsa — keyingisiga o'tadi). Barcha kalitlar
  // tugagandan keyingina OpenRouter zaxira provayderga murojaat qiladi.
  async generateWithRetry(prompt) {
    if (geminiKeys.length === 0 && process.env.OPENROUTER_API_KEY) {
      return await callOpenRouterFallback(prompt);
    }

    const startIndex = nextKeyIndex;
    let lastError = null;

    for (let i = 0; i < geminiKeys.length; i++) {
      const idx = (startIndex + i) % geminiKeys.length;

      if (isKeyOnCooldown(idx)) continue;

      try {
        const result = await geminiModels[idx].generateContent(prompt);
        // Keyingi chaqiruv navbatdagi kalitdan boshlansin — yuklama teng taqsimlanadi.
        nextKeyIndex = (idx + 1) % geminiKeys.length;
        return result;
      } catch (error) {
        const status = error?.status || error?.response?.status;
        const isRetryable = status === 503 || status === 429;
        lastError = error;

        if (isRetryable) {
          markKeyOnCooldown(idx, status === 429 ? "429 (limit/kvota)" : "503 (band)");
          continue; // keyingi kalitni sinaymiz
        }

        throw error; // limit bilan bog'liq bo'lmagan xato — darhol tashlaymiz
      }
    }

    // Barcha kalitlar band/limitda ekan — zaxira provayderga o'tamiz.
    if (process.env.OPENROUTER_API_KEY) {
      console.warn(`[AI Pool] Barcha ${geminiKeys.length} ta Gemini kalit band. OpenRouter (${OPENROUTER_MODEL}) ishlatilmoqda...`);
      try {
        return await callOpenRouterFallback(prompt);
      } catch (fallbackError) {
        console.error("[AI Fallback] OpenRouter ham muvaffaqiyatsiz bo'ldi:", fallbackError.message);
      }
    }

    throw lastError || new Error("Barcha AI provayderlar mavjud emas.");
  }
  
  // Til kodini AI uchun tushunarli to'liq nomga o'giramiz.
  static LANGUAGE_NAMES = {
    ru: "Russian (Русский)",
    uz: "Uzbek (O'zbek tili, Latin script)",
  };

  async generateFullPresentation(topic, language = "ru") {
    const languageName = PresentationAIPipeline.LANGUAGE_NAMES[language] || PresentationAIPipeline.LANGUAGE_NAMES.ru;

    try {
      console.log(`[Pipeline] 1. Planner AI ishga tushdi... (til: ${languageName})`);
      const plan = await this.runPlanner(topic, languageName);

      console.log("[Pipeline] 2. Content Writer AI ishga tushdi...");
      const content = await this.runWriter(topic, plan, languageName);

      console.log("[Pipeline] 3. Visual AI ishga tushdi...");
      const design = await this.runVisual(topic, content);

      console.log("[Pipeline] 4. Image Selector AI ishga tushdi...");
      const images = await this.runImageSelector(topic, content);

      // Yakuniy yig'ilgan ma'lumot
      return {
        isSuccess: true,
        data: {
          plan,
          content,
          design,
          images
        }
      };

    } catch (error) {
      console.error("[Pipeline Error]", error);
      return { isSuccess: false, error: error.message };
    }
  }

  // Har bir A4 bet ~ taxminan 280-320 so'zga to'g'ri keladi (12pt,
  // 1.5 interval, standart chegaralar bilan). Shu asosda AI'ga necha
  // so'zlik matn yozish kerakligini aniq ko'rsatamiz — aks holda AI
  // ba'zan juda qisqa yoki juda uzun matn yozib, sahifalar soni
  // so'ralganidan farq qilib ketishi mumkin.
  static WORDS_PER_PAGE = 300;

  async generateReferat(topic, language = "ru", pages = 3) {
    const languageName = PresentationAIPipeline.LANGUAGE_NAMES[language] || PresentationAIPipeline.LANGUAGE_NAMES.ru;
    const safePages = Math.min(Math.max(parseInt(pages, 10) || 3, 1), 5);

    try {
      console.log(`[Pipeline/Referat] Referat AI ishga tushdi... (${safePages} bet, til: ${languageName})`);
      const content = await this.runReferatWriter(topic, languageName, safePages);
      return { isSuccess: true, data: { content, pages: safePages } };
    } catch (error) {
      console.error("[Pipeline/Referat Error]", error);
      return { isSuccess: false, error: error.message };
    }
  }

  async runReferatWriter(topic, languageName, pages) {
    // Sahifa soniga qarab bo'limlar sonini moslashtiramiz: juda qisqa
    // referatda (1 bet) 2 ta bo'lim yetarli, kattasida (5 bet) 4-5 ta.
    const sectionCount = pages <= 2 ? 2 : pages <= 3 ? 3 : pages <= 4 ? 4 : 5;
    const targetWords = pages * PresentationAIPipeline.WORDS_PER_PAGE;

    const prompt = `Role: Senior Academic Writer.
Goal: Write a formal referat (academic report/essay) on the topic: "${topic}".
Rules:
1. Write strictly in ${languageName}.
2. Structure: a title, an introduction (kirish), exactly ${sectionCount} main body
   sections (asosiy qism) each with its own heading, a conclusion (xulosa), and
   a list of references (foydalanilgan adabiyotlar).
3. Target TOTAL length across introduction + all sections + conclusion is
   approximately ${targetWords} words (this corresponds to about ${pages} A4
   page(s) of formatted text) — distribute this length across the sections
   proportionally. Do not pad with repetition to hit the count; write dense,
   substantive academic content.
4. Tone: formal, academic, objective, well-organized, no fluff, no invented
   statistics or fabricated study results.
5. Do not mention AI, ChatGPT, or how this text was generated anywhere.
6. references: provide 3-8 plausible, topic-relevant reference entries in a
   standard bibliographic style (author/organization, title, year where
   applicable). If exact real sources are uncertain, use general authoritative
   source types (e.g. official statistics agencies, well-known textbooks on
   the subject) rather than inventing suspiciously specific fake citations.
Return strictly as JSON matching this schema:
${JSON.stringify(referatSchema.shape, null, 2)}`;

    const result = await this.generateWithRetry(prompt);
    const parsed = JSON.parse(result.response.text());
    return referatSchema.parse(parsed);
  }

  async runPlanner(topic, languageName) {
    const prompt = `Role: Senior Product Strategist.
Goal: Create a presentation structure for the topic: "${topic}".
Rules: 
1. Exactly 6 slides.
2. Order: Hero, ThreeCards, ImageLeft, ThreeSteps, FourFacts, Ending.
3. Write the "objective" and "key_concept" fields in ${languageName}.
Return strictly as JSON matching this schema:
${JSON.stringify(plannerSchema.shape, null, 2)}`;

    const result = await this.generateWithRetry(prompt);
    const parsed = JSON.parse(result.response.text());
    return plannerSchema.parse(parsed); // Zod orqali tekshirish
  }

  async runWriter(topic, plan, languageName) {
    const prompt = `Role: Senior Copywriter.
Goal: Write presentation content based on this plan: ${JSON.stringify(plan)}
Topic: ${topic}
Rules:
1. Write ALL text fields (titles, subtitles, cards, steps, facts, everything)
   strictly in ${languageName}. Do not mix in other languages.
2. No fluff. Be highly professional.
3. Respect character limits strictly. EVERY field below has a HARD MAXIMUM
   character count — never exceed it:
   - slide_1_hero.title: <=42 chars
   - slide_1_hero.subtitle: <=120 chars
   - slide_2_three_cards.section_title: <=40 chars
   - slide_2_three_cards.cards[].title: <=30 chars
   - slide_2_three_cards.cards[].text: <=100 chars
   - slide_3_image_left.title: <=34 chars
   - slide_3_image_left.content: <=250 chars
   - slide_4_three_steps.section_title: <=40 chars
   - slide_4_three_steps.steps[].title: <=30 chars
   - slide_4_three_steps.steps[].description: <=90 chars
   - slide_5_four_facts.section_title: <=40 chars
   - slide_5_four_facts.facts[].metric: <=15 chars
   - slide_5_four_facts.facts[].detail: <=60 chars
   - slide_6_ending.title: <=34 chars
   - slide_6_ending.summary: <=220 chars
4. slide_6_ending must be a genuine, thoughtful CONCLUSION of the topic —
   a closing summary of the key takeaway. It must NEVER be a sales pitch,
   advertisement, invented email/phone/contact info, or call to "invest",
   "contact us", "buy now", etc. Do not mention AI, ChatGPT, or how this
   presentation was made anywhere in the content.
Return strictly as JSON matching this schema:
${JSON.stringify(contentSchema.shape, null, 2)}`;

    const result = await this.generateWithRetry(prompt);
    const parsed = JSON.parse(result.response.text());

    // Xavfsizlik to'ri: Gemini promptdagi chegaralarni baribir vaqti-vaqti
    // bilan oshirib yuborishi mumkin. Zod validatsiyasi (contentSchema.parse)
    // shu sababli qulab tushmasligi uchun, sxemadagi (src/ai/schemas.js)
    // BARCHA qattiq belgi chegarali maydonlarni validatsiyadan OLDIN
    // xavfsiz qisqartiramiz. Bu ro'yxat contentSchema bilan qo'lda
    // sinxronlashtirilgan — sxema o'zgarsa, shu yerni ham yangilang.
    this.sanitizeContentLengths(parsed);

    return contentSchema.parse(parsed);
  }

  sanitizeContentLengths(parsed) {
    const truncate = (str, max) => {
      if (typeof str !== "string" || str.length <= max) return str;
      // Sўzни ярмида эмас, охирги бўшлиқдан кесамиз — токи "structur…" каби
      // ярим сўзлар билан тугамасин.
      const sliced = str.slice(0, max - 1);
      const lastSpace = sliced.lastIndexOf(" ");
      const safeSlice = lastSpace > max * 0.6 ? sliced.slice(0, lastSpace) : sliced;
      return safeSlice.trimEnd() + "…";
    };

    const setIfExists = (obj, key, max) => {
      if (obj && typeof obj === "object" && key in obj) {
        obj[key] = truncate(obj[key], max);
      }
    };

    if (!parsed || typeof parsed !== "object") return;

    setIfExists(parsed.slide_1_hero, "title", 50);
    setIfExists(parsed.slide_1_hero, "subtitle", 120);

    setIfExists(parsed.slide_2_three_cards, "section_title", 40);
    (parsed.slide_2_three_cards?.cards || []).forEach((card) => {
      setIfExists(card, "title", 30);
      setIfExists(card, "text", 100);
    });

    setIfExists(parsed.slide_3_image_left, "title", 40);
    setIfExists(parsed.slide_3_image_left, "content", 250);

    setIfExists(parsed.slide_4_three_steps, "section_title", 40);
    (parsed.slide_4_three_steps?.steps || []).forEach((step) => {
      setIfExists(step, "title", 30);
      setIfExists(step, "description", 90);
    });

    setIfExists(parsed.slide_5_four_facts, "section_title", 40);
    (parsed.slide_5_four_facts?.facts || []).forEach((fact) => {
      setIfExists(fact, "metric", 15);
      setIfExists(fact, "detail", 60);
    });

    setIfExists(parsed.slide_6_ending, "title", 40);
    setIfExists(parsed.slide_6_ending, "summary", 220);
  }

  async runVisual(topic, content) {
    const prompt = `Role: Senior Presentation Designer.
Goal: Choose a cohesive color palette and theme mode for a presentation on: "${topic}".
Content overview: ${JSON.stringify(content)}
Rules:
1. Pick either a "dark" or "light" theme_mode that best fits the topic's mood.
2. All colors must be valid hex codes (e.g. "#1F2937").
3. Ensure strong contrast between background/card_background and text_primary/text_secondary
   so the text stays readable.
4. accent should stand out clearly against background and card_background.
Return strictly as JSON matching this schema:
${JSON.stringify(visualSchema.shape, null, 2)}`;

    const result = await this.generateWithRetry(prompt);
    const parsed = JSON.parse(result.response.text());
    return visualSchema.parse(parsed);
  }

  async runImageSelector(topic, content) {
    const prompt = `Role: Visual Research Assistant.
Goal: Suggest short, specific stock-photo search queries (in English, for best
image-search results) for 3 slides of a presentation on: "${topic}".
Content overview: ${JSON.stringify(content)}
Rules:
1. Each query should be 2-5 words, concrete and visual (not abstract concepts).
2. slide_1_hero_image_query: a striking, wide, topic-representative image.
3. slide_3_left_image_query: an image illustrating the specific point made in slide_3_image_left.
4. slide_6_ending_image_query: a fitting closing/summary image for the topic.
Return strictly as JSON matching this schema:
${JSON.stringify(imageSelectorSchema.shape, null, 2)}`;

    const result = await this.generateWithRetry(prompt);
    const parsed = JSON.parse(result.response.text());
    return imageSelectorSchema.parse(parsed);
  }
}