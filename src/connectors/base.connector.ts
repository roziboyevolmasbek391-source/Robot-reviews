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
}

export interface ConnectorBranch {
  externalId: string;
  name: string;
  city: string;
  address: string;
  latitude?: number;
  longitude?: number;
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
}
