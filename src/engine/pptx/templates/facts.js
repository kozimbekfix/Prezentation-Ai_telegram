import { COORDS } from '../core/coords.js';
import { FONTS } from '../core/themeMapper.js';

export const addFactsSlide = (pres, slideData, colors) => {
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
  const MAX_FACTS = 4;

  for (let i = 0; i < Math.min(items.length, MAX_FACTS); i++) {
    const item = items[i];
    const colIndex = i % 2; 
    const rowIndex = Math.floor(i / 2); 

    const x = COORDS.FOUR_FACTS.COL_X[colIndex];
    const y = COORDS.FOUR_FACTS.ROW_Y[rowIndex];

    // Karta foni
    slide.addShape(pres.ShapeType.rect, {
      x: x,
      y: y,
      w: COORDS.FOUR_FACTS.CARD_W,
      h: COORDS.FOUR_FACTS.CARD_H,
      fill: { color: colors.secondary }
    });

    // Sarlavha
    slide.addText(item.title, {
      x: x + COORDS.FOUR_FACTS.TEXT_PAD,
      y: y + COORDS.FOUR_FACTS.TEXT_PAD,
      w: COORDS.FOUR_FACTS.CARD_W - (COORDS.FOUR_FACTS.TEXT_PAD * 2),
      h: 0.6,
      color: colors.accent,
      fontFace: FONTS.TITLE,
      fontSize: 20,
      bold: true
    });

    // Izoh
    slide.addText(item.description, {
      x: x + COORDS.FOUR_FACTS.TEXT_PAD,
      y: y + 0.9,
      w: COORDS.FOUR_FACTS.CARD_W - (COORDS.FOUR_FACTS.TEXT_PAD * 2),
      h: 1.2,
      color: colors.text,
      fontFace: FONTS.BODY,
      fontSize: 13,
      valign: pres.AlignV.top
    });
  }
};