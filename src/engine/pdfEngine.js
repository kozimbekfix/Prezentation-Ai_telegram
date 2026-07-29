import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

/**
 * PPTX faylni LibreOffice yordamida izolyatsiyalangan holatda PDF ga o'giradi.
 * Xavfsizlik qoidalari: 
 * 1. Qat'iy 15 soniyalik timeout.
 * 2. Headless rejim.
 * 
 * @param {string} inputPath - Yaratilgan PPTX faylining to'liq yo'li
 * @param {string} outputDir - PDF saqlanishi kerak bo'lgan papka (odatda /tmp)
 * @returns {Promise<string>} - Yaratilgan PDF faylining to'liq yo'li
 */
export const convertToPdf = async (inputPath, outputDir) => {
  return new Promise((resolve, reject) => {
    // LibreOffice xavfsiz background argumentlari
    const args = [
      '--headless',
      '--invisible',
      '--nodefault',
      '--nofirststartwizard',
      '--convert-to',
      'pdf',
      '--outdir',
      outputDir,
      inputPath
    ];

    const loProcess = spawn('soffice', args);

    // Xotira to'lib qolmasligi va osilib qolmaslik uchun qat'iy taymer
    const TIMEOUT_MS = 15000;
    const timeoutId = setTimeout(() => {
      loProcess.kill('SIGKILL');
      reject(new Error(`PDF Convertion Timeout: LibreOffice ${TIMEOUT_MS}ms dan ortiq vaqt oldi va majburiy to'xtatildi.`));
    }, TIMEOUT_MS);

    loProcess.on('close', (code) => {
      clearTimeout(timeoutId);
      
      if (code !== 0) {
        return reject(new Error(`LibreOffice xato bilan to'xtadi. Chiqish kodi: ${code}`));
      }

      // Muvaffaqiyatli yakunlansa, kutilgan PDF fayl yo'lini qaytaramiz
      const parsedPath = path.parse(inputPath);
      const expectedPdfPath = path.join(outputDir, `${parsedPath.name}.pdf`);
      
      resolve(expectedPdfPath);
    });

    loProcess.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(new Error(`LibreOffice ni ishga tushirib bo'lmadi: ${err.message}`));
    });
  });
};

/**
 * Vaqtinchalik fayllarni o'chirish (Garbage Collection).
 * Server xotirasi to'lib qolmasligi uchun jo'natib bo'lingach ishlatiladi.
 */
export const cleanupTempFiles = async (filePaths) => {
  for (const filePath of filePaths) {
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (err) {
        console.error(`[Cleanup Warning] ${filePath} faylini o'chirib bo'lmadi:`, err.message);
      }
    }
  }
};