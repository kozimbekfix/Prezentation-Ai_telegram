export const buildFactsSlide = async (pptx, content, design) => {
    const slide = pptx.addSlide();
    const colors = design.color_palette;
  
    slide.background = { fill: colors.background.replace('#', '') };
  
    slide.addText(content.section_title, {
      x: 0.5, y: 0.4, w: 9.0, h: 0.6,
      fontSize: 28, bold: true,
      color: colors.text_primary.replace('#', ''),
      align: "left"
    });
  
    const boxW = 4.2;
    const boxH = 1.8;
    const coords = [
      { x: 0.5, y: 1.4 },
      { x: 5.1, y: 1.4 },
      { x: 0.5, y: 3.5 },
      { x: 5.1, y: 3.5 }
    ];
  
    content.facts.forEach((fact, index) => {
      const pos = coords[index];
  
      slide.addShape(pptx.ShapeType.rect, {
        x: pos.x, y: pos.y, w: boxW, h: boxH,
        fill: colors.card_background.replace('#', ''),
        line: { color: colors.secondary.replace('#', ''), width: 1 }
      });
  
      // Metrika (Katta raqam, masalan: 98%)
      slide.addText(fact.metric, {
        x: pos.x + 0.2, y: pos.y + 0.2, w: boxW - 0.4, h: 0.7,
        fontSize: 32, bold: true,
        color: colors.accent.replace('#', '')
      });
  
      // Tafsilot
      slide.addText(fact.detail, {
        x: pos.x + 0.2, y: pos.y + 0.9, w: boxW - 0.4, h: 0.8,
        fontSize: 14,
        color: colors.text_secondary.replace('#', ''),
        valign: "top"
      });
    });
  };