// Three Steps (4-slayd) — namunadagi "Управление империей" / "Ход сражения"
// uslubidagi vertikal raqamli ro'yxat: chapda bir-biriga ulangan doiralar
// (1, 2, 3), o'ngda har biriga tegishli sarlavha va tavsif.
export const buildStepsSlide = async (pptx, content, design) => {
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

  const steps = content.steps || [];
  const badgeX = 0.7;
  const badgeSize = 0.5;
  const rowH = 1.25;
  const startY = 1.75;
  const textX = badgeX + badgeSize + 0.35;
  const textW = 9.5 - textX;

  // Ulovchi vertikal chiziq
  if (steps.length > 1) {
    slide.addShape(pptx.ShapeType.rect, {
      x: badgeX + badgeSize / 2 - 0.006, y: startY + badgeSize,
      w: 0.012, h: rowH * (steps.length - 1),
      fill: c(colors.accent)
    });
  }

  steps.forEach((step, index) => {
    const y = startY + index * rowH;

    slide.addShape(pptx.ShapeType.ellipse, {
      x: badgeX, y, w: badgeSize, h: badgeSize,
      fill: c(colors.card_background),
      line: { color: c(colors.accent), width: 1.25 }
    });
    slide.addText(String(step.step_number ?? index + 1), {
      x: badgeX, y, w: badgeSize, h: badgeSize,
      fontSize: 15, bold: true, align: "center", valign: "middle",
      color: c(colors.accent)
    });

    slide.addText(step.title, {
      x: textX, y: y - 0.05, w: textW, h: 0.45,
      fontSize: 15, bold: true,
      color: c(colors.text_primary),
      align: "left", valign: "top", fontFace: "Georgia"
    });

    slide.addText(step.description, {
      x: textX, y: y + 0.4, w: textW, h: rowH - 0.5,
      fontSize: 12.5,
      color: c(colors.text_secondary),
      align: "left", valign: "top", lineSpacing: 16,
      fontFace: "Arial"
    });
  });
};
