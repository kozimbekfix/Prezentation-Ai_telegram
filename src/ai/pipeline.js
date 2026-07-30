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

    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());
    return plannerSchema.parse(parsed); // Zod orqali tekshirish
  }

  async runWriter(topic, plan) {
    const prompt = `Role: Senior Copywriter.
Goal: Write presentation content based on this plan: ${JSON.stringify(plan)}
Topic: ${topic}
Rules:
1. No fluff. Be highly professional.
2. Respect character limits strictly. In particular:
   - slide_5_four_facts.facts[].detail: MAXIMUM 60 characters, no exceptions.
   - slide_5_four_facts.facts[].metric: MAXIMUM 10 characters (e.g. "1402", "98%").
   - Keep every other field as short and punchy as possible.
Return strictly as JSON matching this schema:
${JSON.stringify(contentSchema.shape, null, 2)}`;

    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());

    // Xavfsizlik to'ri: Gemini ba'zan belgi chegarasidan oshirib yuborishi
    // mumkin. Zod validatsiyasi (contentSchema.parse) shu sababli qulab
    // tushmasligi uchun, ma'lum bo'lgan qattiq chegarali maydonlarni
    // validatsiyadan OLDIN xavfsiz qisqartiramiz.
    this.sanitizeContentLengths(parsed);

    return contentSchema.parse(parsed);
  }

  // Belgi chegarasi qat'iy bo'lgan maydonlarni (hozircha slide_5_four_facts)
  // limitdan oshib ketmasligi uchun tekshirib, oshgan bo'lsa qisqartiradi.
  sanitizeContentLengths(parsed) {
    const truncate = (str, max) => {
      if (typeof str !== "string" || str.length <= max) return str;
      return str.slice(0, max - 1).trimEnd() + "…";
    };

    const facts = parsed?.slide_5_four_facts?.facts;
    if (Array.isArray(facts)) {
      facts.forEach((fact) => {
        if (fact && typeof fact === "object") {
          if (fact.detail) fact.detail = truncate(fact.detail, 60);
          if (fact.metric) fact.metric = truncate(fact.metric, 10);
        }
      });
    }
  }

  async runVisual(topic, content) {
    const prompt = `Role: Senior UI/UX Designer.
Goal: Create a professional color palette based on this presentation content.
Content preview: ${JSON.stringify(content.slide_1_hero)}
Rules: Contrast must pass W3C AA standards. Returns valid HEX codes.
Return strictly as JSON matching this schema:
${JSON.stringify(visualSchema.shape, null, 2)}`;

    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());
    return visualSchema.parse(parsed);
  }

  async runImageSelector(topic, content) {
    const prompt = `Role: Stock Photography Curator.
Goal: Generate English search keywords for Unsplash based on presentation content.
Topic: ${topic}
Rules: Avoid close-up human faces. Prefer modern, minimalist, tech or business abstract imagery.
Return strictly as JSON matching this schema:
${JSON.stringify(imageSelectorSchema.shape, null, 2)}`;

    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());
    return imageSelectorSchema.parse(parsed);
  }
}