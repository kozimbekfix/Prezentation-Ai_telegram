/**
 * PptxGenJS kordinatalar va o'lchamlar tizimi.
 * Standart o'lcham: 16:9 Widescreen (13.33 x 7.5 inches)
 * Barcha o'lchamlar dyuymlarda (inches) berilgan.
 */

export const CANVAS = { width: 13.33, height: 7.5 };
export const MARGIN = { left: 0.8, top: 0.6, right: 0.8, bottom: 0.6 };

export const COORDS = {
  // Barcha slaydlar uchun umumiy sarlavha kordinatalari (Hero va Ending dan tashqari)
  SLIDE_TITLE: { x: MARGIN.left, y: MARGIN.top, w: 11.73, h: 0.8 },

  // Slayd 1: HERO
  HERO: {
    BADGE: { x: 0.8, y: 1.8, w: 11.73, h: 0.5 },
    TITLE: { x: 0.8, y: 2.5, w: 11.73, h: 2.2 },
    SUBTITLE: { x: 1.5, y: 4.9, w: 10.33, h: 1.5 },
  },

  // Slayd 2: THREE CARDS
  THREE_CARDS: {
    // 3 ta ustun uchun X kordinatalari va o'lchamlar
    CARD_W: 3.64,
    CARD_H: 5.1,
    CARD_Y: 1.6,
    COL_X: [0.8, 4.84, 8.88], // X: 0.8 + (3.64 + 0.4 gap) * index
    TEXT_PAD_X: 0.3,
    HEADER_Y: 1.9,
    BODY_Y: 2.7
  },

  // Slayd 3: IMAGE LEFT
  IMAGE_LEFT: {
    IMG: { x: 0.8, y: MARGIN.top, w: 5.5, h: 6.3 }, // Chap taraf 50%
    TITLE: { x: 6.7, y: MARGIN.top, w: 5.8, h: 0.8 },
    BULLET_W: 5.8,
    BULLET_H: 1.5,
    BULLET_X: 6.7,
    BULLET_Y_START: 1.6,
    BULLET_GAP: 1.7
  },

  // Slayd 4: THREE STEPS
  THREE_STEPS: {
    STEP_W: 3.64,
    COL_X: [0.8, 4.84, 8.88],
    BADGE_Y: 1.8,
    BADGE_SIZE: 0.8,
    TITLE_Y: 2.8,
    DESC_Y: 3.5,
    DESC_H: 3.2
  },

  // Slayd 5: FOUR FACTS (2x2 Grid)
  FOUR_FACTS: {
    CARD_W: 5.66,
    CARD_H: 2.35,
    COL_X: [0.8, 6.87], // Chap va o'ng ustunlar
    ROW_Y: [1.7, 4.40], // Yuqori va pastki qatorlar
    TEXT_PAD: 0.3,
    DETAIL_OFFSET_Y: 1.1
  },

  // Slayd 6: ENDING
  ENDING: {
    TITLE: { x: 0.8, y: 2.0, w: 11.73, h: 1.2 },
    SUBTITLE: { x: 1.5, y: 3.3, w: 10.33, h: 1.0 },
    CTA_BOX: { x: 4.66, y: 4.7, w: 4.0, h: 0.9 }
  }
};