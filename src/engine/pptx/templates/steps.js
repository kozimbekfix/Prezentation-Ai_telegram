import { COORDS } from '../core/coords.js';
import { FONTS } from '../core/themeMapper.js';

export const addStepsSlide = (pres, slideData, colors) => {
  const slide = pres.addSlide();
  slide.background = { color: colors.bg };

  slide.addText(slideData.title, {
    x: COORDS.SLIDE_TITLE.x,
    y: COORDS.SLIDE_TITLE.y,
    w: COORDS.SLIDE_TITLE.w,
    h: COORDS.SLIDE_TITLE.h,
    color: colors.primary,
    fontFace: FONTS.TITLE,
    fontSize: 32,
    bold: true
  });

  const items = slideData.items || [];
  const MAX_STEPS = 3;

  for (let i = 0; i < Math.min(items.length, MAX_STEPS); i++) {
    const item = items[i];
    const colX = COORDS.THREE_STEPS.COL_X[i];

    // Qadam raqami uchun aylana (Badge)
    slide.addShape(pres.ShapeType.ellipse, {
      x: colX,
      y: COORDS.THREE_STEPS.BADGE_Y,
      w: COORDS.THREE_STEPS.BADGE_SIZE,
      h: COORDS.THREE_STEPS.BADGE_SIZE,
      fill: { color: colors.accent }
    });

    slide.addText(`${i + 1}`, {
      x: colX,
      y: COORDS.THREE_STEPS.BADGE_Y,
      w: COORDS.THREE_STEPS.BADGE_SIZE,
      h: COORDS.THREE_STEPS.BADGE_SIZE,
      color: "FFFFFF",
      fontFace: FONTS.TITLE,
      fontSize: 16,
      bold: true,
      align: pres.AlignH.center,
      valign: pres.AlignV.middle
    });

    // Qadam sarlavhasi
    slide.addText(item.title, {
      x: colX,
      y: COORDS.THREE_STEPS.TITLE_Y,
      w: COORDS.THREE_STEPS.STEP_W,
      h: 0.6,
      color: colors.primary,
      fontFace: FONTS.TITLE,
      fontSize: 18,
      bold: true
    });

    // Qadam matni
    slide.addText(item.description, {
      x: colX,
      y: COORDS.THREE_STEPS.DESC_Y,
      w: COORDS.THREE_STEPS.STEP_W,
      h: COORDS.THREE_STEPS.DESC_H,
      color: colors.text,
      fontFace: FONTS.BODY,
      fontSize: 14,
      valign: pres.AlignV.top
    });
  }
};