// Foydalanuvchilarni Redis'da saqlaydigan oddiy "store". Alohida
// ma'lumotlar bazasi (Postgres/Mongo) o'rniga Redis ishlatilyapti, chunki
// loyihada allaqachon Redis ulangan (BullMQ uchun) — qo'shimcha infratuzilma
// shart emas. Har bir foydalanuvchi bitta Redis Hash maydonida (bot:users)
// JSON qilib saqlanadi: { id, username, firstSeen, lastSeen, blocked, tokens }

const USERS_KEY = 'bot:users';

function parseRecord(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Foydalanuvchi botga har safar murojaat qilganda chaqiriladi — yangi
// bo'lsa yozadi, mavjud bo'lsa username/lastSeen'ni yangilaydi, lekin
// blocked/tokens maydonlarini SAQLAB QOLADI (ustidan yozib yubormaydi).
export async function touchUser(redis, userId, username) {
  const id = String(userId);
  const existingRaw = await redis.hget(USERS_KEY, id);
  const existing = parseRecord(existingRaw);

  const record = {
    ...existing,
    id,
    username: username || existing?.username || null,
    firstSeen: existing?.firstSeen || Date.now(),
    lastSeen: Date.now(),
    blocked: existing?.blocked || false,
    tokens: existing?.tokens || 0,
  };

  await redis.hset(USERS_KEY, id, JSON.stringify(record));
  return record;
}

export async function getUser(redis, userId) {
  const raw = await redis.hget(USERS_KEY, String(userId));
  return parseRecord(raw);
}

// "@username" yoki xom raqamli ID orqali foydalanuvchini topadi —
// /blockuser va /unblockuser buyruqlari shu orqali ishlaydi.
export async function resolveUser(redis, identifier) {
  const clean = identifier.trim().replace(/^@/, '');

  if (/^\d+$/.test(clean)) {
    const byId = await getUser(redis, clean);
    if (byId) return byId;
  }

  const all = await redis.hgetall(USERS_KEY);
  for (const raw of Object.values(all)) {
    const record = parseRecord(raw);
    if (record?.username && record.username.toLowerCase() === clean.toLowerCase()) {
      return record;
    }
  }

  return null;
}

export async function setBlocked(redis, userId, blocked) {
  const id = String(userId);
  const existing = parseRecord(await redis.hget(USERS_KEY, id));
  if (!existing) return null;

  existing.blocked = blocked;
  await redis.hset(USERS_KEY, id, JSON.stringify(existing));
  return existing;
}

export async function isBlocked(redis, userId) {
  const user = await getUser(redis, userId);
  return Boolean(user?.blocked);
}

// Har bir AI pipeline chaqiruvi tugagach, shu foydalanuvchi hisobiga
// sarflangan token sonini qo'shadi (statistik hisobot uchun — /usertokens).
export async function addTokens(redis, userId, tokens) {
  if (!tokens || tokens <= 0) return;
  const id = String(userId);
  const existing = parseRecord(await redis.hget(USERS_KEY, id)) || {
    id,
    username: null,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    blocked: false,
    tokens: 0,
  };

  existing.tokens = (existing.tokens || 0) + tokens;
  await redis.hset(USERS_KEY, id, JSON.stringify(existing));
}

export async function setLanguage(redis, userId, language) {
  const id = String(userId);
  const existing = parseRecord(await redis.hget(USERS_KEY, id)) || {
    id,
    username: null,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    blocked: false,
    tokens: 0,
  };

  existing.language = language;
  await redis.hset(USERS_KEY, id, JSON.stringify(existing));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10); // "2026-07-31" — UTC kun
}

// Foydalanuvchi bugun yana generatsiya so'rashi mumkinmi — tekshiradi.
// "star" (⭐, admin bergan) foydalanuvchilar uchun limit umuman ishlamaydi
// (cheksiz). Oddiy foydalanuvchida kunlik limit tugagan bo'lsa, lekin
// sotib olingan "credits" (Telegram Stars orqali) balansi bo'lsa — shu
// hisobdan generatsiya qilishga ruxsat beriladi (useCredit=true qaytadi,
// chaqiruvchi kod keyin consumeCredit() bilan 1 tasini sarflashi kerak).
export async function canGenerate(redis, userId, dailyLimit = 3) {
  const user = await getUser(redis, userId);

  if (user?.star) {
    return { allowed: true, remaining: Infinity, star: true, useCredit: false, credits: user?.credits || 0 };
  }

  const today = todayStr();
  const usedToday = user?.dailyDate === today ? (user.dailyCount || 0) : 0;
  const withinDailyLimit = usedToday < dailyLimit;
  const credits = user?.credits || 0;

  if (withinDailyLimit) {
    return {
      allowed: true,
      remaining: Math.max(0, dailyLimit - usedToday),
      star: false,
      useCredit: false,
      credits,
    };
  }

  if (credits > 0) {
    return { allowed: true, remaining: 0, star: false, useCredit: true, credits };
  }

  return { allowed: false, remaining: 0, star: false, useCredit: false, credits: 0 };
}

