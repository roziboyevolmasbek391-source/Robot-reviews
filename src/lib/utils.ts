import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(date: Date | string): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

export function getStarEmoji(rating: number): string {
  return "⭐".repeat(rating) + "☆".repeat(5 - rating);
}

export function getRatingColor(rating: number): string {
  if (rating >= 4) return "text-emerald-500";
  if (rating === 3) return "text-amber-500";
  return "text-red-500";
}

export function getRatingBg(rating: number): string {
  if (rating >= 4) return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  if (rating === 3) return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  return "bg-red-500/10 text-red-500 border-red-500/20";
}

export function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    GOOGLE_MAPS: "Google Maps",
    YANDEX_MAPS: "Yandex Maps",
    YANDEX_VENDOR: "Yandex Vendor",
    DGIS: "2GIS",
    UZUM_VENDOR: "Uzum Vendor",
  };
  return labels[source] || source;
}

export function getSourceColor(source: string): string {
  const colors: Record<string, string> = {
    GOOGLE_MAPS: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    YANDEX_MAPS: "bg-red-500/10 text-red-500 border-red-500/20",
    YANDEX_VENDOR: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    DGIS: "bg-green-500/10 text-green-500 border-green-500/20",
    UZUM_VENDOR: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  };
  return colors[source] || "bg-gray-500/10 text-gray-500 border-gray-500/20";
}

export function getSourceIcon(source: string): string {
  const icons: Record<string, string> = {
    GOOGLE_MAPS: "🔵",
    YANDEX_MAPS: "🔴",
    YANDEX_VENDOR: "🟣",
    DGIS: "🟢",
    UZUM_VENDOR: "🟠",
  };
  return icons[source] || "⚪";
}

export function truncateText(text: string, maxLength: number = 100): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type DateRange = {
  from: Date;
  to: Date;
};

export function getDateRange(period: string): DateRange {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  let from = new Date(now);
  from.setHours(0, 0, 0, 0);

  switch (period) {
    case "today":
      break;
    case "yesterday":
      from.setDate(from.getDate() - 1);
      to.setDate(to.getDate() - 1);
      to.setHours(23, 59, 59, 999);
      break;
    case "7days":
      from.setDate(from.getDate() - 7);
      break;
    case "30days":
      from.setDate(from.getDate() - 30);
      break;
    case "90days":
      from.setDate(from.getDate() - 90);
      break;
    case "all":
      from = new Date(2020, 0, 1);
      break;
    default:
      break;
  }

  return { from, to };
}

export interface ReviewTag {
  label: string;
  colorClass: string;
}

