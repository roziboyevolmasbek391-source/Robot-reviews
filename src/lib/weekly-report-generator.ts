import * as XLSX from "xlsx";
import { prisma } from "./prisma";

export async function generateWeeklyReportBuffer(): Promise<{
  buffer: Buffer;
  summaryText: string;
  startDate: Date;
  endDate: Date;
}> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  // Fetch reviews in the last 7 days
  const reviews = await prisma.review.findMany({
    where: {
      reviewDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      branch: true,
    },
    orderBy: {
      reviewDate: "desc",
    },
  });

  const totalReviews = reviews.length;
  const averageRating = totalReviews > 0
    ? Math.round((reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews) * 10) / 10
    : 0;
  const positiveCount = reviews.filter(r => r.rating >= 4).length;
  const negativeCount = reviews.filter(r => r.rating <= 2).length;
  const repliedReviewsCount = reviews.filter(r => r.replyText).length;
  const responseRate = totalReviews > 0 ? Math.round((repliedReviewsCount / totalReviews) * 100) : 0;

  const reviewsWithReplyTime = reviews.filter(r => r.repliedAt && r.reviewDate);
  let averageResponseTimeMs = 0;
  if (reviewsWithReplyTime.length > 0) {
    const totalMs = reviewsWithReplyTime.reduce((acc, r) => {
      const diff = new Date(r.repliedAt!).getTime() - new Date(r.reviewDate).getTime();
      return acc + (diff > 0 ? diff : 0);
    }, 0);
    averageResponseTimeMs = Math.round(totalMs / reviewsWithReplyTime.length);
  }

  function formatSLADurationMs(ms: number) {
    if (ms <= 0) return "—";
    const diffMins = Math.floor(ms / 60000);
    if (diffMins < 60) return `${diffMins} мин.`;
    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    if (diffHours < 24) return `${diffHours} ч. ${remainingMins} мин.`;
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    return `${diffDays} дн. ${remainingHours} ч.`;
  }

  const averageResponseTimeText = averageResponseTimeMs > 0 ? formatSLADurationMs(averageResponseTimeMs) : "—";

  // Platform Breakdown
  const platformCounts: Record<string, { total: number; avgRating: number; sum: number }> = {};
  reviews.forEach(r => {
    if (!platformCounts[r.source]) {
      platformCounts[r.source] = { total: 0, avgRating: 0, sum: 0 };
    }
    platformCounts[r.source].total += 1;
    platformCounts[r.source].sum += r.rating;
    platformCounts[r.source].avgRating = Math.round((platformCounts[r.source].sum / platformCounts[r.source].total) * 10) / 10;
  });

  // Branch Breakdown
  const branchCounts: Record<string, { name: string; total: number; avgRating: number; sum: number; replied: number }> = {};
  reviews.forEach(r => {
    const bId = r.branchId;
    const bName = r.branch?.name || "Noma'lum";
    if (!branchCounts[bId]) {
      branchCounts[bId] = { name: bName, total: 0, avgRating: 0, sum: 0, replied: 0 };
    }
    branchCounts[bId].total += 1;
    branchCounts[bId].sum += r.rating;
    branchCounts[bId].avgRating = Math.round((branchCounts[bId].sum / branchCounts[bId].total) * 10) / 10;
    if (r.replyText) {
      branchCounts[bId].replied += 1;
    }
  });

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Sheet 1: Общая сводка
  const summaryRows = [
    ["ЕЖЕНЕДЕЛЬНЫЙ ОТЧЕТ ПО ОТЗЫВАМ"],
    [`Период: ${startDate.toLocaleDateString("ru-RU")} - ${endDate.toLocaleDateString("ru-RU")}`],
    [],
    ["ОСНОВНЫЕ ПОКАЗАТЕЛИ"],
    ["Показатель", "Значение"],
    ["Всего новых отзывов", totalReviews],
    ["Средний рейтинг", averageRating],
    ["Положительные отзывы (4-5)", positiveCount],
    ["Негативные отзывы (1-2)", negativeCount],
    ["Доля отвеченных отзывов (SLA)", `${responseRate}%`],
    ["Среднее время ответа (SLA)", averageResponseTimeText],
    [],
    ["РАСПРЕДЕЛЕНИЕ ПО ПЛАТФОРМАМ"],
    ["Платформа", "Количество отзывов", "Средний рейтинг"],
  ];

  const platformLabels: Record<string, string> = {
    GOOGLE_MAPS: "Google Maps",
    YANDEX_MAPS: "Yandex Maps",
    YANDEX_VENDOR: "Yandex Eda (Vendor)",
    DGIS: "2GIS",
    UZUM_VENDOR: "Uzum Tezkor (Vendor)",
  };

  Object.keys(platformCounts).forEach(source => {
    summaryRows.push([
      platformLabels[source] || source,
      platformCounts[source].total,
      platformCounts[source].avgRating
    ]);
  });

  summaryRows.push([], ["СТАТИСТИКА ПО ФИЛИАЛАМ"], ["Филиал", "Всего отзывов", "Средний рейтинг", "Отвечено", "Доля ответов (%)"]);
  Object.keys(branchCounts).forEach(bId => {
    const b = branchCounts[bId];
    const bRate = b.total > 0 ? Math.round((b.replied / b.total) * 100) : 0;
    summaryRows.push([
      b.name,
      b.total,
      b.avgRating,
      b.replied,
      `${bRate}%`
    ]);
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Сводка");

  // Sheet 2: Список отзывов
  const reviewHeaders = [
    "Дата", "Филиал", "Платформа", "Рейтинг", "Автор", "Текст отзыва", "Тональность", "Темы", "Отвечено?", "Кто ответил", "Время ответа (SLA)"
  ];
  const reviewRows = reviews.map(r => {
    const slaText = r.repliedAt ? formatSLADurationMs(new Date(r.repliedAt).getTime() - new Date(r.reviewDate).getTime()) : "—";
    return [
      new Date(r.reviewDate).toLocaleString("ru-RU"),
      r.branch?.name || "Noma'lum",
      platformLabels[r.source] || r.source,
      r.rating,
      r.author,
      r.text || "—",
      r.aiSentiment || "—",
      r.aiTopics || "—",
      r.replyText ? "Да" : "Нет",
      r.repliedBy || "—",
      slaText
    ];
  });

  const wsReviews = XLSX.utils.aoa_to_sheet([reviewHeaders, ...reviewRows]);
  XLSX.utils.book_append_sheet(wb, wsReviews, "Список отзывов");

  // Generate buffer
  const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const summaryText = `
📊 <b>ЕЖЕНЕДЕЛЬНЫЙ ИНФОРМАЦИОННЫЙ ОТЧЕТ</b>
📅 <b>Период:</b> ${startDate.toLocaleDateString("ru-RU")} - ${endDate.toLocaleDateString("ru-RU")}

📈 <b>Сводные показатели:</b>
• Всего новых отзывов: <b>${totalReviews} шт.</b>
• Средний рейтинг: <b>★ ${averageRating}</b>
• Положительные (4-5 ⭐): <b>${positiveCount} шт.</b>
• Негативные (1-2 ⭐): <b>${negativeCount} шт.</b>
• Доля ответов (SLA): <b>${responseRate}%</b>
• Среднее время ответа: <b>${averageResponseTimeText}</b>

🏢 <b>Топ филиалов по отзывам:</b>
${Object.keys(branchCounts).slice(0, 5).map(bId => {
  const b = branchCounts[bId];
  return `• ${b.name}: <b>${b.total} шт.</b> (★ ${b.avgRating})`;
}).join("\n")}

<i>Подробный отчет с распределением по платформам и полным списком отзывов прикреплен в файле Excel.</i>
`;

  return {
    buffer: excelBuffer,
    summaryText,
    startDate,
    endDate
  };
}
