const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "your-fallback-32-char-encryption-key-for-dev!!";

function decrypt(text) {
  try {
    const textParts = text.split(":");
    const ivHex = textParts.shift();
    if (!ivHex) return "";
    const iv = Buffer.from(ivHex, "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const key = Buffer.concat([Buffer.from(ENCRYPTION_KEY)], 32);
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error("Decryption error in AI Analyzer:", error);
    return "";
  }
}

// Local Fallback Topics Keyword Matcher
function detectTopicsLocal(text) {
  if (!text) return [];
  const normalized = text.toLowerCase();
  const topics = [];

  if (normalized.includes("доставк") || normalized.includes("курьер") || normalized.includes("привез") || normalized.includes("опоздал") || normalized.includes("olib kelish") || normalized.includes("kuryer") || normalized.includes("yetkaz")) {
    topics.push("Скорость доставки");
  }
  if (normalized.includes("официант") || normalized.includes("обслуж") || normalized.includes("персонал") || normalized.includes("сервис") || normalized.includes("вежлив") || normalized.includes("официан") || normalized.includes("xizmat") || normalized.includes("muomala") || normalized.includes("kutib")) {
    topics.push("Сервис/Обслуживание");
  }
  if (normalized.includes("вкусн") || normalized.includes("ед[ау]") || normalized.includes("блюд") || normalized.includes("меню") || normalized.includes("шашлык") || normalized.includes("мяс") || normalized.includes("куриц") || normalized.includes("пицц") || normalized.includes("тест") || normalized.includes("shirin") || normalized.includes("ovqat") || normalized.includes("taom") || normalized.includes("lazzat")) {
    topics.push("Качество еды");
  }
  if (normalized.includes("чист") || normalized.includes("гряз") || normalized.includes("уборн") || normalized.includes("стол") || normalized.includes("зал") || normalized.includes("toza") || normalized.includes("iflos") || normalized.includes("tualet")) {
    topics.push("Чистота");
  }
  if (normalized.includes("цен[ыа]") || normalized.includes("дорог") || normalized.includes("дешёв") || normalized.includes("дешев") || normalized.includes("скидк") || normalized.includes("акци") || normalized.includes("narx") || normalized.includes("qimmat") || normalized.includes("arzon")) {
    topics.push("Цены");
  }

  return topics;
}

// Local Fallback Draft Templates
function generateLocalDrafts(text, rating, authorName, branchName) {
  const author = authorName && authorName !== "Anonim" ? authorName : "клиент";
  const branch = branchName || "наш филиал";
  const topics = detectTopicsLocal(text);
  const primaryTopic = topics[0] || "обслуживание";

  let topicTextRu = "нашу работу";
  let topicTextUz = "ishimizni";

  if (primaryTopic === "Качество еды") {
    topicTextRu = "качество блюд";
    topicTextUz = "taomlarimiz sifatini";
  } else if (primaryTopic === "Скорость доставки") {
    topicTextRu = "доставку";
    topicTextUz = "yetkazib berish xizmatini";
  } else if (primaryTopic === "Чистота") {
    topicTextRu = "чистоту и уют";
    topicTextUz = "tozalik va shinamlikni";
  } else if (primaryTopic === "Цены") {
    topicTextRu = "нашу ценовую политику";
    topicTextUz = "narxlarimizni";
  } else if (primaryTopic === "Сервис/Обслуживание") {
    topicTextRu = "сервис и обслуживание";
    topicTextUz = "xizmat ko'rsatish darajasini";
  }

  if (rating >= 4) {
    return {
      replyRu: `Здравствуйте, ${author}! Огромное спасибо за ваш отзыв и высокую оценку. Нам очень приятно, что вы отметили ${topicTextRu} в ${branch}. С нетерпением ждем вас снова в Mazzali! 😊`,
      replyUz: `Assalomu alaykum, ${author}! Fikr-mulohazangiz va yuqori bahoingiz uchun katta rahmat. Sizga ${branch}-dagi ${topicTextUz} yoqqanidan juda xursandmiz. Mazzali-da sizni yana kutib qolamiz! 😊`
    };
  } else if (rating === 3) {
    return {
      replyRu: `Здравствуйте, ${author}! Благодарим за обратную связь. Нам важен любой отзыв, чтобы становиться лучше. Мы обязательно обратим внимание на ${topicTextRu}, чтобы при следующем визите заслужить вашу высшую оценку. Будем рады видеть вас снова!`,
      replyUz: `Assalomu alaykum, ${author}! Fikr-mulohazangiz uchun rahmat. Xizmatlarimizni yanada yaxshilash uchun har bir fikr biz uchun qimmatli. Keyingi tashrifingizda sizni to'liq mamnun qilish uchun albatta ${topicTextUz} yaxshilash ustida ishlaymiz. Yana kutib qolamiz!`
    };
  } else {
    return {
      replyRu: `Здравствуйте, ${author}! Приносим искренние извинения за то, что расстроили вас. Нам очень жаль, что у вас возникли нарекания на ${topicTextRu}. Пожалуйста, свяжитесь с нами в Telegram @MazzaliFeedbackBot и напишите подробности визита, чтобы мы могли оперативно исправить ситуацию.`,
      replyUz: `Assalomu alaykum, ${author}! Sizga noqulaylik tug'dirganimiz va xafa qilganimiz uchun chin dildan uzr so'raymiz. Bizning ${topicTextUz} sizda e'tiroz uyg'otganidan juda afsusdamiz. Iztiholni bartaraf etishimiz uchun iltimos, Telegram orqali @MazzaliFeedbackBot manziliga batafsilroq yozib yuboring.`
    };
  }
}

// Main AI analysis function (updates sentiment, topics, and suggests replies)
async function analyzeReview(text, rating, authorName = "Anonim", branchName = "") {
  // Set default sentiment and local topics
  let sentiment = rating >= 4 ? "POSITIVE" : rating === 3 ? "NEUTRAL" : "NEGATIVE";
  let topics = detectTopicsLocal(text);
  let drafts = generateLocalDrafts(text, rating, authorName, branchName);

  // Return high-fidelity local templates
  return {
    sentiment,
    topics,
    replyRu: drafts.replyRu,
    replyUz: drafts.replyUz,
    aiUsed: false
  };
}

module.exports = {
  analyzeReview,
  detectTopicsLocal,
  generateLocalDrafts
};
