// Ending (6-slayd) — namunadagi "Заключение" uslubi: chapda yakuniy matn va
// aloqa ma'lumoti, o'ngda rasm (yoki bezakli aksent panel).

function estimateLines(text, widthIn, fontSize) {
  if (!text) return 1;
  const charsPerLine = Math.max(8, Math.floor((widthIn * 72) / (fontSize * 0.52)));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

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
  const titleY = 1.3;
  const titleFontSize = 30;

  slide.addText(content.title, {
    x: textX, y: titleY, w: textW, h: 1.2,
    fontSize: titleFontSize, bold: true,
    color: c(colors.text_primary),
    align: "left", valign: "top", fontFace: "Georgia"
  });

  const estLines = Math.min(estimateLines(content.title, textW, titleFontSize), 3);
  const titleLineHeight = (titleFontSize * 1.25) / 72;
  const lineY = titleY + estLines * titleLineHeight + 0.1;

  slide.addShape(pptx.ShapeType.rect, {
    x: textX, y: lineY, w: 0.6, h: 0.045,
    fill: c(colors.accent)
  });

  slide.addText(content.call_to_action, {
    x: textX, y: lineY + 0.3, w: textW, h: 1.3,
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