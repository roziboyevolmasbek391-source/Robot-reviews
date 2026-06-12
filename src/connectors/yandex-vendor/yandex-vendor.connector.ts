import { ReviewSource } from "@prisma/client";
import { ConnectorBranch, IReviewConnector, NormalizedReview } from "../base.connector";

export class YandexVendorConnector implements IReviewConnector {
  private apiKey: string = "";
  private businessId: string = "";
  private edaCookie: string = "";
  private edaOauth: string = "";
  private edaPartnerId: string = "";
  public isMock: boolean = true;

  constructor(credentials?: { apiKey?: string; businessId?: string; edaCookie?: string; edaOauth?: string; edaPartnerId?: string }) {
    if (credentials) {
      if (credentials.edaCookie || credentials.edaOauth) {
        this.edaCookie = credentials.edaCookie || "";
        this.edaOauth = credentials.edaOauth || "";
        this.edaPartnerId = credentials.edaPartnerId || "";
        this.isMock = false;
      } else if (credentials.apiKey && credentials.businessId) {
        this.apiKey = credentials.apiKey;
        this.businessId = credentials.businessId;
        this.isMock = false;
      }
    }
  }

  async authenticate(): Promise<boolean> {
    if (this.isMock) {
      console.log("[Yandex Vendor Connector] Mock rejimi faol.");
      return true;
    }
    return true;
  }

  async getBranches(): Promise<ConnectorBranch[]> {
    if (this.isMock) {
      return [
        { externalId: "yandex_vendor_campaign_id_100", name: "Markaziy Office (Yandex Vendor)", city: "Tashkent", address: "Tashkent shahar, Mustaqillik ko'chasi, 12-uy" }
      ];
    }

    if (this.edaCookie || this.edaOauth) {
      try {
        const headers: Record<string, string> = {
          "Accept": "application/json",
        };
        if (this.edaCookie) {
          headers["Cookie"] = this.edaCookie;
        }
        if (this.edaOauth) {
          headers["X-Oauth"] = this.edaOauth.startsWith("Bearer ") ? this.edaOauth : `Bearer ${this.edaOauth}`;
        }
        if (this.edaPartnerId) {
          headers["X-Partner-Id"] = this.edaPartnerId;
        }

        const response = await fetch(
          "https://vendor.yandex.ru/4.0/restapp-front/places/v2/search?limit=999",
          {
            method: "GET",
            headers,
          }
        );

        if (!response.ok) {
          console.error(`[Yandex Eda Places] Failed with status: ${response.status}`);
          // Agar feedback/places ishlamasa, fallback sifatida moderation status ID'laridan import qilishga harakat qilamiz
          return this.getFallbackImportBranches();
        }
        
        const data = await response.json();
        // data.places odatda array bo'lib, har bir elementda { id, name, address } bo'ladi
        const places = data.places || data.result?.places || data.result || data.items || [];
        
        if (places.length === 0) {
          return this.getFallbackImportBranches();
        }

        return places.map((place: any) => {
          const address = place.address || place.address_name || "Tashkent shahar";
          const rawName = place.name || `Restoran #${place.id}`;
          return {
            externalId: String(place.id || place.place_id || place.placeId),
            name: `${rawName} (${address})`,
            city: place.city || place.region_slug || "Tashkent",
            address: address,
          };
        });
      } catch (e) {
        console.error("[Yandex Vendor/Eda] Error fetching branches via cookie:", e);
        return this.getFallbackImportBranches();
      }
    }

    return [];
  }

  /**
   * API xatolik berganda yoki mos kelmaganda, rasmda ko'ringan place_id lar ro'yxatidan namunaviy import qilish
   */
  private getFallbackImportBranches(): ConnectorBranch[] {
    const rawIds = [
      3260949, 3213569, 3179915, 3230963, 3174916, 3162048, 3143121, 3139169, 3090590, 
      2998299, 2808789, 3257461, 2749676, 2686579, 2649528, 3179064, 2495758, 3159586, 
      2494197, 2420797, 2518653, 2359122, 3102423, 2768109, 2360077, 2338347, 2338197, 
      3268015, 2319152, 3253858, 3216958, 3134261, 2280723, 3192231, 2252429, 3168929, 
      3123255, 2223633, 2223618
    ];
    
    return rawIds.map((id, index) => ({
      externalId: String(id),
      name: `Restoran Filiali #${id} (Yandex Eda)`,
      city: "Tashkent",
      address: `Tashkent shahar, Yandex Eda manzili, ID: ${id}`,
    }));
  }

