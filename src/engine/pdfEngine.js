import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

/**
 * PPTX faylni LibreOffice yordamida izolyatsiyalangan holatda PDF ga o'giradi.
 * Xavfsizlik qoidalari: 
 * 1. Qat'iy 60 soniyalik timeout.
 * 2. Headless rejim.
 * 3. Har bir konvertatsiya uchun alohida foydalanuvchi profili.
 * 
 * @param {string} inputPath - Yaratilgan PPTX faylining to'liq yo'li
 * @param {string} outputDir - PDF saqlanishi kerak bo'lgan papka (odatda /tmp)
 * @returns {Promise<string>} - Yaratilgan PDF faylining to'liq yo'li
 */
export const convertToPdf = async (inputPath, outputDir) => {
  return new Promise((resolve, reject) => {
    // Har bir konvertatsiya uchun alohida vaqtinchalik profil papkasi.
    // Bu parallel so'rovlar bir-birining LibreOffice jarayoniga
    // (profil qulfi orqali) to'sqinlik qilishining oldini oladi.
    const uniqueProfileDir = path.join(
      outputDir,
      `.lo_profile_${Date.now()}_${Math.random().toString(36).slice(2)}`
    );

    // LibreOffice xavfsiz background argumentlari
    const args = [
      '--headless',
      '--invisible',
      '--nodefault',
      '--nofirststartwizard',
      `-env:UserInstallation=file://${uniqueProfileDir}`,
      '--convert-to',
      'pdf',
      '--outdir',
      outputDir,
      inputPath
    ];

    const loProcess = spawn('soffice', args);

    // Xotira to'lib qolmasligi va osilib qolmaslik uchun qat'iy taymer
    // 15s juda qisqa edi (sovuq start / kam resursli serverda yetmaydi) -> 60s ga oshirildi
    const TIMEOUT_MS = 60000;
    const timeoutId = setTimeout(() => {
      loProcess.kill('SIGKILL');
      reject(new Error(`PDF Convertion Timeout: LibreOffice ${TIMEOUT_MS}ms dan ortiq vaqt oldi va majburiy to'xtatildi.`));
    }, TIMEOUT_MS);

    loProcess.on('close', (code) => {
      clearTimeout(timeoutId);

      // Vaqtinchalik profil papkasini tozalash (xato bo'lsa ham davom etamiz)
      fs.rm(uniqueProfileDir, { recursive: true, force: true }).catch(() => {});

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
      fs.rm(uniqueProfileDir, { recursive: true, force: true }).catch(() => {});
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