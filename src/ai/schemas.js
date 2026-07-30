import { z } from "zod";

// 1. Planner Schema (Faqat strategiya)
export const plannerSchema = z.object({
  presentation_title: z.string(),
  target_audience: z.string(),
  tone: z.string(),
  slides: z.array(z.object({
    slide_number: z.number().min(1).max(6),
    slide_type: z.enum(["Hero", "ThreeCards", "ImageLeft", "ThreeSteps", "FourFacts", "Ending"]),
    objective: z.string(),
    key_concept: z.string()
  })).length(6) // Qat'iy 6 ta slayd
});

// 2. Content Writer Schema (Faqat matn, qat'iy uzunliklar)
export const contentSchema = z.object({
  slide_1_hero: z.object({
    title: z.string().max(50),
    subtitle: z.string().max(120)
  }),
  slide_2_three_cards: z.object({
    section_title: z.string().max(40),
    cards: z.array(z.object({
      title: z.string().max(30),
      text: z.string().max(100)
    })).length(3)
  }),
  slide_3_image_left: z.object({
    title: z.string().max(40),
    content: z.string().max(250)
  }),
  slide_4_three_steps: z.object({
    section_title: z.string().max(40),
    steps: z.array(z.object({
      step_number: z.number(),
      title: z.string().max(30),
      description: z.string().max(90)
    })).length(3)
  }),
  slide_5_four_facts: z.object({
    section_title: z.string().max(40),
    facts: z.array(z.object({
      metric: z.string().max(15),
      detail: z.string().max(60)
    })).length(4)
  }),
  slide_6_ending: z.object({
    title: z.string().max(40),
    call_to_action: z.string().max(80),
    contact_info: z.string().max(50)
  })
});

// 3. Visual AI Schema (Faqat dizayn va ranglar)
export const visualSchema = z.object({
  theme_mode: z.enum(["dark", "light"]),
  color_palette: z.object({
    primary: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
    secondary: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
    accent: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
    background: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
    card_background: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
    text_primary: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
    text_secondary: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
  })
});

// 4. Image Selector Schema (Kalit so'zlar)
// slide_6_ending_image_query qo'shildi — shu bilan yakuniy (Ending) slaydi
// ham mavzuga mos rasm oladi, avvalgidek doim standart fallback emas.
export const imageSelectorSchema = z.object({
  slide_1_hero_image_query: z.string(),
  slide_3_left_image_query: z.string(),
  slide_6_ending_image_query: z.string()
});