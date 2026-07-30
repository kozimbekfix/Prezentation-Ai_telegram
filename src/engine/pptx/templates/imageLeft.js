// Image Left (3-slayd) — nomiga qaramay, namunadagi "Управление империей"
// uslubiga mos qilib rasm O'NG tomonda, matn CHAP tomonda joylashtirildi —
// shu bilan Hero slayd (rasm chapda) bilan vizual almashinuv hosil bo'ladi.
export const buildImageLeftSlide = async (pptx, content, design, imageQuery, imageData) => {
  const slide = pptx.addSlide();
  const colors = design.color_palette;
  const c = (hex) => (hex || "").replace('#', '');

  slide.background = { fill: c(colors.background) };

  const imgW = 4.35;
  const imgX = 10 - imgW;

  if (imageData) {
    slide.addImage({ data: imageData, x: imgX, y: 0, w: imgW, h: 5.63, sizing: { type: "cover", w: imgW, h: 5.63 } });
  } else {
    slide.addShape(pptx.ShapeType.rect, {
      x: imgX, y: 0, w: imgW, h: 5.63,
      fill: c(colors.secondary)
    });
    slide.addText((imageQuery || content.title || "").toUpperCase(), {
      x: imgX + 0.3, y: 2.4, w: imgW - 0.6, h: 1.0,
      fontSize: 13, color: c(colors.background), align: "center",
      valign: "middle", fontFace: "Arial", italic: true
    });
  }

  const textX = 0.6;
  const textW = imgX - textX - 0.4;

  slide.addText(content.title, {
    x: textX, y: 1.0, w: textW, h: 1.2,
    fontSize: 26, bold: true,
    color: c(colors.text_primary),
    align: "left", valign: "top", fontFace: "Georgia"
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: textX, y: 2.05, w: 0.6, h: 0.045,
    fill: c(colors.accent)
  });

  slide.addText(content.content, {
    x: textX, y: 2.35, w: textW, h: 3.0,
    fontSize: 14,
    color: c(colors.text_secondary),
    align: "left", valign: "top", lineSpacing: 19,
    fontFace: "Arial"
  });
};
