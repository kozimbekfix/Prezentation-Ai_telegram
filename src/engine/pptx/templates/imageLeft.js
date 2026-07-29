export const buildImageLeftSlide = async (pptx, content, design, imageQuery) => {
  const slide = pptx.addSlide();
  const colors = design.color_palette;

  slide.background = { fill: colors.background.replace('#', '') };

  // Chap tomondagi rasm uchun joy (Placeholder yoki Unsplash URL)
  // Eslatma: Image Engine keyinchalik bu yerga real rasm yuklaydi
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.8, y: 1.2, w: 4.2, h: 4.5,
    fill: colors.card_background.replace('#', ''),
    line: { color: colors.secondary.replace('#', ''), width: 1 }
  });

  slide.addText(`[Rasm: ${imageQuery}]`, {
    x: 1.0, y: 3.0, w: 3.8, h: 1.0,
    fontSize: 12, color: colors.text_secondary.replace('#', ''),
    align: "center"
  });

  // O'ng tomondagi sarlavha
  slide.addText(content.title, {
    x: 5.4, y: 1.2, w: 3.8, h: 1.0,
    fontSize: 26, bold: true,
    color: colors.text_primary.replace('#', ''),
    align: "left"
  });

  // O'ng tomondagi asosiy matn
  slide.addText(content.content, {
    x: 5.4, y: 2.4, w: 3.8, h: 3.0,
    fontSize: 15,
    color: colors.text_secondary.replace('#', ''),
    align: "left",
    valign: "top"
  });
};