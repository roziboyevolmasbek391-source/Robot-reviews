export async function register() {
  // Biz Next.js instrumentation yordamida faqat server muhitida cronni boshlaymiz
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Instrumentation] Server ishga tushdi, cron joblar sozlanmoqda...");
    const { initSyncJob } = await import("./features/sync/jobs/sync.job");
    // Bir marta ishga tushgandan so'ng xatolikka yo'l qo'ymaslik uchun try-catch'ga olamiz
    try {
      await initSyncJob();
    } catch (e) {
      console.error("[Instrumentation] Cron jobni boshlashda xatolik:", e);
    }
  }
}
