import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    PageNumber,
    Footer,
  } from "docx";
  import fs from "fs/promises";
  import path from "path";
  
  // Til bo'yicha standart bo'lim sarlavhalari (Kirish / Xulosa / Adabiyotlar).
  const LABELS = {
    uz: {
      intro: "KIRISH",
      conclusion: "XULOSA",
      references: "FOYDALANILGAN ADABIYOTLAR",
    },
    ru: {
      intro: "ВВЕДЕНИЕ",
      conclusion: "ЗАКЛЮЧЕНИЕ",
      references: "СПИСОК ИСПОЛЬЗОВАННОЙ ЛИТЕРАТУРЫ",
    },
  };
  
  // Akademik referat uchun standart formatlash: Times New Roman, 12pt (24
  // half-points), 1.5 qator oralig'i, ikki tomonlama tekislash (justify).
  const FONT = "Times New Roman";
  const FONT_SIZE = 24; // 12pt
  const LINE_SPACING = 360; // 1.5 lines
  
  const bodyParagraph = (text) =>
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: LINE_SPACING, after: 200 },
      indent: { firstLine: 720 }, // ~1.27sm, akademik matn uchun standart abzats
      children: [new TextRun({ text, font: FONT, size: FONT_SIZE })],
    });
  
  const headingParagraph = (text) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.LEFT,
      spacing: { before: 400, after: 200 },
      children: [
        new TextRun({ text, font: FONT, size: FONT_SIZE + 4, bold: true }),
      ],
    });
  
  export class ReferatEngine {
    /**
     * @param {object} content - referatSchema orqali tekshirilgan AI natijasi
     * @param {string} language - "uz" | "ru"
     * @param {string} uniqueId - fayl nomi uchun noyob identifikator
     * @returns {Promise<string>} - yaratilgan .docx faylining to'liq yo'li
     */
    async createReferat(content, language, uniqueId) {
      const labels = LABELS[language] || LABELS.ru;
      const { title, introduction, sections, conclusion, references } = content;
  
      const children = [];
  
      // Sarlavha sahifasi (sodda, bezaksiz — standart o'quv referat uslubi)
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 2000, after: 800 },
          children: [
            new TextRun({ text: title, font: FONT, size: FONT_SIZE + 8, bold: true }),
          ],
        })
      );
  
      // Kirish
      children.push(headingParagraph(labels.intro));
      children.push(bodyParagraph(introduction));
  
      // Asosiy qism bo'limlari
      for (const section of sections) {
        children.push(headingParagraph(section.heading));
        children.push(bodyParagraph(section.content));
      }
  
      // Xulosa
      children.push(headingParagraph(labels.conclusion));
      children.push(bodyParagraph(conclusion));
  
      // Adabiyotlar ro'yxati (raqamlangan)
      children.push(headingParagraph(labels.references));
      references.forEach((ref, index) => {
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { line: LINE_SPACING, after: 120 },
            children: [
              new TextRun({ text: `${index + 1}. ${ref}`, font: FONT, size: FONT_SIZE }),
            ],
          })
        );
      });
  
      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: { top: 1134, bottom: 1134, left: 1701, right: 850 }, // 2/2/3/1.5 sm — standart O'zbek/Rossiya referat talabi
              },
            },
            footers: {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({
                        children: [PageNumber.CURRENT],
                        font: FONT,
                        size: FONT_SIZE - 2,
                      }),
                    ],
                  }),
                ],
              }),
            },
            children,
          },
        ],
      });
  
      const buffer = await Packer.toBuffer(doc);
      const filePath = path.join(process.env.TMPDIR || "/tmp", `${uniqueId}_referat.docx`);
      await fs.writeFile(filePath, buffer);
      return filePath;
    }
  }