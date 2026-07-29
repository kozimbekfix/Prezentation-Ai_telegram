// presentation.js
// Модуль отвечает за сборку .pptx файла на основе структуры,
// полученной от ИИ (см. ai.js).

const path = require('path');
const fs = require('fs');
const os = require('os');
const PptxGenJS = require('pptxgenjs');

const ACCENT_COLOR = '2563EB';
const TEXT_COLOR = '1F2937';
const TITLE_SLIDE_BG = '111827';

/**
 * Создаёт титульный слайд.
 */
function addTitleSlide(pptx, title) {
  const slide = pptx.addSlide();
  slide.background = { color: TITLE_SLIDE_BG };

  slide.addText(title, {
    x: 0.5,
    y: 2.2,
    w: 9,
    h: 1.5,
    fontSize: 36,
    bold: true,
    color: 'FFFFFF',
    align: 'center',
    fontFace: 'Arial',
  });

  slide.addText('Сгенерировано автоматически', {
    x: 0.5,
    y: 3.8,
    w: 9,
    h: 0.5,
    fontSize: 14,
    color: '9CA3AF',
    align: 'center',
    fontFace: 'Arial',
  });
}

/**
 * Добавляет обычный слайд с заголовком и списком пунктов.
 */
function addContentSlide(pptx, slideData) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };

  slide.addText(slideData.title, {
    x: 0.5,
    y: 0.4,
    w: 9,
    h: 0.9,
    fontSize: 28,
    bold: true,
    color: ACCENT_COLOR,
    fontFace: 'Arial',
  });

  // Линия-разделитель под заголовком
  slide.addShape(pptx.ShapeType.line, {
    x: 0.5,
    y: 1.3,
    w: 9,
    h: 0,
    line: { color: ACCENT_COLOR, width: 1.5 },
  });

  if (slideData.bullets.length > 0) {
    const bulletItems = slideData.bullets.map((text) => ({
      text,
      options: { bullet: { code: '2022', indent: 20 }, breakLine: true },
    }));

    slide.addText(bulletItems, {
      x: 0.7,
      y: 1.7,
      w: 8.6,
      h: 4.8,
      fontSize: 20,
      color: TEXT_COLOR,
      fontFace: 'Arial',
      valign: 'top',
      lineSpacingMultiple: 1.3,
    });
  }
}

/**
 * Собирает .pptx файл из структуры { title, slides } и сохраняет
 * его во временную директорию ОС. Возвращает путь к готовому файлу.
 *
 * @param {{title: string, slides: Array}} structure
 * @returns {Promise<string>} путь к сохранённому .pptx файлу
 */
async function buildPptx(structure) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 10, height: 5.63 });
  pptx.layout = 'WIDE';

  addTitleSlide(pptx, structure.title);

  for (const slide of structure.slides) {
    addContentSlide(pptx, slide);
  }

  const safeName = structure.title
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50) || 'presentation';

  const fileName = `${safeName}_${Date.now()}.pptx`;
  const filePath = path.join(os.tmpdir(), fileName);

  await pptx.writeFile({ fileName: filePath });

  return filePath;
}

/**
 * Удаляет временный файл после отправки пользователю.
 */
function cleanupFile(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error('Не удалось удалить временный файл:', filePath, err.message);
    }
  });
}

module.exports = { buildPptx, cleanupFile };
