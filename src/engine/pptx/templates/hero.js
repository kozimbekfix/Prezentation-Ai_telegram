// Hero (1-slayd) — namunadagi "Амир Темур: Великий завоеватель" uslubidagi
// sxema: chap yarmida rasm (yoki rasm topilmasa — bezakli aksent panel),
// o'ng yarmida katta sarlavha va tavsif matni.

// Sarlavha necha qatorga bo'linishini taxminiy hisoblaymiz, shunda
// pastdagi aksent chiziq va tavsif matni har doim sarlavhadan PASTDA
// joylashadi (uzun sarlavhalarda matn ustidan chiziq o'tib ketmasligi uchun).
function estimateLines(text, widthIn, fontSize) {
  if (!text) return 1;
  // Bold Georgia shriftida bitta belgi eni taxminan fontSize*0.85pt.
  const charsPerLine = Math.max(6, Math.floor((widthIn * 72) / (fontSize * 0.85)));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

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
  const titleY = 1.1;
  const titleFontSize = 32;

  slide.addText(content.title, {
    x: textX, y: titleY, w: textW, h: 2.4,
    fontSize: titleFontSize, bold: true,
    color: c(colors.text_primary),
    align: "left", valign: "top",
    fontFace: "Georgia"
  });

  // Sarlavha qatorlar soniga qarab chiziq va tavsifni pastroqqa suramiz
  const estLines = estimateLines(content.title, textW, titleFontSize);
  const titleLineHeight = (titleFontSize * 1.25) / 72; // taxminiy qator balandligi (dyuym)
  const lineY = titleY + estLines * titleLineHeight + 0.15;

  slide.addShape(pptx.ShapeType.rect, {
    x: textX, y: lineY, w: 0.7, h: 0.05,
    fill: c(colors.accent)
  });

  slide.addText(content.subtitle, {
    x: textX, y: lineY + 0.35, w: textW, h: 1.7,
    fontSize: 14,
    color: c(colors.text_secondary),
    align: "left", valign: "top",
    lineSpacing: 20,
    fontFace: "Arial"
  });
};;