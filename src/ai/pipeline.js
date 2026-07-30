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
  
  async generateFullPresentation(topic) {
    try {
      console.log("[Pipeline] 1. Planner AI ishga tushdi...");
      const plan = await this.runPlanner(topic);

      console.log("[Pipeline] 2. Content Writer AI ishga tushdi...");
      const content = await this.runWriter(topic, plan);

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

  async runPlanner(topic) {
    const prompt = `Role: Senior Product Strategist.
Goal: Create a presentation structure for the topic: "${topic}".
Rules: 
1. Exactly 6 slides.
2. Order: Hero, ThreeCards, ImageLeft, ThreeSteps, FourFacts, Ending.
Return strictly as JSON matching this schema:
${JSON.stringify(plannerSchema.shape, null, 2)}`;

    const result = await this.generateWithRetry(prompt);
    const parsed = JSON.parse(result.response.text());
    return plannerSchema.parse(parsed); // Zod orqali tekshirish
  }

  async runWriter(topic, plan) {
    const prompt = `Role: Senior Copywriter.
Goal: Write presentation content based on this plan: ${JSON.stringify(plan)}
Topic: ${topic}
Rules:
1. No fluff. Be highly professional.
2. Respect character limits strictly. EVERY field below has a HARD MAXIMUM
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
      return str.slice(0, max - 1).trimEnd() + "…";
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