// Hero (1-slayd) — namunadagi "Амир Темур: Великий завоеватель" uslubidagi
// sxema: chap yarmida rasm (yoki rasm topilmasa — bezakli aksent panel),
// o'ng yarmida katta sarlavha va tavsif matni.
export const buildHeroSlide = async (pptx, content, design, imageQuery, imageData) => {
  const slide = pptx.addSlide();
  const colors = design.color_palette;
  const c = (hex) => (hex || "").replace('#', '');

  slide.background = { fill: c(colors.background) };

  const imgW = 4.35;

  // Chap panel — rasm yoki bezakli placeholder
  if (imageData) {
    slide.addImage({ data: imageData, x: 0, y: 0, w: imgW, h: 5.63, sizing: { type: "cover", w: imgW, h: 5.63 } });
  } else {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: imgW, h: 5.63,
      fill: c(colors.accent)
    });
    slide.addText((imageQuery || content.title || "").toUpperCase(), {
      x: 0.3, y: 2.4, w: imgW - 0.6, h: 1.0,
      fontSize: 13, color: c(colors.background), align: "center",
      valign: "middle", fontFace: "Arial", italic: true
    });
  }

  // O'ng panel — sarlavha va tavsif
  const textX = imgW + 0.5;
  const textW = 10 - textX - 0.5;

  slide.addText(content.title, {
    x: textX, y: 1.4, w: textW, h: 1.6,
    fontSize: 32, bold: true,
    color: c(colors.text_primary),
    align: "left", valign: "top",
    fontFace: "Georgia"
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: textX, y: 2.55, w: 0.7, h: 0.05,
    fill: c(colors.accent)
  });

  slide.addText(content.subtitle, {
    x: textX, y: 2.9, w: textW, h: 2.0,
    fontSize: 14,
    color: c(colors.text_secondary),
    align: "left", valign: "top",
    lineSpacing: 20,
    fontFace: "Arial"
  });
};
