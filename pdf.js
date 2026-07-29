// pdf.js
// Модуль конвертирует .pptx в .pdf с помощью LibreOffice (headless).
// Требует, чтобы в системе был установлен пакет `libreoffice` —
// см. Dockerfile, где он ставится через apt-get.

const path = require('path');
const { exec } = require('child_process');

/**
 * Конвертирует .pptx файл в .pdf, сохраняя результат в той же папке.
 *
 * @param {string} pptxPath - путь к исходному .pptx файлу
 * @returns {Promise<string>} путь к получившемуся .pdf файлу
 */
function convertToPdf(pptxPath) {
  const outDir = path.dirname(pptxPath);

  return new Promise((resolve, reject) => {
    // --headless: без графического интерфейса
    // --convert-to pdf: целевой формат
    // --outdir: куда сохранить результат
    const cmd = `soffice --headless --convert-to pdf --outdir "${outDir}" "${pptxPath}"`;

    exec(cmd, { timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`Ошибка конвертации в PDF: ${stderr || error.message}`));
      }

      const pdfPath = pptxPath.replace(/\.pptx$/i, '.pdf');
      resolve(pdfPath);
    });
  });
}

module.exports = { convertToPdf };