// Foydalanuvchining ⭐ Stars orqali sotib olgan qo'shimcha generatsiya
// balansiga (kunlik limitdan tashqari, muddatsiz amal qiladigan) `amount`
// qo'shadi. Telegram to'lovi muvaffaqiyatli yakunlangach chaqiriladi.
export async function addCredits(redis, userId, amount) {
  if (!amount || amount <= 0) return;
  const id = String(userId);
  const existing = parseRecord(await redis.hget(USERS_KEY, id)) || {
    id,
    username: null,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    blocked: false,
    tokens: 0,
  };

  existing.credits = (existing.credits || 0) + amount;
  await redis.hset(USERS_KEY, id, JSON.stringify(existing));
  return existing.credits;
}

// Kredit balansidan 1 tasini sarflaydi (generatsiya muvaffaqiyatli navbatga
// qo'shilgandan keyin chaqiriladi — canGenerate() useCredit=true qaytargan
// holatda). Yetarli kredit bo'lmasa hech narsa qilmaydi.
export async function consumeCredit(redis, userId) {
  const id = String(userId);
  const existing = parseRecord(await redis.hget(USERS_KEY, id));
  if (!existing || !(existing.credits > 0)) return 0;

  existing.credits -= 1;
  await redis.hset(USERS_KEY, id, JSON.stringify(existing));
  return existing.credits;
}

// Xato/bekor qilish tufayli muvaffaqiyatsiz yakunlangan so'rov uchun
// sarflangan kreditni QAYTARADI — xuddi refundDailyUsage kabi mantiq.
export async function refundCredit(redis, userId) {
  const id = String(userId);
  const existing = parseRecord(await redis.hget(USERS_KEY, id));
  if (!existing) return;

  existing.credits = (existing.credits || 0) + 1;
  await redis.hset(USERS_KEY, id, JSON.stringify(existing));
}

// Har bir muvaffaqiyatli navbatga qo'shishdan so'ng chaqiriladi — bugungi
// hisobni bittaga oshiradi (kun almashsa avtomatik 0'dan boshlanadi).
export async function incrementDailyUsage(redis, userId) {
  const id = String(userId);
  const existing = parseRecord(await redis.hget(USERS_KEY, id)) || {
    id,
    username: null,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    blocked: false,
    tokens: 0,
  };

  const today = todayStr();
  if (existing.dailyDate !== today) {
    existing.dailyDate = today;
    existing.dailyCount = 0;
  }
  existing.dailyCount = (existing.dailyCount || 0) + 1;

  await redis.hset(USERS_KEY, id, JSON.stringify(existing));
}

// Xato yoki bekor qilish tufayli tugagan so'rov uchun foydalanuvchining
// kunlik hisobini QAYTARIB beradi — chunki bu uning aybi emas, u shu
// slotdan haqiqatda foydalana olmadi. Faqat MUVAFFAQIYATLI yakunlangan
// so'rovlar chinakam limitga hisoblanishi kerak.
export async function refundDailyUsage(redis, userId) {
  const id = String(userId);
  const existing = parseRecord(await redis.hget(USERS_KEY, id));
  if (!existing) return;

  const today = todayStr();
  if (existing.dailyDate === today && (existing.dailyCount || 0) > 0) {
    existing.dailyCount -= 1;
    await redis.hset(USERS_KEY, id, JSON.stringify(existing));
  }
}

// Admin /staruser buyrug'i orqali — bu foydalanuvchiga kunlik limit
// qo'llanilmaydi (cheksiz generatsiya). /unstaruser bilan bekor qilinadi.
export async function setStar(redis, userId, star) {
  const id = String(userId);
  const existing = parseRecord(await redis.hget(USERS_KEY, id));
  if (!existing) return null;

  existing.star = star;
  await redis.hset(USERS_KEY, id, JSON.stringify(existing));
  return existing;
}

export async function listUsers(redis) {
  const all = await redis.hgetall(USERS_KEY);
  return Object.values(all)
    .map(parseRecord)
    .filter(Boolean);
}