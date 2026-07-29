export const buildStepsSlide = async (pptx, content, design) => {
    const slide = pptx.addSlide();
    const colors = design.color_palette;
  
    slide.background = { fill: colors.background.replace('#', '') };
  
    slide.addText(content.section_title, {
      x: 0.5, y: 0.5, w: 9.0, h: 0.8,
      fontSize: 28, bold: true,
      color: colors.text_primary.replace('#', ''),
      align: "left"
    });
  
    const stepWidth = 2.8;
    const startX = 0.5;
    const spacing = 0.3;
  
    content.steps.forEach((step, index) => {
      const currentX = startX + (index * (stepWidth + spacing));
  
      // Qadam foni
      slide.addShape(pptx.ShapeType.rect, {
        x: currentX, y: 1.8, w: stepWidth, h: 3.6,
        fill: colors.card_background.replace('#', ''),
        line: { color: colors.accent.replace('#', ''), width: 1 }
      });
  
      // Qadam raqami (Badgesifat)
      slide.addText(`0${step.step_number}`, {
        x: currentX + 0.2, y: 2.0, w: 0.8, h: 0.5,
        fontSize: 16, bold: true,
        color: colors.accent.replace('#', '')
      });
  
      // Qadam sarlavhasi
      slide.addText(step.title, {
        x: currentX + 0.2, y: 2.6, w: stepWidth - 0.4, h: 0.6,
        fontSize: 16, bold: true,
        color: colors.text_primary.replace('#', '')
      });
  
      // Qadam tavsifi
      slide.addText(step.description, {
        x: currentX + 0.2, y: 3.4, w: stepWidth - 0.4, h: 2.0,
        fontSize: 13,
        color: colors.text_secondary.replace('#', ''),
        valign: "top"
      });
    });
  };