import cron from "node-cron";
import { syncService } from "../services/sync.service";
import { prisma } from "@/lib/prisma";
import { SYSTEM_SETTING_KEYS } from "@/lib/constants";

let isRunning = false;
let cronJob: ReturnType<typeof cron.schedule> | null = null;
let weeklyReportJob: ReturnType<typeof cron.schedule> | null = null;

export async function initSyncJob() {
  // Avvalgi cron joblar mavjud bo'lsa ularni to'xtatamiz
  if (cronJob) {
    cronJob.stop();
  }
  if (weeklyReportJob) {
    weeklyReportJob.stop();
  }

  // Sozlamalardan sinxronizatsiya intervalini olamiz (default 10 daqiqa)
  let intervalSetting = await prisma.systemSetting.findUnique({
    where: { key: SYSTEM_SETTING_KEYS.SYNC_INTERVAL_MINUTES },
  });

  const minutes = intervalSetting ? parseInt(intervalSetting.value) || 10 : 10;
  console.log(`[Sync Job] Sinxronizatsiya cron jarayoni har ${minutes} daqiqada ishlashga sozlandi.`);

  // Cron ifodasini tuzamiz
  const cronExpression = `*/${minutes} * * * *`;

  cronJob = cron.schedule(cronExpression, async () => {
    if (isRunning) {
      console.log("[Sync Job] Avvalgi sinxronizatsiya hali tugamadi. Navbatdagi sikl o'tkazib yuborildi.");
      return;
    }

    try {
      isRunning = true;
      console.log(`[Sync Job] Fondagi avtomatik sinxronizatsiya boshlandi: ${new Date().toLocaleString()}`);
      await syncService.syncAll();
    } catch (e) {
      console.error("[Sync Job] Fondagi sinxronizatsiya bajarilishida xatolik:", e);
    } finally {
      isRunning = false;
      console.log("[Sync Job] Fondagi avtomatik sinxronizatsiya yakunlandi.");
    }
  });

  // Har dushanba kuni soat 9:00 da haftalik hisobot yuborish
  weeklyReportJob = cron.schedule("0 9 * * 1", async () => {
    console.log(`[Weekly Report Job] Haftalik hisobot yaratish boshlandi: ${new Date().toLocaleString()}`);
    try {
      const { generateWeeklyReportBuffer } = await import("@/lib/weekly-report-generator");
      const { telegramService } = await import("@/features/notifications/services/telegram.service");

      const report = await generateWeeklyReportBuffer();
      const startDateStr = report.startDate.toISOString().split("T")[0];
      const endDateStr = report.endDate.toISOString().split("T")[0];
      const fileName = `weekly_report_${startDateStr}_to_${endDateStr}.xlsx`;

      await telegramService.sendDocument(report.buffer, fileName, report.summaryText);
      console.log("[Weekly Report Job] Haftalik Excel hisoboti Telegramga muvaffaqiyatli yuborildi.");
    } catch (e) {
      console.error("[Weekly Report Job] Haftalik hisobot yuborishda xatolik:", e);
    }
  });

  // Cronlarni ishga tushiramiz
  cronJob.start();
  weeklyReportJob.start();
}

/**
 * Interval o'zgarganda cronni qayta ishga tushirish funksiyasi
 */
export async function reloadSyncJob() {
  console.log("[Sync Job] Interval o'zgardi, cron qayta yuklanmoqda...");
  await initSyncJob();
}
