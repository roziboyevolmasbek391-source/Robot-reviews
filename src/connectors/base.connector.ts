import { ReviewSource } from "@prisma/client";

export interface NormalizedReview {
  source: ReviewSource;
  branchId: string;
  externalReviewId: string;
  externalPlaceId?: string; // Yandex Eda/Vendor place_id kabi moslashtirish uchun
  author: string;
  rating: number; // 1-5
  text: string | null;
  reviewUrl: string | null;
  reviewDate: Date;
  replyText?: string | null;
  repliedAt?: Date | null;
}

export interface ConnectorBranch {
  externalId: string;
  name: string;
  city: string;
  address: string;
  latitude?: number;
  longitude?: number;
}

export interface BusinessSearchAnalytics {
  scopeId?: string;
  dailyImpressions: Array<{
    date: Date;
    count: number;
  }>;
  queries: Array<{
    query: string;
    count: number;
  }>;
}

export interface IReviewConnector {
  readonly isMock: boolean;

  /**
   * Platformaga ulanishni tekshirish yoki login qilish.
   * Sozlamalardan kerakli API kalitlarini o'zi o'qiydi.
   */
  authenticate(): Promise<boolean>;

  /**
   * Platformadan ushbu biznesga tegishli barcha filiallarni yuklash.
   */
  getBranches(): Promise<ConnectorBranch[]>;

  /**
   * Berilgan filial uchun barcha sharhlarni yuklash.
   */
  getReviews(branchPlatformId: string, limit?: number): Promise<NormalizedReview[]>;

  /**
   * Oxirgi sinxronizatsiyadan keyin kelgan faqat yangi sharhlarni yuklash.
   */
  getNewReviews(branchPlatformId: string, sinceDate: Date): Promise<NormalizedReview[]>;

  /**
   * Real business-account search/performance metrics when the platform exposes them.
   * Implementations should return an empty result when credentials or API support are unavailable.
   */
  getSearchAnalytics?(
    branchPlatformId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<BusinessSearchAnalytics>;

  /**
   * Platforma xaritasida sharhga javob yuborish.
   * @param branchPlatformId - Platforma'dagi filial ID (orgId, locationId va h.k.)
   * @param reviewExternalId - Sharh tashqi ID si
   * @param replyText - Yuboriladigan javob matni
   * @param extra - Qo'shimcha ma'lumotlar (muallif va sharh matni)
   * @returns success: true/false, errorMessage?: string
   */
  replyToReview?(
    branchPlatformId: string,
    reviewExternalId: string,
    replyText: string,
    extra?: { author?: string; text?: string }
  ): Promise<{ success: boolean; errorMessage?: string }>;
}
