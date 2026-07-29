import { COORDS } from '../core/coords.js';
import { FONTS } from '../core/themeMapper.js';

export const addHeroSlide = (pres, slideData, colors) => {
  const slide = pres.addSlide();
  slide.background = { color: colors.bg };

  // Kichik yorliq (Badge)
  slide.addText("AI GENERATED PRESENTATION", {
    x: COORDS.HERO.BADGE.x,
    y: COORDS.HERO.BADGE.y,
    w: COORDS.HERO.BADGE.w,
    h: COORDS.HERO.BADGE.h,
    color: colors.accent,
    fontFace: FONTS.BODY,
    fontSize: 12,
    bold: true,
    align: pres.AlignH.center
  });

  // Asosiy Sarlavha
  slide.addText(slideData.title.toUpperCase(), {
    x: COORDS.HERO.TITLE.x,
    y: COORDS.HERO.TITLE.y,
    w: COORDS.HERO.TITLE.w,
    h: COORDS.HERO.TITLE.h,
    color: colors.primary,
    fontFace: FONTS.TITLE,
    fontSize: 44,
    bold: true,
    align: pres.AlignH.center
  });

  // Kichik sarlavha (Subtitle)
  if (slideData.subtitle) {
    slide.addText(slideData.subtitle, {
      x: COORDS.HERO.SUBTITLE.x,
      y: COORDS.HERO.SUBTITLE.y,
      w: COORDS.HERO.SUBTITLE.w,
      h: COORDS.HERO.SUBTITLE.h,
      color: colors.text,
      fontFace: FONTS.BODY,
      fontSize: 18,
      align: pres.AlignH.center
    });
  }
};