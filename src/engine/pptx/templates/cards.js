export const buildCardsSlide = async (pptx, content, design) => {
  const slide = pptx.addSlide();
  const colors = design.color_palette;

  slide.background = { fill: colors.background.replace('#', '') };

  // Bo'lim sarlavhasi
  slide.addText(content.section_title, {
    x: 0.5, y: 0.5, w: 9.0, h: 0.8,
    fontSize: 28, bold: true,
    color: colors.text_primary.replace('#', ''),
    align: "left"
  });

  // 3 ta kartani chizish (Loop yordamida)
  const cardWidth = 2.8;
  const startX = 0.5;
  const spacing = 0.3;

  content.cards.forEach((card, index) => {
    const currentX = startX + (index * (cardWidth + spacing));

    // Karta foni
    slide.addShape(pptx.ShapeType.rect, {
      x: currentX, y: 1.8, w: cardWidth, h: 3.0,
      fill: colors.card_background.replace('#', ''),
      line: { color: colors.secondary.replace('#', ''), width: 1, dashType: "solid" }
    });

    // Karta sarlavhasi
    slide.addText(card.title, {
      x: currentX + 0.1, y: 2.0, w: cardWidth - 0.2, h: 0.6,
      fontSize: 18, bold: true,
      color: colors.primary.replace('#', ''),
      align: "center"
    });

    // Karta matni
    slide.addText(card.text, {
      x: currentX + 0.1, y: 2.8, w: cardWidth - 0.2, h: 1.8,
      fontSize: 14,
      color: colors.text_secondary.replace('#', ''),
      align: "center",
      valign: "top"
    });
  });
};