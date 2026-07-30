// Three Cards (2-slayd) — namunadagi "Исторический контекст" / "Военные походы"
// uslubidagi 3 ta kartochka: yumaloq burchak, ustida ingichka aksent chiziq,
// raqamli belgi, sarlavha va matn.
export const buildCardsSlide = async (pptx, content, design) => {
  const slide = pptx.addSlide();
  const colors = design.color_palette;
  const c = (hex) => (hex || "").replace('#', '');

  slide.background = { fill: c(colors.background) };

  slide.addText(content.section_title, {
    x: 0.5, y: 0.5, w: 9.0, h: 0.7,
    fontSize: 26, bold: true,
    color: c(colors.text_primary),
    align: "left", fontFace: "Georgia"
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5, y: 1.25, w: 0.6, h: 0.045,
    fill: c(colors.accent)
  });

  const cardWidth = 2.83;
  const startX = 0.5;
  const spacing = 0.27;
  const cardY = 1.75;
  const cardH = 3.4;

  (content.cards || []).forEach((card, index) => {
    const x = startX + index * (cardWidth + spacing);

    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: cardY, w: cardWidth, h: cardH,
      rectRadius: 0.08,
      fill: c(colors.card_background),
      line: { color: c(colors.accent), width: 0.75 }
    });

    // Raqamli nishon
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.25, y: cardY + 0.3, w: 0.5, h: 0.5,
      fill: c(colors.accent)
    });
    slide.addText(String(index + 1), {
      x: x + 0.25, y: cardY + 0.3, w: 0.5, h: 0.5,
      fontSize: 16, bold: true, align: "center", valign: "middle",
      color: c(colors.background)
    });

    slide.addText(card.title, {
      x: x + 0.25, y: cardY + 1.0, w: cardWidth - 0.5, h: 0.75,
      fontSize: 15, bold: true,
      color: c(colors.text_primary),
      align: "left", valign: "top", fontFace: "Georgia"
    });

    slide.addText(card.text, {
      x: x + 0.25, y: cardY + 1.75, w: cardWidth - 0.5, h: cardH - 2.0,
      fontSize: 11.5,
      color: c(colors.text_secondary),
      align: "left", valign: "top", lineSpacing: 15,
      fontFace: "Arial"
    });
  });
};
