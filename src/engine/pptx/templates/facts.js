// Four Facts (5-slayd) — namunadagi statistik/fakt kartochkalar uslubi:
// 2x2 panjara, katta aksent-rangli metrika va qisqa tavsif, yumaloq burchak.
export const buildFactsSlide = async (pptx, content, design) => {
  const slide = pptx.addSlide();
  const colors = design.color_palette;
  const c = (hex) => (hex || "").replace('#', '');

  slide.background = { fill: c(colors.background) };

  slide.addText(content.section_title, {
    x: 0.5, y: 0.4, w: 9.0, h: 0.65,
    fontSize: 26, bold: true,
    color: c(colors.text_primary),
    align: "left", fontFace: "Georgia"
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5, y: 1.1, w: 0.6, h: 0.045,
    fill: c(colors.accent)
  });

  const boxW = 4.25;
  const boxH = 1.85;
  const coords = [
    { x: 0.5, y: 1.5 },
    { x: 5.25, y: 1.5 },
    { x: 0.5, y: 3.55 },
    { x: 5.25, y: 3.55 }
  ];

  (content.facts || []).forEach((fact, index) => {
    const pos = coords[index];
    if (!pos) return;

    slide.addShape(pptx.ShapeType.roundRect, {
      x: pos.x, y: pos.y, w: boxW, h: boxH,
      rectRadius: 0.08,
      fill: c(colors.card_background),
      line: { color: c(colors.accent), width: 0.75 }
    });

    slide.addText(fact.metric, {
      x: pos.x + 0.25, y: pos.y + 0.18, w: boxW - 0.5, h: 0.75,
      fontSize: 30, bold: true,
      color: c(colors.accent),
      fontFace: "Georgia"
    });

    slide.addText(fact.detail, {
      x: pos.x + 0.25, y: pos.y + 1.0, w: boxW - 0.5, h: 0.75,
      fontSize: 12.5,
      color: c(colors.text_secondary),
      valign: "top", lineSpacing: 15,
      fontFace: "Arial"
    });
  });
};
