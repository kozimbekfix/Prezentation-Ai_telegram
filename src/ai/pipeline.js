import { GoogleGenerativeAI } from "@google/generative-ai";
import { plannerSchema, contentSchema, visualSchema, imageSelectorSchema } from "./schemas.js";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Biz doim eng so'nggi va tezkor modelni ishlatamiz.
// "gemini-1.5-pro" Google tomonidan o'chirilgan (404 qaytaradi), shuning uchun
// GEMINI_MODEL env-o'zgaruvchisidan olamiz, u bo'lmasa "gemini-flash-latest"
// alias'iga tushamiz — bu Google'ning doim ishlaydigan eng so'nggi flash modeliga yo'naltiradi.
const model = genAI.getGenerativeModel({ 
  model: process.env.GEMINI_MODEL || "gemini-flash-latest",
  generationConfig: { responseMimeType: "application/json" }
});

export class PresentationAIPipeline {

  // Gemini vaqti-vaqti bilan 503 ("model overloaded") yoki 429 ("rate limit")
  // qaytarishi mumkin — bular VAQTINCHALIK xatolar, kod bilan bog'liq emas.
  // Shu funksiya orqali bunday xatolarda kutib, avtomatik qayta uriniladi
  // (foydalanuvchi qo'lda qayta yozishi shart bo'lmaydi).
  async generateWithRetry(prompt, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await model.generateContent(prompt);
      } catch (error) {
        const status = error?.status || error?.response?.status;
        const isRetryable = status === 503 || status === 429;
        const isLastAttempt = attempt === maxRetries;

        if (!isRetryable || isLastAttempt) {
          throw error;
        }

        const delayMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s...
        console.warn(`[Gemini Retry] ${status} xatosi, ${delayMs}ms kutib ${attempt}/${maxRetries}-urinish qayta boshlanmoqda...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
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
          images
        }
      };

    } catch (error) {
      console.error("[Pipeline Error]", error);
      return { isSuccess: false, error: error.message };
    }
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
   - slide_1_hero.title: <=50 chars
   - slide_1_hero.subtitle: <=120 chars
   - slide_2_three_cards.section_title: <=40 chars
   - slide_2_three_cards.cards[].title: <=30 chars
   - slide_2_three_cards.cards[].text: <=100 chars
   - slide_3_image_left.title: <=40 chars
   - slide_3_image_left.content: <=250 chars
   - slide_4_three_steps.section_title: <=40 chars
   - slide_4_three_steps.steps[].title: <=30 chars
   - slide_4_three_steps.steps[].description: <=90 chars
   - slide_5_four_facts.section_title: <=40 chars
   - slide_5_four_facts.facts[].metric: <=15 chars
   - slide_5_four_facts.facts[].detail: <=60 chars
   - slide_6_ending.title: <=40 chars
   - slide_6_ending.call_to_action: <=80 chars
   - slide_6_ending.contact_info: <=50 chars
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
    setIfExists(parsed.slide_6_ending, "call_to_action", 80);
    setIfExists(parsed.slide_6_ending, "contact_info", 50);
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