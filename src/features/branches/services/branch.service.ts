import { prisma } from "@/lib/prisma";
import { ReviewSource } from "@prisma/client";
import { decrypt } from "@/lib/encryption";
import { SYSTEM_SETTING_KEYS } from "@/lib/constants";
import { YandexVendorConnector } from "@/connectors/yandex-vendor/yandex-vendor.connector";

export class BranchService {
  /**
   * Yandex Eda kabinetidan barcha 38 ta filialni avtomatik import qilish
   */
  async importFromYandexEda(): Promise<{
    created: number;
    updated: number;
    total: number;
  }> {
    // 1. Sozlamalarni olamiz
    const edaCookieSetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.YANDEX_EDA_COOKIE } });
    const edaOauthSetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.YANDEX_EDA_OAUTH } });
    const edaPartnerIdSetting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEYS.YANDEX_EDA_PARTNER_ID } });

    const edaCookie = edaCookieSetting?.value ? decrypt(edaCookieSetting.value) : "";
    const edaOauth = edaOauthSetting?.value ? decrypt(edaOauthSetting.value) : "";
    const edaPartnerId = edaPartnerIdSetting?.value ? (edaPartnerIdSetting.isSecret ? decrypt(edaPartnerIdSetting.value) : edaPartnerIdSetting.value) : "";

    if (!edaCookie && !edaOauth) {
      throw new Error("Yandex Eda Cookie yoki OAuth token sozlanmagan. Iltimos avval sozlamalarda ularni kiriting.");
    }
    
    // 2. Yandex konnektorini chaqiramiz
    const connector = new YandexVendorConnector({ edaCookie, edaOauth, edaPartnerId });
    const connectorBranches = await connector.getBranches();

    let createdCount = 0;
    let updatedCount = 0;

    for (const rawBranch of connectorBranches) {
      try {
        // Avval ushbu place_id bilan bog'langan platforma bormi tekshiramiz
        const existingMapping = await prisma.branchPlatformId.findUnique({
          where: {
            source_platformId: {
              source: ReviewSource.YANDEX_VENDOR,
              platformId: rawBranch.externalId,
            },
          },
          include: {
            branch: true,
          },
        });

        if (existingMapping && existingMapping.branch) {
          // Agar filial mavjud bo'lsa, nomini yangilashimiz mumkin
          await prisma.branch.update({
            where: { id: existingMapping.branch.id },
            data: {
              name: rawBranch.name,
              address: rawBranch.address,
            },
          });
          updatedCount++;
        } else {
          // Shahar nomini standartlashtiramiz ("Ташкент")
          const normalizedCity = (rawBranch.city || "").toLowerCase() === "tashkent" || (rawBranch.city || "").toLowerCase() === "ташкент" ? "Ташкент" : (rawBranch.city || "Ташкент");

          // Yangi filial yaratamiz
          const newBranch = await prisma.branch.create({
            data: {
              name: rawBranch.name,
              city: normalizedCity,
              address: rawBranch.address,
              isActive: true,
            },
          });

          // Platforma ID'sini ulaymiz
          await prisma.branchPlatformId.create({
            data: {
              branchId: newBranch.id,
              source: ReviewSource.YANDEX_VENDOR,
              platformId: rawBranch.externalId,
            },
          });

          // Qo'shimcha ravishda keyinchalik ulanishi uchun Google va 2GIS ulanishlarini ham ochib qo'yamiz
          await prisma.branchPlatformId.createMany({
            data: [
              {
                branchId: newBranch.id,
                source: ReviewSource.GOOGLE_MAPS,
                platformId: "",
              },
              {
                branchId: newBranch.id,
                source: ReviewSource.YANDEX_MAPS,
                platformId: "",
              },
              {
                branchId: newBranch.id,
                source: ReviewSource.DGIS,
                platformId: "",
              },
              {
                branchId: newBranch.id,
                source: ReviewSource.UZUM_VENDOR,
                platformId: "",
              },
            ],
          });

          createdCount++;
        }
      } catch (e) {
        console.error(`[BranchService] Error importing branch ${rawBranch.name}:`, e);
      }
    }

    return {
      created: createdCount,
      updated: updatedCount,
      total: connectorBranches.length,
    };
  }
}

export const branchService = new BranchService();
