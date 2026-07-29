export const buildHeroSlide = async (pptx, content, design, imageQuery) => {
  const slide = pptx.addSlide();
  const colors = design.color_palette;

  // Fon rangi
  slide.background = { fill: colors.background.replace('#', '') };

  // Asosiy Sarlavha (Katta va qalin)
  slide.addText(content.title, {
    x: 1.0, 
    y: 1.8, 
    w: 8.0, 
    h: 1.5,
    fontSize: 44,
    bold: true,
    color: colors.text_primary.replace('#', ''),
    align: "center",
    valign: "middle",
    fontFace: "Arial"
  });

  // Qisqa tavsif (Subtitle)
  slide.addText(content.subtitle, {
    x: 1.5, 
    y: 3.5, 
    w: 7.0, 
    h: 1.0,
    fontSize: 22,
    color: colors.text_secondary.replace('#', ''),
    align: "center",
    valign: "top",
    fontFace: "Arial"
  });

  // Dekorativ chiziq (Accent color)
  slide.addShape(pptx.ShapeType.rect, {
    x: 4.5, 
    y: 3.3, 
    w: 1.0, 
    h: 0.05,
    fill: colors.accent.replace('#', '')
  });
};