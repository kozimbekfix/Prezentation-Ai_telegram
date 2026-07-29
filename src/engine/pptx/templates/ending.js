export const buildEndingSlide = async (pptx, content, design) => {
    const slide = pptx.addSlide();
    const colors = design.color_palette;
  
    slide.background = { fill: colors.background.replace('#', '') };
  
    // Asosiy yakuniy sarlavha
    slide.addText(content.title, {
      x: 1.0, y: 1.8, w: 8.0, h: 1.2,
      fontSize: 40, bold: true,
      color: colors.text_primary.replace('#', ''),
      align: "center",
      valign: "middle"
    });
  
    // Harakatga chaqiruv (CTA)
    slide.addText(content.call_to_action, {
      x: 1.5, y: 3.2, w: 7.0, h: 0.8,
      fontSize: 20,
      color: colors.secondary.replace('#', ''),
      align: "center"
    });
  
    // Aloqa ma'lumotlari
    slide.addText(content.contact_info, {
      x: 2.0, y: 4.5, w: 6.0, h: 0.6,
      fontSize: 16, bold: true,
      color: colors.text_secondary.replace('#', ''),
      align: "center"
    });
  };