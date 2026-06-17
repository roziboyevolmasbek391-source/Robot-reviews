import { prisma } from "@/lib/prisma";
import { AutomationStatus, ReviewSource, SyncStatus } from "@prisma/client";
import { decrypt } from "@/lib/encryption";
import { SYSTEM_SETTING_KEYS } from "@/lib/constants";
import { GoogleReviewsConnector } from "@/connectors/google/google.connector";
import { YandexVendorConnector } from "@/connectors/yandex-vendor/yandex-vendor.connector";
import { YandexMapsConnector } from "@/connectors/yandex-maps/yandex-maps.connector";
import { DgisConnector } from "@/connectors/dgis/dgis.connector";
import { UzumVendorConnector } from "@/connectors/uzum-vendor/uzum-vendor.connector";
import { telegramService } from "@/features/notifications/services/telegram.service";
import { NormalizedReview } from "@/connectors/base.connector";
import { analyzeReview } from "@/lib/ai-analyzer";

function cleanReviewText(text: string | null): string {
  if (!text) return "";
  return text.toLowerCase()
    .replace(/[^a-z0-9а-яё]/g, "")
    .replace(/читатьдалее/g, "")
    .replace(/читатьполностью/g, "")
    .replace(/readmore/g, "");
}

export class SyncService {
  private async hasActiveAutomationRun() {
    const activeCount = await prisma.automationRun.count({
      where: {
        status: {
          in: [
            AutomationStatus.QUEUED,
            AutomationStatus.RUNNING,
            AutomationStatus.WAITING_FOR_USER,
          ],
        },
      },
    });

    return activeCount > 0;
  }

