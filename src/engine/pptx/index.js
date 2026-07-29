import pptxgen from "pptxgenjs";
import path from "path";
import os from "os";

// Shablonlarni chaqirib olamiz (keyingi qadamda bularni to'g'rilaymiz)
import { buildHeroSlide } from "./templates/hero.js";
import { buildCardsSlide } from "./templates/cards.js";
import { buildImageLeftSlide } from "./templates/imageLeft.js";
import { buildStepsSlide } from "./templates/steps.js";
import { buildFactsSlide } from "./templates/facts.js";
import { buildEndingSlide } from "./templates/ending.js";

export class PresentationEngine {
  /**
   * AI dan kelgan ma'lumotlar asosida PPTX fayl yaratadi
   * @param {Object} aiData - Pipeline'dan kelgan to'liq data (content, design, images)
   * @param {String} uniqueId - Fayl nomlanishi uchun unikal ID
   */
  async createPresentation(aiData, uniqueId) {
    try {
      console.log("[PPTX Engine] Taqdimot yig'ilishi boshlandi...");
      const pptx = new pptxgen();
      
      // Zamonaviy ekranlar uchun keng format
      pptx.layout = "LAYOUT_16x9";
      
      const { content, design, images } = aiData;

      // 1. Hero Slayd
      await buildHeroSlide(pptx, content.slide_1_hero, design, images.slide_1_hero_image_query);
      
      // 2. Three Cards Slayd
      await buildCardsSlide(pptx, content.slide_2_three_cards, design);
      
      // 3. Image Left Slayd
      await buildImageLeftSlide(pptx, content.slide_3_image_left, design, images.slide_3_left_image_query);
      
      // 4. Three Steps Slayd
      await buildStepsSlide(pptx, content.slide_4_three_steps, design);
      
      // 5. Four Facts Slayd
      await buildFactsSlide(pptx, content.slide_5_four_facts, design);
      
      // 6. Professional Ending Slayd
      await buildEndingSlide(pptx, content.slide_6_ending, design);

      // Faylni vaqtinchalik xotiraga (temp) saqlash
      const tempDir = os.tmpdir();
      const fileName = `presentation_${uniqueId}.pptx`;
      const filePath = path.join(tempDir, fileName);

      await pptx.writeFile({ fileName: filePath });
      console.log(`[PPTX Engine] Muvaffaqiyatli saqlandi: ${filePath}`);
      
      return filePath;
    } catch (error) {
      console.error("[PPTX Engine Error]", error);
      throw new Error("PPTX generatsiyasida xatolik yuz berdi");
    }
  }
}