export function getWarningTags(text: string | null, rating?: number): ReviewTag[] {
  if (!text) return [];
  const r = rating !== undefined ? rating : 5;
  const lower = text.toLowerCase();
  const tags: ReviewTag[] = [];

  // Parse Uzum custom tags if text starts with "[Теги:"
  if (lower.startsWith("[теги:") || lower.startsWith("[теги :")) {
    const rawTags = text
      .replace(/^\[теги\s*:\s*/i, "")
      .replace(/\]\s*$/, "")
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);

    rawTags.forEach(rawTag => {
      const rtLower = rawTag.toLowerCase();
      if (rtLower.includes("вкусная еда") || rtLower.includes("вкусная  еда")) {
        tags.push({ label: "Вкусно / Yoqimli ta'm 👍", colorClass: "bg-emerald-600/90 text-white border-emerald-500 shadow-emerald-950/40" });
      } else if (rtLower.includes("качество упаковки") || rtLower.includes("качество  упаковки")) {
        tags.push({ label: "Качественно / Sifatli ✨", colorClass: "bg-emerald-600/90 text-white border-emerald-500 shadow-emerald-950/40" });
      } else if (rtLower.includes("приборы в комплекте") || rtLower.includes("приборы  в комплекте")) {
        tags.push({ label: "Приборы на месте / Priborlar bor 🍴", colorClass: "bg-emerald-600/90 text-white border-emerald-500 shadow-emerald-950/40" });
      } else if (rtLower.includes("скорость доставки") || rtLower.includes("скорость  доставки")) {
        tags.push({ label: "Быстро / Tezkor ⏱️", colorClass: "bg-emerald-600/90 text-white border-emerald-500 shadow-emerald-950/40" });
      } else if (rtLower.includes("вежливость курьера") || rtLower.includes("вежливость  курьера")) {
        tags.push({ label: "Вежливый курьер / Kuryer odobli 🚴", colorClass: "bg-emerald-600/90 text-white border-emerald-500 shadow-emerald-950/40" });
      } else if (rtLower.includes("курьер был в форме") || rtLower.includes("курьер был  в форме")) {
        tags.push({ label: "Курьер в форме / Kuryer formada 🚴", colorClass: "bg-emerald-600/90 text-white border-emerald-500 shadow-emerald-950/40" });
      } else if (rtLower.includes("учел комментарий")) {
        tags.push({ label: "Учел комментарий / Izohni hisobga oldi 📝", colorClass: "bg-emerald-600/90 text-white border-emerald-500 shadow-emerald-950/40" });
      } else if (rtLower.includes("еда остыла") || rtLower.includes("еда  остыла")) {
        tags.push({ label: "Холодная еда / Ovqat sovigan ❄️", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
      } else if (rtLower.includes("еда невкусная") || rtLower.includes("еда  невкусная")) {
        tags.push({ label: "Не вкусно / Mazasiz 🤢", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
      } else if (rtLower.includes("плохо упаковано") || rtLower.includes("плохо  упаковано")) {
        tags.push({ label: "Плохо упаковано / Yomon qadoq 📦", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
      } else if (rtLower.includes("заказ неполный") || rtLower.includes("заказ  неполный")) {
        tags.push({ label: "Неполный заказ / To'liq emas 📦", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
      } else if (rtLower.includes("не было приборов") || rtLower.includes("не было  приборов")) {
        tags.push({ label: "Нет приборов / Priborsiz 🍴", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
      } else if (rtLower.includes("блюдо не как на фото") || rtLower.includes("блюдо не как  на фото")) {
        tags.push({ label: "Не как на фото / Rasmdagidek emas 📸", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
      } else if (rtLower.includes("не учли пожелания") || rtLower.includes("не учли  пожелания")) {
        tags.push({ label: "Не учли пожелания / Istak hisobga olinmadi 📝", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
      } else if (rtLower.includes("курьер долго искал адрес") || rtLower.includes("курьер долго  искал адрес")) {
        tags.push({ label: "Долго искали адрес / Manzil kechikdi ⏱️", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
      } else if (rtLower.includes("заказ поврежден") || rtLower.includes("заказ  поврежден")) {
        tags.push({ label: "Поврежден заказ / Shikastlangan 📦", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
      } else if (rtLower.includes("курьер был невежлив") || rtLower.includes("курьер был  невежлив")) {
        tags.push({ label: "Курьер невежлив / Kuryer qo'pol 🚴", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
      } else if (rtLower.includes("курьер не учел комментарий") || rtLower.includes("курьер не учел  комментарий")) {
        tags.push({ label: "Не учел комментарий / Izohni e'tiborsiz qoldirdi 📝", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
      } else if (rtLower.includes("долгая доставка") || rtLower.includes("долгая  доставка")) {
        tags.push({ label: "Долгая доставка / Kech qoldi ⏱️", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
      } else {
        const isNeg = r <= 2;
        const isNeut = r === 3;
        tags.push({
          label: rawTag,
          colorClass: isNeg 
            ? "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40"
            : isNeut
            ? "bg-amber-500/90 text-white border-amber-400 shadow-amber-950/40"
            : "bg-emerald-600/90 text-white border-emerald-500 shadow-emerald-950/40"
        });
      }
    });

    if (tags.length > 0) return tags;
  }

  // 1. Срок годности / Просрочено
  if (
    lower.includes("просроч") || 
    lower.includes("плесень") || 
    lower.includes("скис") || 
    lower.includes("прокис") || 
    lower.includes("испорч") || 
    lower.includes("протух") || 
    lower.includes("давности") || 
    lower.includes("срок") || 
    lower.includes("muddati") || 
    lower.includes("ayni") || 
    lower.includes("chirigan") ||
    lower.includes("отрав") ||
    lower.includes("bolot") ||
    lower.includes("болот") ||
    lower.includes("запах") ||
    lower.includes("воняет") ||
    lower.includes("тухл") ||
    lower.includes("вонюч") ||
    lower.includes("sassiq")
  ) {
    tags.push({ label: "Срок годности / Muddati o'tgan 🤢", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
  }

  // 2. Недовоз / Неполный заказ
  if (
    lower.includes("не полож") || 
    lower.includes("не довез") || 
    lower.includes("не хват") || 
    lower.includes("забыл") || 
    lower.includes("не приш") || 
    lower.includes("вместо") || 
    lower.includes("перепут") || 
    lower.includes("не привез") || 
    lower.includes("kam keldi") || 
    lower.includes("solishmabdi") || 
    lower.includes("adash") ||
    lower.includes("порция") ||
    lower.includes("gramm") ||
    lower.includes("грамм") ||
    lower.includes("неполн") ||
    lower.includes("chala") ||
    lower.includes("etishmov") ||
    lower.includes("кам келди")
  ) {
    tags.push({ label: "Недовоз / Kam keldi 📦", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
  }

  // 3. Нет приборов
  if (
    lower.includes("прибор") || 
    lower.includes("вилк") || 
    lower.includes("ложк") || 
    lower.includes("pribor") || 
    lower.includes("qoshiq") || 
    lower.includes("vilka") || 
    lower.includes("салфетк") ||
    lower.includes("priborlar") ||
    lower.includes("ложек") ||
    lower.includes("вилок")
  ) {
    tags.push({ label: "Нет приборов / Priborsiz 🍴", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
  }

  // 4. Холодная еда
  if (
    lower.includes("холодн") || 
    lower.includes("остыл") || 
    lower.includes("муз") || 
    lower.includes("muz") || 
    lower.includes("sovuq") || 
    lower.includes("sovigan") ||
    lower.includes("холодное") ||
    lower.includes("муздак")
  ) {
    tags.push({ label: "Холодная еда / Ovqat sovigan ❄️", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
  }

  // 5. Не разогрели
  if (
    lower.includes("не разогре") ||
    lower.includes("не подогре") ||
    lower.includes("подогре") ||
    lower.includes("разогре") ||
    lower.includes("isitish")
  ) {
    tags.push({ label: "Не разогрели / Isitilmagan ❄️", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
  }

  // 6. Не вкусно
  if (
    lower.includes("не вкус") || 
    lower.includes("невкус") || 
    lower.includes("мазасиз") || 
    lower.includes("mazasiz") || 
    lower.includes("безвкус") || 
    lower.includes("ужасн") ||
    lower.includes("shur") ||
    lower.includes("солен") ||
    lower.includes("пересол") ||
    lower.includes("странный вкус") ||
    lower.includes("g'alati ta'm")
  ) {
    tags.push({ label: "Не вкусно / Mazasiz 🤢", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
  }

  // 7. Плохое качество / Волосья / Грязь
  if (
    lower.includes("сыро") || 
    lower.includes("syro") || 
    lower.includes("xom") || 
    lower.includes("sifatsiz") || 
    lower.includes("гнило") ||
    lower.includes("волос") ||
    lower.includes("волоси") ||
    lower.includes("soch") ||
    lower.includes("tük") ||
    lower.includes("tuk") ||
    lower.includes("грязн") ||
    lower.includes("kir") ||
    lower.includes("pesok") ||
    lower.includes("камень") ||
    lower.includes("песок") ||
    lower.includes("хрящ") ||
    lower.includes("жир") ||
    lower.includes("кости") ||
    lower.includes("кост")
  ) {
    tags.push({ label: "Плохое качество / Sifatsiz ⚠️", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
  }

  // 8. Курьер / Доставка
  if (
    lower.includes("курьер") || 
    lower.includes("достав") || 
    lower.includes("kuryer") || 
    lower.includes("dostav") || 
    lower.includes("звонил") || 
    lower.includes("позвонил") || 
    lower.includes("спусти") || 
    lower.includes("встрет") || 
    lower.includes("улицу") || 
    lower.includes("груб") || 
    lower.includes("опозда")
  ) {
    tags.push({ label: "Курьер / Kuryer muammosi 🚴", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
  }

  // 9. Staff/Service
  if (
    lower.includes("персонал") ||
    lower.includes("продавец") ||
    lower.includes("официант") ||
    lower.includes("кассир") ||
    lower.includes("манер") ||
    lower.includes("отношен") ||
    lower.includes("груб") ||
    lower.includes("xodim") ||
    lower.includes("sotuvchi") ||
    lower.includes("ofisiant") ||
    lower.includes("kassir") ||
    lower.includes("muomala") ||
    lower.includes("админ") ||
    lower.includes("хами")
  ) {
    tags.push({ label: "Грубый персонал / Qo'pol xodim 👤", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
  }

  // 10. Payment issues
  if (
    lower.includes("хумо") ||
    lower.includes("humo") ||
    lower.includes("узкард") ||
    lower.includes("uzcard") ||
    lower.includes("терминал") ||
    lower.includes("оплат") ||
    lower.includes("click") ||
    lower.includes("payme") ||
    lower.includes("карт") ||
    lower.includes("пластик") ||
    lower.includes("наличн")
  ) {
    tags.push({ label: "Проблемы с оплатой / To'lov muammosi 💳", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
  }

  // 11. Positive matching (only when rating >= 4)
  if (r >= 4) {
    // Taste
    if (
      lower.includes("вкусн") || 
      lower.includes("класс") || 
      lower.includes("супер") || 
      lower.includes("шикар") || 
      lower.includes("rahmat") || 
      lower.includes("спасибо") || 
      lower.includes("отлич") || 
      lower.includes("zor") || 
      lower.includes("зор") || 
      lower.includes("super") || 
      lower.includes("lazzat") || 
      lower.includes("mazali") || 
      lower.includes("yoqdi") || 
      lower.includes("рекоменд")
    ) {
      tags.push({ label: "Вкусно / Yoqimli ta'm 👍", colorClass: "bg-emerald-600/90 text-white border-emerald-500 shadow-emerald-950/40" });
    }

    // Freshness
    if (
      lower.includes("свеж") || 
      lower.includes("yangi") || 
      lower.includes("fresh")
    ) {
      tags.push({ label: "Свежее / Yangi 🍎", colorClass: "bg-emerald-600/90 text-white border-emerald-500 shadow-emerald-950/40" });
    }

    // Quality
    if (
      lower.includes("качест") || 
      lower.includes("sifatli") || 
      lower.includes("sifat") || 
      lower.includes("аккурат") || 
      lower.includes("chiroyli") || 
      lower.includes("красив")
    ) {
      tags.push({ label: "Качественно / Sifatli ✨", colorClass: "bg-emerald-600/90 text-white border-emerald-500 shadow-emerald-950/40" });
    }

    // Speed
    if (
      lower.includes("быстр") || 
      lower.includes("tez") || 
      lower.includes("tezkor") || 
      lower.includes("скоро") || 
      lower.includes("momental")
    ) {
      tags.push({ label: "Быстро / Tezkor ⏱️", colorClass: "bg-emerald-600/90 text-white border-emerald-500 shadow-emerald-950/40" });
    }
  }

  // Fallbacks if no keywords matched but text exists
  if (tags.length === 0) {
    if (r >= 4) {
      tags.push({ label: "Хороший отзыв / Yaxshi fikr 👍", colorClass: "bg-emerald-600/90 text-white border-emerald-500 shadow-emerald-950/40" });
    } else if (r === 3) {
      tags.push({ label: "Нейтральный отзыв / Neytral fikr 💬", colorClass: "bg-amber-500/90 text-white border-amber-400 shadow-amber-950/40" });
    } else {
      tags.push({ label: "Негативный отзыв / Salbiy fikr 💬", colorClass: "bg-red-600/90 text-white border-red-500 animate-pulse shadow-red-950/40" });
    }
  }

  return tags;
}


