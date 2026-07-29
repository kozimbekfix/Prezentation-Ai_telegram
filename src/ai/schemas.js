import { SchemaType } from "@google/generative-ai";

/**
 * Gemini 1.5 uchun qat'iy JSON tuzilmasi.
 * Ushbu sxema orqali AI aniq 6 xil slayd turidan birini tanlashga majbur qilinadi.
 */
export const presentationSchema = {
  type: SchemaType.OBJECT,
  properties: {
    theme: {
      type: SchemaType.STRING,
      description: "Prezentatsiya dizayni uchun mavzu. Faqat quyidagilardan birini tanlang: 'modern_blue', 'dark_tech', 'nature_green', 'elegant_red', 'minimal_light'"
    },
    slides: {
      type: SchemaType.ARRAY,
      description: "Prezentatsiyadagi slaydlar ro'yxati. Odatda 5-7 ta slayd bo'lishi kerak.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: {
            type: SchemaType.STRING,
            description: "Slaydning strukturaviy turi. Faqat quyidagilardan biri: 'HERO' (bosh sahifa), 'THREE_CARDS' (3 ta ustunli ma'lumot), 'IMAGE_LEFT' (chapda rasm, o'ngda matn), 'THREE_STEPS' (3 ta qadamli jarayon), 'FOUR_FACTS' (2x2 to'rtta fakt), 'ENDING' (xulosa sahifasi)"
          },
          title: { 
            type: SchemaType.STRING, 
            description: "Slaydning asosiy sarlavhasi (qisqa va lo'nda)" 
          },
          subtitle: { 
            type: SchemaType.STRING, 
            description: "Kichik sarlavha yoki slayd haqida qisqacha ta'rif (faqat HERO va ENDING slaydlari uchun)" 
          },
          imageKeyword: { 
            type: SchemaType.STRING, 
            description: "Unsplash orqali tegishli rasm qidirish uchun 1-2 ta INGLIZCHA so'z. Masalan: 'technology', 'business meeting', 'nature'" 
          },
          items: {
            type: SchemaType.ARRAY,
            description: "Slayd ichidagi elementlar (masalan: 3 ta karta, 3 ta qadam, yoki 4 ta fakt). Faqat THREE_CARDS, THREE_STEPS, FOUR_FACTS va IMAGE_LEFT slaydlarida ishlatiladi.",
            items: {
              type: SchemaType.OBJECT,
              properties: {
                title: { type: SchemaType.STRING, description: "Element sarlavhasi" },
                description: { type: SchemaType.STRING, description: "Element izohi (maksimal 2-3 ta gap)" }
              },
              required: ["title", "description"]
            }
          }
        },
        required: ["type", "title"]
      }
    }
  },
  required: ["theme", "slides"]
};