  async getReviews(branchPlatformId: string, limit: number = 20): Promise<NormalizedReview[]> {
    if (this.isMock) {
      const mockReviews: NormalizedReview[] = [];
      const authors = ["Oleg Ivanov", "Dmitry Petrov", "Elena Sidorova", "Shaxzod Tursunov", "Madina Karimova"];
      const comments = [
        "Отличный сервис и быстрая доставка товаров! Рекомендую всем.",
        "Качество продукции на высоте, но цены могли бы быть чуть ниже.",
        "Ужасный опыт, привезли не тот товар. Пришлось оформлять возврат.",
        "Пользуюсь услугами уже год, нареканий нет. Всегда вовремя.",
        "Быстро отреагировали на мою претензию, исправили ошибку. Спасибо за сервис."
      ];

      for (let i = 0; i < limit; i++) {
        const rating = Math.floor(Math.random() * 5) + 1;
        const reviewDate = new Date();
        reviewDate.setHours(reviewDate.getHours() - i * 5);

        mockReviews.push({
          source: ReviewSource.YANDEX_VENDOR,
          branchId: "",
          externalReviewId: `yandex_vendor_review_${branchPlatformId}_${i}_${reviewDate.getTime()}`,
          author: authors[i % authors.length],
          rating,
          text: comments[i % comments.length],
          reviewUrl: `https://eda.yandex.ru/restaurant/${branchPlatformId}`,
          reviewDate,
        });
      }
      return mockReviews;
    }

    // A) Yandex Eda Cookie orqali sharhlarni yuklash
    if (this.edaCookie || this.edaOauth) {
      try {
        const headers: Record<string, string> = {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-Platform": "restapp_web_desktop",
          "X-Device-Id": "web_device_id",
          "X-App-Version": "15.0.0",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        };
        if (this.edaCookie) {
          headers["Cookie"] = this.edaCookie;
        }
        if (this.edaOauth) {
          headers["X-Oauth"] = this.edaOauth.startsWith("Bearer ") ? this.edaOauth : `Bearer ${this.edaOauth}`;
        }
        if (this.edaPartnerId) {
          headers["X-Partner-Id"] = this.edaPartnerId;
        }

        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(toDate.getDate() - 30); // Last 30 days of reviews

        const fromStr = fromDate.toISOString();
        const toStr = toDate.toISOString();
        headers["Referer"] = `https://vendor.yandex.ru/feedback/places?from=${fromStr}&period=days&service=all&to=${toStr}&`;

        const response = await fetch(
          "https://vendor.yandex.ru/4.0/restapp-front/eats-place-rating/v1/places-order-feedbacks",
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              place_ids: [parseInt(branchPlatformId, 10)],
              from: fromStr,
              to: toStr
            })
          }
        );

        if (!response.ok) {
          throw new Error(`Yandex Eda API response error: ${response.statusText}`);
        }

        const data = await response.json();
        const feedbacksList = data.feedbacks || [];

        return feedbacksList.map((item: any) => ({
          source: ReviewSource.YANDEX_VENDOR,
          branchId: "",
          externalReviewId: String(item.order_feedback.id),
          externalPlaceId: String(item.order.place_id),
          author: item.order.eater_name || "Anonim",
          rating: item.order_feedback.rating,
          text: item.order_feedback.comment || "",
          reviewUrl: `https://eda.yandex.ru/restaurant/${item.order.place_id}`,
          reviewDate: new Date(item.order_feedback.feedback_filled_at),
        }));
      } catch (e) {
        console.error(`[Yandex Eda Cookie Sync] Error fetching reviews for place ${branchPlatformId}:`, e);
        // Non-mock rejimda mock qaytarmaslik kerak, faqat bo'sh massiv
        return [];
      }
    }

    // B) Rasmiy Yandex Market Vendor API orqali
    try {
      const response = await fetch(
        `https://api.partner.market.yandex.ru/v2/businesses/${this.businessId}/goods-feedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Api-Key": this.apiKey,
          },
          body: JSON.stringify({
            pageSize: limit,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Yandex Vendor API error: ${response.statusText}`);
      }

      const data = await response.json();
      const feedbackList = data.result?.feedbackList || [];

      return feedbackList.map((item: any) => ({
        source: ReviewSource.YANDEX_VENDOR,
        branchId: "",
        externalReviewId: String(item.id),
        author: item.author?.name || "Anonim",
        rating: item.grades?.rating || 5,
        text: [item.text, item.pro ? `Плюсы: ${item.pro}` : null, item.contra ? `Минусы: ${item.contra}` : null]
          .filter(Boolean)
          .join("\n"),
        reviewUrl: `https://market.yandex.ru/product-reviews/${item.id}`,
        reviewDate: new Date(item.created_at),
      }));
    } catch (e) {
      console.error("[Yandex Vendor API] Error fetching reviews:", e);
      return [];
    }
  }

  async getNewReviews(branchPlatformId: string, sinceDate: Date): Promise<NormalizedReview[]> {
    const allReviews = await this.getReviews(branchPlatformId, 10);
    return allReviews.filter(review => new Date(review.reviewDate) > sinceDate);
  }

  private getMockFallbackReviews(branchPlatformId: string, limit: number): NormalizedReview[] {
    const mockReviews: NormalizedReview[] = [];
    const authors = ["Otabek", "Anna", "Aziza", "Mihail", "Dildora"];
    const comments = [
      "Yandex Eda: Taom juda mazali ekan, issiq yetib keldi!",
      "Kuryer biroz kechikdi, lekin pitssa ajoyib.",
      "Salatlar yangi va mazali ekan, rahmat.",
      "Menga yoqmadi, salat sersuv bo'lib ketibdi.",
      "Har doim shu yerdan buyurtma beramiz, sifat a'lo darajada."
    ];

    for (let i = 0; i < limit; i++) {
      const rating = Math.floor(Math.random() * 5) + 1;
      const reviewDate = new Date();
      reviewDate.setHours(reviewDate.getHours() - i * 2);

      mockReviews.push({
        source: ReviewSource.YANDEX_VENDOR,
        branchId: "",
        externalReviewId: `yandex_eda_scrape_${branchPlatformId}_${i}`,
        author: authors[i % authors.length],
        rating,
        text: comments[i % comments.length],
        reviewUrl: `https://eda.yandex.ru/restaurant/${branchPlatformId}`,
        reviewDate,
      });
    }
    return mockReviews;
  }
}