  /**
   * Ma'lum bir manba va filial uchun sinxronizatsiyani amalga oshirish
   */
  async syncBranchSource(branchId: string, source: ReviewSource): Promise<{
    synced: number;
    failed: number;
    duplicates: number;
    totalFound: number;
  }> {
    if (await this.hasActiveAutomationRun()) {
      console.log("[SyncService] Robot is active. Review sync skipped to avoid interfering with branch publishing.");
      return { synced: 0, failed: 0, duplicates: 0, totalFound: 0 };
    }

    const startedAt = new Date();

    // 1. Filial ma'lumotlarini olish
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: {
        platformIds: {
          where: { source },
        },
      },
    });

    if (!branch || branch.platformIds.length === 0) {
      return { synced: 0, failed: 0, duplicates: 0, totalFound: 0 };
    }

    const platformMapping = branch.platformIds[0];
    const platformId = platformMapping.platformId;

    // Agar platformId bo'sh bo'lsa (sozlanmagan), sinxronizatsiya qilmaymiz
    if (!platformId || platformId.trim() === "") {
      return { synced: 0, failed: 0, duplicates: 0, totalFound: 0 };
    }

    // 2. Konnektorni sozlash va mock ekanligini tekshirish
    const connector = await this.getConnectorForSource(source);
    if (connector.isMock) {
      // Mock ulagichlarni sinxronizatsiya qilmaymiz
      console.log(`[SyncService] ${source} uchun mock ulagich faol. Sinxronizatsiya o'tkazib yuborildi.`);
      return { synced: 0, failed: 0, duplicates: 0, totalFound: 0 };
    }

    let logId: string | null = null;

    try {
      // 3. Sinxronizatsiya logini yaratish
      const log = await prisma.reviewSyncLog.create({
        data: {
          source,
          branchId,
          status: SyncStatus.RUNNING,
          startedAt,
        },
      });
      logId = log.id;

      const authenticated = await connector.authenticate();
      if (!authenticated) {
        throw new Error("Konnektor autentifikatsiyadan o'ta olmadi.");
      }

      // 4. Sharhlarni yuklash
      const reviews = await connector.getReviews(platformId, 20);
      
      let syncedCount = 0;
      let duplicatesCount = 0;
      let failedCount = 0;

      for (const rawReview of reviews) {
        try {
          // 1. Dinamik ravishda sharh tegishli bo'lgan filialni aniqlaymiz
          let targetBranchId = branchId;
          let targetBranchName = branch.name;

          if (rawReview.externalPlaceId && rawReview.externalPlaceId !== platformId) {
            // Ushbu externalPlaceId uylangan filialni qidiramiz
            const mappedPlatform = await prisma.branchPlatformId.findUnique({
              where: {
                source_platformId: {
                  source,
                  platformId: rawReview.externalPlaceId,
                },
              },
              include: {
                branch: {
                  select: { id: true, name: true },
                },
              },
            });

            if (mappedPlatform && mappedPlatform.branch) {
              targetBranchId = mappedPlatform.branch.id;
              targetBranchName = mappedPlatform.branch.name;
            }
          }

          // 2. Dublikatlikni tekshirish (aniq ID bo'yicha)
          let existing = await prisma.review.findUnique({
            where: {
              source_externalReviewId: {
                source,
                externalReviewId: rawReview.externalReviewId,
              },
            },
          });

          // Fallback duplicate check for map reviews (truncated widget text vs full cabinet text)
          if (!existing && (source === ReviewSource.YANDEX_MAPS || source === ReviewSource.GOOGLE_MAPS)) {
            const baseDate = new Date(rawReview.reviewDate);
            const rangeStart = new Date(baseDate);
            rangeStart.setDate(rangeStart.getDate() - 14);
            const rangeEnd = new Date(baseDate);
            rangeEnd.setDate(rangeEnd.getDate() + 14);

            const candidates = await prisma.review.findMany({
              where: {
                source,
                branchId: targetBranchId,
                author: rawReview.author || "Anonim",
                rating: rawReview.rating,
                reviewDate: {
                  gte: rangeStart,
                  lte: rangeEnd
                }
              }
            });

            if (candidates.length > 0) {
              const rawNorm = cleanReviewText(rawReview.text);
              for (const cand of candidates) {
                const candNorm = cleanReviewText(cand.text);
                if (rawNorm === candNorm || (rawNorm !== "" && candNorm !== "" && (rawNorm.includes(candNorm) || candNorm.includes(rawNorm)))) {
                  existing = cand;
                  console.log(`[SyncService] Fuzzy matched existing review in DB: ID=${cand.id}, Author="${cand.author}"`);
                  break;
                }
              }
            }
          }

          if (existing) {
            const rawText = rawReview.text || "";
            const existingText = existing.text || "";
            const bestText = rawText.length > existingText.length ? rawText : existingText;
            const incomingReplyText = rawReview.replyText?.trim() || null;
            const existingReplyText = existing.replyText?.trim() || null;
            const shouldUpdateReply = incomingReplyText !== null;

            const hasReplyTextDiff = shouldUpdateReply && incomingReplyText !== existingReplyText;
            const hasTextDiff = (bestText || null) !== (existing.text || null);
            const hasRatingDiff = rawReview.rating !== existing.rating;
            const hasHashDiff = rawReview.externalReviewId !== existing.externalReviewId;

            if (hasReplyTextDiff || hasTextDiff || hasRatingDiff || hasHashDiff) {
              console.log(`[SyncService] Updating existing review ${existing.id}: ReplyTextDiff=${hasReplyTextDiff}, TextDiff=${hasTextDiff}, RatingDiff=${hasRatingDiff}, HashDiff=${hasHashDiff}`);
              await prisma.review.update({
                where: { id: existing.id },
                data: {
                  externalReviewId: rawReview.externalReviewId,
                  replyText: shouldUpdateReply ? incomingReplyText : existing.replyText,
                  repliedAt: rawReview.repliedAt || existing.repliedAt || (incomingReplyText ? new Date() : null),
                  text: bestText || null,
                  rating: rawReview.rating,
                  isNew: incomingReplyText ? false : existing.isNew,
                },
              });
              syncedCount++;
            } else {
              duplicatesCount++;
            }
            continue;
          }

          // Run AI Sentiment & Topic analysis
          const analysis = await analyzeReview(
            rawReview.text,
            rawReview.rating,
            rawReview.author || "Anonim",
            targetBranchName
          );

          // Bazaga saqlash
          const savedReview = await prisma.review.create({
            data: {
              branchId: targetBranchId,
              source,
              externalReviewId: rawReview.externalReviewId,
              author: rawReview.author || "Anonim",
              rating: rawReview.rating,
              text: rawReview.text,
              reviewUrl: rawReview.reviewUrl,
              reviewDate: new Date(rawReview.reviewDate),
              isNew: true,
              aiSentiment: analysis.sentiment,
              aiTopics: analysis.topics.join(", "),
            },
          });

          syncedCount++;

          // 5. Telegram bildirishnoma yuborish (rating <= 2)
          if (rawReview.rating <= 2) {
            await telegramService.sendNegativeReviewAlert({
              id: savedReview.id,
              source,
              branchName: targetBranchName,
              rating: rawReview.rating,
              author: rawReview.author || "Anonim",
              text: rawReview.text,
              reviewDate: new Date(rawReview.reviewDate),
              reviewUrl: rawReview.reviewUrl,
              aiTopics: analysis.topics.join(", "),
            });
          }
        } catch (err) {
          console.error(`[SyncService] Sharhni saqlashda xato:`, err);
          failedCount++;
        }
      }

      // Log holatini yangilash
      if (logId) {
        await prisma.reviewSyncLog.update({
          where: { id: logId },
          data: {
            status: SyncStatus.COMPLETED,
            syncedReviews: syncedCount,
            failedReviews: failedCount,
            duplicates: duplicatesCount,
            totalFound: reviews.length,
            finishedAt: new Date(),
          },
        });
      }

      return {
        synced: syncedCount,
        failed: failedCount,
        duplicates: duplicatesCount,
        totalFound: reviews.length,
      };

    } catch (error: any) {
      console.error(`[SyncService] Sinxronizatsiya xatosi (Branch: ${branchId}, Source: ${source}):`, error);
      
      if (logId) {
        await prisma.reviewSyncLog.update({
          where: { id: logId },
          data: {
            status: SyncStatus.FAILED,
            error: error.message || String(error),
            finishedAt: new Date(),
          },
        });
      }

      return { synced: 0, failed: 1, duplicates: 0, totalFound: 0 };
    }
  }

  /**
   * Barcha faol filiallar va manbalar bo'yicha to'liq sinxronizatsiyani ishga tushirish
   */
  async syncAll(): Promise<{
    processedBranches: number;
    syncedReviews: number;
    errorsCount: number;
  }> {
    if (await this.hasActiveAutomationRun()) {
      console.log("[SyncService] Robot is active. Full background sync skipped.");
      return { processedBranches: 0, syncedReviews: 0, errorsCount: 0 };
    }

    console.log("[SyncService] Barcha filiallar sinxronizatsiyasi boshlanmoqda...");
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      include: {
        platformIds: true,
      },
    });

    let processedBranches = 0;
    let syncedReviews = 0;
    let errorsCount = 0;

    for (const branch of branches) {
      for (const platformId of branch.platformIds) {
        try {
          const res = await this.syncBranchSource(branch.id, platformId.source);
          syncedReviews += res.synced;
          if (res.failed > 0) errorsCount++;
        } catch (err) {
          console.error(`Branch (${branch.name}) / Source (${platformId.source}) sync failed:`, err);
          errorsCount++;
        }
      }
      processedBranches++;
    }

    console.log(`[SyncService] Sinxronizatsiya yakunlandi. Filiallar: ${processedBranches}, Sharhlar yozildi: ${syncedReviews}, Xatoliklar: ${errorsCount}`);
    return { processedBranches, syncedReviews, errorsCount };
  }

  /**
   * Platformaga mos keladigan konnektorni kerakli API kalitlari bilan olish
   */
  private async getConnectorForSource(source: ReviewSource) {
    switch (source) {
      case ReviewSource.GOOGLE_MAPS: {
        const clientIdSetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.GOOGLE_CLIENT_ID } });
        const clientSecretSetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.GOOGLE_CLIENT_SECRET } });
        const refreshTokenSetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.GOOGLE_REFRESH_TOKEN } });

        const clientId = clientIdSetting?.value ? decrypt(clientIdSetting.value) : (process.env.GOOGLE_CLIENT_ID || "");
        const clientSecret = clientSecretSetting?.value ? decrypt(clientSecretSetting.value) : (process.env.GOOGLE_CLIENT_SECRET || "");
        const refreshToken = refreshTokenSetting?.value ? decrypt(refreshTokenSetting.value) : (process.env.GOOGLE_REFRESH_TOKEN || "");

        return new GoogleReviewsConnector({ clientId, clientSecret, refreshToken });
      }
      case ReviewSource.YANDEX_VENDOR: {
        const apiKeySetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.YANDEX_VENDOR_API_KEY } });
        const businessIdSetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.YANDEX_VENDOR_BUSINESS_ID } });
        const edaCookieSetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.YANDEX_EDA_COOKIE } });
        const edaOauthSetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.YANDEX_EDA_OAUTH } });
        const edaPartnerIdSetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.YANDEX_EDA_PARTNER_ID } });

        const apiKey = apiKeySetting?.value ? decrypt(apiKeySetting.value) : "";
        const businessId = businessIdSetting?.value || "";
        const edaCookie = edaCookieSetting?.value ? decrypt(edaCookieSetting.value) : "";
        const edaOauth = edaOauthSetting?.value ? decrypt(edaOauthSetting.value) : "";
        const edaPartnerId = edaPartnerIdSetting?.value ? (edaPartnerIdSetting.isSecret ? decrypt(edaPartnerIdSetting.value) : edaPartnerIdSetting.value) : "";

        return new YandexVendorConnector({ apiKey, businessId, edaCookie, edaOauth, edaPartnerId });
      }
      case ReviewSource.YANDEX_MAPS: {
        const apiKeySetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.YANDEX_API_KEY } });
        const apiKey = apiKeySetting?.value ? decrypt(apiKeySetting.value) : "";
        return new YandexMapsConnector({ apiKey });
      }
      case ReviewSource.DGIS: {
        const apiKeySetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.DGIS_API_KEY } });
        const apiKey = apiKeySetting?.value ? decrypt(apiKeySetting.value) : "";
        return new DgisConnector({ apiKey });
      }
      case ReviewSource.UZUM_VENDOR: {
        const cookieSetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.UZUM_COOKIE } });
        const tokenSetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.UZUM_TOKEN } });
        const merchantIdSetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.UZUM_MERCHANT_ID } });

        const cookie = cookieSetting?.value ? decrypt(cookieSetting.value) : "";
        const token = tokenSetting?.value ? decrypt(tokenSetting.value) : "";
        const merchantId = merchantIdSetting?.value || "";

        return new UzumVendorConnector({ cookie, token, merchantId });
      }
      default:
        throw new Error(`Noma'lum manba: ${source}`);
    }
  }
}

export const syncService = new SyncService();
