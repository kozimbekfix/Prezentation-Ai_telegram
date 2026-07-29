import { COORDS } from '../core/coords.js';
import { FONTS } from '../core/themeMapper.js';

export const addCardsSlide = (pres, slideData, colors) => {
  const slide = pres.addSlide();
  slide.background = { color: colors.bg };

  // Umumiy Slayd Sarlavhasi
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

  // Kartalarni chizish
  const items = slideData.items || [];
  const MAX_CARDS = 3;

  for (let i = 0; i < Math.min(items.length, MAX_CARDS); i++) {
    const item = items[i];
    const colX = COORDS.THREE_CARDS.COL_X[i];

    // Karta foni
    slide.addShape(pres.ShapeType.rect, {
      x: colX,
      y: COORDS.THREE_CARDS.CARD_Y,
      w: COORDS.THREE_CARDS.CARD_W,
      h: COORDS.THREE_CARDS.CARD_H,
      fill: { color: colors.secondary }
    });

    // Karta sarlavhasi
    slide.addText(item.title, {
      x: colX + COORDS.THREE_CARDS.TEXT_PAD_X,
      y: COORDS.THREE_CARDS.HEADER_Y,
      w: COORDS.THREE_CARDS.CARD_W - (COORDS.THREE_CARDS.TEXT_PAD_X * 2),
      h: 0.8,
      color: colors.primary,
      fontFace: FONTS.TITLE,
      fontSize: 20,
      bold: true,
      valign: pres.AlignV.top
    });

    // Karta izohi
    slide.addText(item.description, {
      x: colX + COORDS.THREE_CARDS.TEXT_PAD_X,
      y: COORDS.THREE_CARDS.BODY_Y,
      w: COORDS.THREE_CARDS.CARD_W - (COORDS.THREE_CARDS.TEXT_PAD_X * 2),
      h: 3.5,
      color: colors.text,
      fontFace: FONTS.BODY,
      fontSize: 14,
      valign: pres.AlignV.top
    });
  }
};