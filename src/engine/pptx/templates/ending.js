import { COORDS } from '../core/coords.js';
import { FONTS } from '../core/themeMapper.js';

export const addEndingSlide = (pres, slideData, colors) => {
  const slide = pres.addSlide();
  slide.background = { color: colors.primary };

  slide.addText(slideData.title, {
    x: COORDS.ENDING.TITLE.x,
    y: COORDS.ENDING.TITLE.y,
    w: COORDS.ENDING.TITLE.w,
    h: COORDS.ENDING.TITLE.h,
    color: "FFFFFF",
    fontFace: FONTS.TITLE,
    fontSize: 40,
    bold: true,
    align: pres.AlignH.center
  });

  if (slideData.subtitle) {
    slide.addText(slideData.subtitle, {
      x: COORDS.ENDING.SUBTITLE.x,
      y: COORDS.ENDING.SUBTITLE.y,
      w: COORDS.ENDING.SUBTITLE.w,
      h: COORDS.ENDING.SUBTITLE.h,
      color: colors.bg,
      fontFace: FONTS.BODY,
      fontSize: 18,
      align: pres.AlignH.center
    });
  }

  slide.addShape(pres.ShapeType.roundRect, {
    x: COORDS.ENDING.CTA_BOX.x,
    y: COORDS.ENDING.CTA_BOX.y,
    w: COORDS.ENDING.CTA_BOX.w,
    h: COORDS.ENDING.CTA_BOX.h,
    fill: { color: colors.accent }
  });

  slide.addText("E'tiboringiz uchun rahmat!", {
    x: COORDS.ENDING.CTA_BOX.x,
    y: COORDS.ENDING.CTA_BOX.y,
    w: COORDS.ENDING.CTA_BOX.w,
    h: COORDS.ENDING.CTA_BOX.h,
    color: "FFFFFF",
    fontFace: FONTS.TITLE,
    fontSize: 14,
    bold: true,
    align: pres.AlignH.center,
    valign: pres.AlignV.middle
  });
};