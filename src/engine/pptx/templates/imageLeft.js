import { COORDS } from '../core/coords.js';
import { FONTS } from '../core/themeMapper.js';
import { getEmbeddedImage } from '../../../utils/imageEngine.js';

export const addImageLeftSlide = async (pres, slideData, colors) => {
  const slide = pres.addSlide();
  slide.background = { color: colors.bg };

  // AI taqdim etgan kalit so'z bo'yicha Unsplash'dan rasmni yuklab olish
  const keyword = slideData.imageKeyword || slideData.title;
  const base64Image = await getEmbeddedImage(keyword);

  if (base64Image) {
    slide.addImage({
      data: base64Image,
      x: COORDS.IMAGE_LEFT.IMG.x,
      y: COORDS.IMAGE_LEFT.IMG.y,
      w: COORDS.IMAGE_LEFT.IMG.w,
      h: COORDS.IMAGE_LEFT.IMG.h,
      sizing: { type: 'cover' }
    });
  } else {
    // Agar internet/rasm topilmasa, o'rniga bo'yalgan kvadrat qo'yamiz
    slide.addShape(pres.ShapeType.rect, {
      x: COORDS.IMAGE_LEFT.IMG.x,
      y: COORDS.IMAGE_LEFT.IMG.y,
      w: COORDS.IMAGE_LEFT.IMG.w,
      h: COORDS.IMAGE_LEFT.IMG.h,
      fill: { color: colors.secondary }
    });
  }

  // O'ng taraf - Sarlavha
  slide.addText(slideData.title, {
    x: COORDS.IMAGE_LEFT.TITLE.x,
    y: COORDS.IMAGE_LEFT.TITLE.y,
    w: COORDS.IMAGE_LEFT.TITLE.w,
    h: COORDS.IMAGE_LEFT.TITLE.h,
    color: colors.primary,
    fontFace: FONTS.TITLE,
    fontSize: 28,
    bold: true
  });

  // O'ng taraf - Elementlar (Bullets)
  const items = slideData.items || [];
  let currentY = COORDS.IMAGE_LEFT.BULLET_Y_START;

  items.slice(0, 3).forEach((item) => {
    slide.addText(
      [
        { text: item.title + "\n", options: { bold: true, color: colors.accent, fontSize: 16 } },
        { text: item.description, options: { color: colors.text, fontSize: 14 } }
      ],
      {
        x: COORDS.IMAGE_LEFT.BULLET_X,
        y: currentY,
        w: COORDS.IMAGE_LEFT.BULLET_W,
        h: COORDS.IMAGE_LEFT.BULLET_H,
        fontFace: FONTS.BODY,
        valign: pres.AlignV.top
      }
    );
    currentY += COORDS.IMAGE_LEFT.BULLET_GAP;
  });
};