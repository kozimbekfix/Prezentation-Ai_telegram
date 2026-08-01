// Botning barcha progress/xabar/xato matnlari shu yerda ikki tilda
// saqlanadi. Foydalanuvchi qaysi tilni tanlagan bo'lsa (uz/ru), generatsiya
// jarayonidagi BARCHA xabarlar (nafaqat AI kontenti) shu tilda chiqadi.
export const MESSAGES = {
  uz: {
    aiWorkingPresentation: (i, n) => `✨ [${i}/${n}] AI mavzu ustida ishlayapti va ma'lumotlarni to'playapti...`,
    buildingPptx: (i, n) => `🎨 [${i}/${n}] Slaydlar dizayni shakllantirilib, PowerPoint faylga yig'ilmoqda...`,
    preparingPdfPresentation: (i, n) => `📄 [${i}/${n}] PDF versiyasi tayyorlanmoqda...`,
    presentationCaption: "✅ Mana sizning professional taqdimotingiz tayyor!",
    presentationPdfCaption: "📄 PDF versiyasi ham tayyor!",

    aiWorkingReferat: (i, n) => `✨ [${i}/${n}] AI mavzu bo'yicha referat matnini yozib chiqmoqda...`,
    buildingDocx: (i, n) => `📝 [${i}/${n}] Matn Word (.docx) faylga formatlanmoqda...`,
    preparingPdfReferat: (i, n) => `📄 [${i}/${n}] PDF versiyasi tayyorlanmoqda...`,
    referatCaption: (pages) => `✅ Referatingiz tayyor! (~${pages} bet)`,
    referatPdfCaption: "📄 PDF versiyasi ham tayyor!",

    anythingElse: 'Yana biror narsa kerakmi?',
    cancelledBeforeStart: "✅ So'rov bekor qilindi (hali boshlanmagan edi).",
    cancelledMidway: "❌ So'rov bekor qilindi.",
    noActiveJob: "Sizda hozir faol/navbatdagi so'rov yo'q.",
    alreadyFinished: "Bu so'rov allaqachon tugagan — bekor qilib bo'lmaydi.",
    dailyLimitReached: (limit) =>
      `🚫 Kunlik bepul limitingiz (${limit} ta) tugadi.\n` +
      "Ertaga (UTC bo'yicha yangi kun boshlanganda) limit avtomatik tiklanadi. " +
      "Yoki hozir ⭐ Telegram Stars evaziga qo'shimcha generatsiya sotib olishingiz mumkin.",

    cancelButtonLabel: '❌ Bekor qilish',
    buyCreditButtonLabel: '⭐ 1 Star evaziga +1 generatsiya',
    invoiceTitle: 'Qo\'shimcha generatsiya',
    invoiceDescription: 'Kunlik bepul limitdan tashqari 1 ta qo\'shimcha prezentatsiya yoki referat generatsiyasi.',
    invoiceLabel: '1 ta qo\'shimcha generatsiya',
    creditPurchased: "✅ Rahmat! Hisobingizga +1 qo'shimcha generatsiya qo'shildi. Endi mavzuni qayta yozishingiz mumkin.",
    paymentFailed: "❌ To'lovni amalga oshirishda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.",

    errorRateLimit:
      "⏳ Serverda vaqtinchalik yuklama yuzaga keldi.\n" +
      "Iltimos, 1 daqiqadan keyin qayta urinib ko'ring — bu vaqt ichida " +
      "tizim avtomatik tiklanadi, hech narsa qo'lda o'zgartirish shart emas.",
    errorGeneric:
      "❌ Serverda kutilmagan xatolik yuz berdi.\n" +
      "Iltimos, 1 daqiqadan keyin qayta urinib ko'ring. Muammo davom etsa, " +
      "boshqa mavzu bilan sinab ko'ring.",
  },

  ru: {
    aiWorkingPresentation: (i, n) => `✨ [${i}/${n}] ИИ работает над темой и собирает информацию...`,
    buildingPptx: (i, n) => `🎨 [${i}/${n}] Формируется дизайн слайдов и собирается файл PowerPoint...`,
    preparingPdfPresentation: (i, n) => `📄 [${i}/${n}] Готовится версия в формате PDF...`,
    presentationCaption: "✅ Ваша профессиональная презентация готова!",
    presentationPdfCaption: "📄 Версия в формате PDF также готова!",

    aiWorkingReferat: (i, n) => `✨ [${i}/${n}] ИИ пишет текст реферата по вашей теме...`,
    buildingDocx: (i, n) => `📝 [${i}/${n}] Текст оформляется в файл Word (.docx)...`,
    preparingPdfReferat: (i, n) => `📄 [${i}/${n}] Готовится версия в формате PDF...`,
    referatCaption: (pages) => `✅ Ваш реферат готов! (~${pages} стр.)`,
    referatPdfCaption: "📄 Версия в формате PDF также готова!",

    anythingElse: 'Нужно что-нибудь ещё?',
    cancelledBeforeStart: '✅ Запрос отменён (он ещё не был запущен).',
    cancelledMidway: '❌ Запрос отменён.',
    noActiveJob: 'У вас сейчас нет активного/ожидающего запроса.',
    alreadyFinished: 'Этот запрос уже завершён — отменить его нельзя.',
    dailyLimitReached: (limit) =>
      `🚫 Ваш дневной бесплатный лимит (${limit}) исчерпан.\n` +
      'Лимит автоматически обновится завтра (по UTC). Либо прямо сейчас ' +
      'можно купить дополнительную генерацию за ⭐ Telegram Stars.',

    cancelButtonLabel: '❌ Отменить',
    buyCreditButtonLabel: '⭐ +1 генерация за 1 Star',
    invoiceTitle: 'Дополнительная генерация',
    invoiceDescription: 'Одна дополнительная генерация презентации или реферата сверх дневного лимита.',
    invoiceLabel: '1 дополнительная генерация',
    creditPurchased: '✅ Спасибо! На ваш счёт добавлена +1 дополнительная генерация. Теперь можно снова написать тему.',
    paymentFailed: '❌ Произошла ошибка при оплате. Пожалуйста, попробуйте ещё раз.',

    errorRateLimit:
      '⏳ На сервере возникла временная нагрузка.\n' +
      'Пожалуйста, попробуйте снова через 1 минуту — система восстановится ' +
      'автоматически, вручную ничего менять не нужно.',
    errorGeneric:
      '❌ На сервере произошла непредвиденная ошибка.\n' +
      'Пожалуйста, попробуйте снова через 1 минуту. Если проблема ' +
      'повторяется, попробуйте другую тему.',
  },
};

export function t(language, key, ...args) {
  const dict = MESSAGES[language] || MESSAGES.uz;
  const entry = dict[key] ?? MESSAGES.uz[key];
  return typeof entry === 'function' ? entry(...args) : entry;
}