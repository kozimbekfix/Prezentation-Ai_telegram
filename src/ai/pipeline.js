import { GoogleGenerativeAI } from '@google/generative-ai';
import { presentationSchema } from './schemas.js';

/**
 * Gemini modelini ishga tushirish (Structured Outputs yordamida)
 */
const initModel = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY topilmadi! .env faylni tekshiring.");
  
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // gemini-1.5-flash tezlik uchun eng ideal variant
  return genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      temperature: 0.7, // Kreativlik darajasi
      responseMimeType: "application/json",
      responseSchema: presentationSchema, // Biz yozgan sxemaga qat'iy rioya qiladi
    }
  });
};

/**
 * Foydalanuvchi so'rovi bo'yicha prezentatsiya JSON tuzilmasini yaratish
 * 
 * @param {string} prompt - Botdan kelgan foydalanuvchi matni
 * @returns {Promise<Object>} - Tayyor strukturalangan JSON ma'lumot
 */
export const generatePresentationData = async (prompt) => {
  try {
    const model = initModel();
    
    const systemInstruction = `Sen professional prezentatsiya dizayneri va kopiraytersan. 
    Foydalanuvchining quyidagi mavzusiga asosan ma'lumotli, qiziqarli va lo'nda prezentatsiya tarkibini yaratib ber. 
    - Har bir slayd matni mantiqiy va xatosiz bo'lishi shart.
    - So'rov o'zbek tilida bo'lsa, o'zbek tilida tayyorla.
    - Slaydlar soni 5-7 ta bo'lishi maqsadga muvofiq.
    
    Foydalanuvchi so'rovi: "${prompt}"`;

    // AI ga yuborish
    const result = await model.generateContent(systemInstruction);
    const textResult = result.response.text();
    
    // JSON'ga o'girib qaytaramiz
    return JSON.parse(textResult);

  } catch (error) {
    console.error("[Gemini AI Error]:", error.message);
    throw new Error("AI xizmati hozircha band yoki xatolik yuz berdi.");
  }
};