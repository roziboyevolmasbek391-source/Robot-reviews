import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions, SessionData } from "@/lib/session";
import { ReviewSource } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const res = new NextResponse();
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: "Ruxsat etilmagan" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId") || undefined;
    const source = (searchParams.get("source") as ReviewSource) || undefined;
    const dateFromStr = searchParams.get("dateFrom") || undefined;
    const dateToStr = searchParams.get("dateTo") || undefined;

    // Sana diapazonlarini aniqlash
    const now = new Date();
    
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Baza sharti
    const baseWhere: any = {};
    if (branchId) baseWhere.branchId = branchId;
    if (source) baseWhere.source = source;

    if (dateFromStr || dateToStr) {
      baseWhere.reviewDate = {};
      if (dateFromStr) {
        baseWhere.reviewDate.gte = new Date(dateFromStr);
      }
      if (dateToStr) {
        baseWhere.reviewDate.lte = new Date(dateToStr);
      }
    }

    // 1. Umumiy va rating ko'rsatkichlari
    const reviews = await prisma.review.findMany({
      where: baseWhere,
      select: {
        rating: true,
        reviewDate: true,
        source: true,
        branchId: true,
        branch: {
          select: { name: true }
        },
        replyText: true,
        repliedAt: true,
        repliedBy: true,
        aiSentiment: true,
        aiTopics: true
      }
    });

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0 
      ? Math.round((reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews) * 10) / 10 
      : 0;

    const positiveReviews = reviews.filter(r => r.rating >= 4).length;
    const negativeReviews = reviews.filter(r => r.rating <= 2).length;
    
    // 2. Vaqt bo'yicha filtrlar (agar butun bazadagi reviews kerak bo'lsa, dateFrom/dateTo filtersiz hisoblashimiz ham mumkin)
    const reviewsToday = reviews.filter(r => new Date(r.reviewDate) >= todayStart).length;
    const reviewsYesterday = reviews.filter(r => {
      const d = new Date(r.reviewDate);
      return d >= yesterdayStart && d <= yesterdayEnd;
    }).length;
    const reviewsThisWeek = reviews.filter(r => new Date(r.reviewDate) >= sevenDaysAgo).length;
    const reviewsThisMonth = reviews.filter(r => new Date(r.reviewDate) >= thisMonthStart).length;

    // SLA analytics
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

    // AI Topics frequency distribution
    const topicCounts: Record<string, number> = {
      "Качество еды": 0,
      "Скорость доставки": 0,
      "Сервис/Обслуживание": 0,
      "Чистота": 0,
      "Цены": 0
    };
    reviews.forEach(r => {
      if (r.aiTopics) {
        r.aiTopics.split(", ").forEach(t => {
          const trimmed = t.trim();
          if (trimmed && topicCounts[trimmed] !== undefined) {
            topicCounts[trimmed]++;
          } else if (trimmed) {
            topicCounts[trimmed] = (topicCounts[trimmed] || 0) + 1;
          }
        });
      }
    });

    const topicDistributionArray = Object.keys(topicCounts).map(k => ({
      name: k,
      value: topicCounts[k]
    }));

    // AI Topics frequency distribution grouped by branch
    const topicDistributionByBranch: Record<string, Array<{ name: string; value: number }>> = {};
    topicDistributionByBranch["all"] = topicDistributionArray;

    const branchTopicCounts: Record<string, Record<string, number>> = {};
    reviews.forEach(r => {
      const bId = r.branchId;
      if (!branchTopicCounts[bId]) {
        branchTopicCounts[bId] = {
          "Качество еды": 0,
          "Скорость доставки": 0,
          "Сервис/Обслуживание": 0,
          "Чистота": 0,
          "Цены": 0
        };
      }
      if (r.aiTopics) {
        r.aiTopics.split(", ").forEach(t => {
          const trimmed = t.trim();
          if (trimmed && branchTopicCounts[bId][trimmed] !== undefined) {
            branchTopicCounts[bId][trimmed]++;
          }
        });
      }
    });

    Object.keys(branchTopicCounts).forEach(bId => {
      topicDistributionByBranch[bId] = Object.keys(branchTopicCounts[bId]).map(k => ({
        name: k,
        value: branchTopicCounts[bId][k]
      }));
    });

    // 3. Platformalar bo'yicha taqsimot
    const platformDistribution = reviews.reduce((acc: Record<string, number>, r) => {
      acc[r.source] = (acc[r.source] || 0) + 1;
      return acc;
    }, {});

    // 4. Filiallar bo'yicha taqsimot (va platformalar kesimida stacked count)
    const branchDistribution = reviews.reduce((acc: Record<string, { 
      name: string; 
      count: number; 
      ratingSum: number;
      thisMonthCount: number;
      lastMonthCount: number;
      GOOGLE_MAPS: number;
      YANDEX_MAPS: number;
      YANDEX_VENDOR: number;
      DGIS: number;
      UZUM_VENDOR: number;
    }>, r) => {
      const bId = r.branchId;
      const bName = r.branch?.name || "Noma'lum";
      const rDate = new Date(r.reviewDate);

      if (!acc[bId]) {
        acc[bId] = { 
          name: bName, 
          count: 0, 
          ratingSum: 0, 
          thisMonthCount: 0, 
          lastMonthCount: 0,
          GOOGLE_MAPS: 0,
          YANDEX_MAPS: 0,
          YANDEX_VENDOR: 0,
          DGIS: 0,
          UZUM_VENDOR: 0
        };
      }
      acc[bId].count += 1;
      acc[bId].ratingSum += r.rating;
      acc[bId][r.source] = (acc[bId][r.source] || 0) + 1;

      if (rDate >= thisMonthStart) {
        acc[bId].thisMonthCount += 1;
      } else if (rDate >= lastMonthStart && rDate <= lastMonthEnd) {
        acc[bId].lastMonthCount += 1;
      }

      return acc;
    }, {});

    const branchStats = Object.keys(branchDistribution).map(id => {
      const thisMonth = branchDistribution[id].thisMonthCount;
      const lastMonth = branchDistribution[id].lastMonthCount;
      const diff = thisMonth - lastMonth;

      return {
        id,
        name: branchDistribution[id].name,
        count: branchDistribution[id].count,
        averageRating: Math.round((branchDistribution[id].ratingSum / branchDistribution[id].count) * 10) / 10,
        thisMonthCount: thisMonth,
        lastMonthCount: lastMonth,
        growth: diff,
        GOOGLE_MAPS: branchDistribution[id].GOOGLE_MAPS || 0,
        YANDEX_MAPS: branchDistribution[id].YANDEX_MAPS || 0,
        YANDEX_VENDOR: branchDistribution[id].YANDEX_VENDOR || 0,
        DGIS: branchDistribution[id].DGIS || 0,
        UZUM_VENDOR: branchDistribution[id].UZUM_VENDOR || 0,
      };
    }).sort((a, b) => b.count - a.count);

    // 5. Baholar taqsimoti (1 dan 5 gacha) - global / tanlangan filial uchun
    const ratingDistribution = [1, 2, 3, 4, 5].reduce((acc: Record<number, number>, r) => {
      acc[r] = reviews.filter(rev => rev.rating === r).length;
      return acc;
    }, {});

    // Barcha filiallar uchun ratingDistributionByBranch hisoblash (Faqatgina sana filtri bo'yicha)
    const ratingWhere: any = {};
    if (source) ratingWhere.source = source;
    if (dateFromStr || dateToStr) {
      ratingWhere.reviewDate = {};
      if (dateFromStr) ratingWhere.reviewDate.gte = new Date(dateFromStr);
      if (dateToStr) ratingWhere.reviewDate.lte = new Date(dateToStr);
    }

    const ratingReviews = await prisma.review.findMany({
      where: ratingWhere,
      select: {
        rating: true,
        branchId: true
      }
    });

    const ratingDistributionByBranch: Record<string, Array<{ stars: string; count: number }>> = {};
    
    // global "all"
    const globalDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratingReviews.forEach(r => {
      globalDist[r.rating] = (globalDist[r.rating] || 0) + 1;
    });
    ratingDistributionByBranch["all"] = [1, 2, 3, 4, 5].map(stars => ({
      stars: `${stars} ⭐`,
      count: globalDist[stars] || 0
    }));

    // filiallar bo'yicha
    const branchRatingGroups: Record<string, Record<number, number>> = {};
    ratingReviews.forEach(r => {
      if (!branchRatingGroups[r.branchId]) {
        branchRatingGroups[r.branchId] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      }
      branchRatingGroups[r.branchId][r.rating] = (branchRatingGroups[r.branchId][r.rating] || 0) + 1;
    });

    Object.keys(branchRatingGroups).forEach(bId => {
      ratingDistributionByBranch[bId] = [1, 2, 3, 4, 5].map(stars => ({
        stars: `${stars} ⭐`,
        count: branchRatingGroups[bId][stars] || 0
      }));
    });

    // 6. Grafik uchun oxirgi 30 kundagi (yoki tanlangan davrdagi) kunlik sharhlar soni
    let dailyStart = new Date(thirtyDaysAgo);
    let dailyEnd = new Date(now);

    if (dateFromStr) {
      dailyStart = new Date(dateFromStr);
    }
    if (dateToStr) {
      dailyEnd = new Date(dateToStr);
    }

    const ds = new Date(dailyStart);
    ds.setHours(0, 0, 0, 0);
    const de = new Date(dailyEnd);
    de.setHours(23, 59, 59, 999);

    const dailyStats: Record<string, { 
      date: string; 
      count: number; 
      avgRating: number; 
      sum: number;
      GOOGLE_MAPS: number;
      YANDEX_MAPS: number;
      YANDEX_VENDOR: number;
      DGIS: number;
      UZUM_VENDOR: number;
    }> = {};
    
    const tempDate = new Date(ds);
    let daysCount = 0;
    while (tempDate <= de && daysCount < 180) {
      const dateStr = tempDate.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      dailyStats[tempDate.toDateString()] = { 
        date: dateStr, 
        count: 0, 
        avgRating: 0, 
        sum: 0,
        GOOGLE_MAPS: 0,
        YANDEX_MAPS: 0,
        YANDEX_VENDOR: 0,
        DGIS: 0,
        UZUM_VENDOR: 0
      };
      tempDate.setDate(tempDate.getDate() + 1);
      daysCount++;
    }

    reviews.forEach(r => {
      const dateKey = new Date(r.reviewDate).toDateString();
      if (dailyStats[dateKey]) {
        dailyStats[dateKey].count += 1;
        dailyStats[dateKey].sum += r.rating;
        dailyStats[dateKey].avgRating = Math.round((dailyStats[dateKey].sum / dailyStats[dateKey].count) * 10) / 10;
        dailyStats[dateKey][r.source] = (dailyStats[dateKey][r.source] || 0) + 1;
      }
    });

    const dailyStatsArray = Object.values(dailyStats);

    return NextResponse.json({
      summary: {
        totalReviews,
        averageRating,
        positiveReviews,
        negativeReviews,
        reviewsToday,
        reviewsYesterday,
        reviewsThisWeek,
        reviewsThisMonth,
        responseRate,
        averageResponseTimeMs,
      },
      charts: {
        platformDistribution: Object.keys(platformDistribution).map(k => ({
          name: k === "GOOGLE_MAPS" ? "Google Maps" : k === "YANDEX_MAPS" ? "Yandex Maps" : k === "YANDEX_VENDOR" ? "Yandex Vendor" : k === "UZUM_VENDOR" ? "Uzum Vendor" : "2GIS",
          value: platformDistribution[k],
          key: k,
        })),
        branchDistribution: branchStats, // Barcha filiallar
        ratingDistribution: Object.keys(ratingDistribution).map(k => ({
          stars: `${k} ⭐`,
          count: ratingDistribution[parseInt(k)],
        })),
        ratingDistributionByBranch,
        dailyStats: dailyStatsArray,
        topicDistribution: topicDistributionArray,
        topicDistributionByBranch,
      }
    });

  } catch (error) {
    console.error("Stats API error:", error);
    return NextResponse.json({ error: "Serverda xatolik" }, { status: 500 });
  }
}
