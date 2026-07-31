import { plannerSchema, contentSchema, visualSchema, imageSelectorSchema, referatSchema } from "./schemas.js";
import { withGeminiKey, keyCount } from "./geminiPool.js";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

// Matn generatsiyasi uchun model nomi — kalitlarning o'zi va navbat/cooldown
// holati endi geminiPool.js'da BOSHQARILADI (imageEngine.js bilan umumiy),
// bu yerda faqat qaysi modelni chaqirishni belgilaymiz.
const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL || "gemini-flash-latest";

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

  // OpenRouter (OpenAI-moslashgan) javobi token sonini `usage.total_tokens`
  // maydonida beradi — buni Gemini'ning `usageMetadata.totalTokenCount`
  // shakliga moslab qaytaramiz, shunda chaqiruvchi kod ikkala provayderni
  // ham bir xil interfeys orqali (token hisobini ham) ishlata oladi.
  const totalTokenCount = response.data?.usage?.total_tokens || 0;

  // Chaqiruvchi kod har doim `result.response.text()` shaklida foydalanadi
  // (Gemini SDK'ning javob formatiga o'xshatib) — shu bilan pipeline'ning
  // qolgan qismini o'zgartirmasdan barcha provayderlarni bir xil interfeys
  // orqali ishlatishimiz mumkin.
  return { response: { text: () => text, usageMetadata: { totalTokenCount } } };
}

export class PresentationAIPipeline {

  // Shu pipeline instansi davomida (bitta prezentatsiya/referat generatsiyasi
  // uchun) sarflangan JAMI token soni — /usertokens admin buyrug'i uchun
  // foydalanuvchi hisobiga yozib qo'yiladi (index.js worker qismida).
  totalTokens = 0;

  // Umumiy kalit havuzi (geminiPool.js) orqali round-robin tartibida
  // sinab ko'radi — bu HAVUZ endi imageEngine.js (rasm generatsiyasi)
  // bilan ham BIRGA ishlatiladi, shuning uchun bitta kalit faqat matn
  // yoki faqat rasm chaqiruvlaridan emas, ikkalasidan ham teng "ulush"
  // oladi. Barcha kalitlar tugagandan keyingina OpenRouter zaxira
  // provayderga murojaat qiladi.
  async generateWithRetry(prompt) {
    if (keyCount === 0 && process.env.OPENROUTER_API_KEY) {
      const result = await callOpenRouterFallback(prompt);
      this.totalTokens += result?.response?.usageMetadata?.totalTokenCount || 0;
      return result;
    }

    try {
      const result = await withGeminiKey((client) =>
        client
          .getGenerativeModel({
            model: GEMINI_MODEL_NAME,
            generationConfig: { responseMimeType: "application/json" },
          })
          .generateContent(prompt)
      );
      this.totalTokens += result?.response?.usageMetadata?.totalTokenCount || 0;
      return result;
    } catch (error) {
      // Barcha kalitlar band/limitda ekan — zaxira provayderga o'tamiz.
      if (process.env.OPENROUTER_API_KEY) {
        console.warn(`[AI Pool] Barcha ${keyCount} ta Gemini kalit band. OpenRouter (${OPENROUTER_MODEL}) ishlatilmoqda...`);
        try {
          const result = await callOpenRouterFallback(prompt);
          this.totalTokens += result?.response?.usageMetadata?.totalTokenCount || 0;
          return result;
        } catch (fallbackError) {
          console.error("[AI Fallback] OpenRouter ham muvaffaqiyatsiz bo'ldi:", fallbackError.message);
        }
      }
      throw error;
    }
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
          images,
          tokensUsed: this.totalTokens
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
      return { isSuccess: true, data: { content, pages: safePages, tokensUsed: this.totalTokens } };
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