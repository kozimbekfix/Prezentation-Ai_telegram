// Ending (6-slayd) — namunadagi "Заключение" uslubi: chapda yakuniy matn va
// aloqa ma'lumoti, o'ngda rasm (yoki bezakli aksent panel).
export const buildEndingSlide = async (pptx, content, design, imageQuery, imageData) => {
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
      fill: c(colors.primary || colors.accent)
    });
  }

  const textX = 0.6;
  const textW = imgX - textX - 0.4;

  slide.addText(content.title, {
    x: textX, y: 1.3, w: textW, h: 1.0,
    fontSize: 30, bold: true,
    color: c(colors.text_primary),
    align: "left", valign: "top", fontFace: "Georgia"
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: textX, y: 2.15, w: 0.6, h: 0.045,
    fill: c(colors.accent)
  });

  slide.addText(content.call_to_action, {
    x: textX, y: 2.45, w: textW, h: 1.3,
    fontSize: 14,
    color: c(colors.text_secondary),
    align: "left", valign: "top", lineSpacing: 19,
    fontFace: "Arial"
  });

  if (content.contact_info) {
    slide.addText(content.contact_info, {
      x: textX, y: 4.6, w: textW, h: 0.5,
      fontSize: 12, bold: true,
      color: c(colors.accent),
      align: "left", fontFace: "Arial"
    });
  }
};
