// Ending (6-slayd) — namunadagi "Заключение" uslubi: chapda yakuniy xulosa
// matni, o'ngda rasm (yoki bezakli aksent panel). Reklama/aloqa ma'lumoti
// YO'Q — bu haqiqiy, mazmunli xulosa slaydi.

function estimateLines(text, widthIn, fontSize) {
  if (!text) return 1;
  // Bold Georgia shriftida bitta belgi eni taxminan fontSize*0.85pt
  // (avvalgi 0.52 koeffitsiyenti haqiqiy render'dan kamroq chiqib,
  // uzun sarlavhalarda chiziq matn ustiga tushib qolishiga sabab bo'lgan).
  const charsPerLine = Math.max(6, Math.floor((widthIn * 72) / (fontSize * 0.85)));
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
    x: textX, y: titleY, w: textW, h: 1.6,
    fontSize: titleFontSize, bold: true,
    color: c(colors.text_primary),
    align: "left", valign: "top", fontFace: "Georgia"
  });

  const estLines = estimateLines(content.title, textW, titleFontSize);
  const titleLineHeight = (titleFontSize * 1.25) / 72;
  const lineY = titleY + estLines * titleLineHeight + 0.15;

  slide.addShape(pptx.ShapeType.rect, {
    x: textX, y: lineY, w: 0.6, h: 0.045,
    fill: c(colors.accent)
  });

  slide.addText(content.summary, {
    x: textX, y: lineY + 0.35, w: textW, h: 2.6,
    fontSize: 14,
    color: c(colors.text_secondary),
    align: "left", valign: "top", lineSpacing: 19,
    fontFace: "Arial"
  });
};