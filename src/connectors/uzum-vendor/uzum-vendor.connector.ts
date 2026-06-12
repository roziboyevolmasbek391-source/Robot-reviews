import { ReviewSource } from "@prisma/client";
import { ConnectorBranch, IReviewConnector, NormalizedReview } from "../base.connector";

export class UzumVendorConnector implements IReviewConnector {
  private cookie: string = "";
  private token: string = "";
  private merchantId: string = "";
  public isMock: boolean = true;

  constructor(credentials?: { cookie?: string; token?: string; merchantId?: string }) {
    if (credentials) {
      if (credentials.token || credentials.cookie) {
        this.cookie = credentials.cookie || "";
        this.token = credentials.token || "";
        this.merchantId = credentials.merchantId || "";
        this.isMock = false;
      }
    }
  }

  async authenticate(): Promise<boolean> {
    if (this.isMock) {
      console.log("[Uzum Vendor Connector] Mock rejimi faol.");
      return true;
    }
    try {
      const headers: Record<string, string> = {
        "Accept": "application/json",
        "Accept-Language": "ru",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      };
      if (this.token) {
        headers["Authorization"] = this.token.startsWith("Bearer ") ? this.token : `Bearer ${this.token}`;
      }
      if (this.cookie) {
        headers["Cookie"] = this.cookie;
      }
      const res = await fetch("https://vendors.uzumtezkor.uz/api/v2/auth/identity", { headers });
      return res.status === 200;
    } catch (e) {
      console.error("[Uzum Vendor Connector] Auth verification failed:", e);
      return false;
    }
  }

  async getBranches(): Promise<ConnectorBranch[]> {
    if (this.isMock) {
      return [
        { externalId: "uzum_vendor_id_100", name: "Chilonzor (Uzum Tezkor)", city: "Tashkent", address: "Tashkent shahar, Chilonzor, 9-kvartal" }
      ];
    }

    try {
      const headers: Record<string, string> = {
        "Accept": "application/json",
        "Accept-Language": "ru",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      };
      if (this.token) {
        headers["Authorization"] = this.token.startsWith("Bearer ") ? this.token : `Bearer ${this.token}`;
      }
      if (this.cookie) {
        headers["Cookie"] = this.cookie;
      }

      // 1. Get user identity to find user ID and scope
      const resId = await fetch("https://vendors.uzumtezkor.uz/api/v2/auth/identity", { headers });
      if (!resId.ok) {
        console.error(`[Uzum Vendor Connector] Identity request failed with status: ${resId.status}`);
        return [];
      }
      
      const userId = resId.headers.get("x-user-id");
      const scope = resId.headers.get("x-scope");
      if (!userId) {
        console.error("[Uzum Vendor Connector] User ID not found in identity headers");
        return [];
      }

      const isVapp = scope === "vendorapp.authorized";

      // 2. Fetch vendors list from Uzum Tezkor partner API
      const response = await fetch(`https://vendors.uzumtezkor.uz/api/v1/vendor-auth/users/id/${userId}/vendors?is_vapp=${isVapp}`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        console.error(`[Uzum Vendor Connector] Get branches failed with status: ${response.status}`);
        return [];
      }

      const data = await response.json();
      const vendors = data.vendors || data.result?.vendors || data.result || data.items || data || [];

      if (!Array.isArray(vendors)) {
        return [];
      }

      return vendors.map((vendor: any) => {
        const address = vendor.address || "Tashkent shahar";
        const rawName = vendor.vendor_name || `Restoran #${vendor.vendor_public_id}`;
        return {
          externalId: String(vendor.vendor_public_id),
          name: rawName,
          city: "Tashkent",
          address: address,
        };
      });
    } catch (e) {
      console.error("[Uzum Vendor Connector] Error fetching branches:", e);
      return [];
    }
  }

  async getReviews(branchPlatformId: string, limit: number = 20): Promise<NormalizedReview[]> {
    if (this.isMock) {
      // Mock reviews for testing
      const mockReviews: NormalizedReview[] = [];
      const authors = ["Shohruh", "Lobar", "Ulug'bek", "Malika", "Sardor"];
      const comments = [
        "Taom juda issiq va mazali keldi. Uzum Tezkor kuryeriga rahmat!",
        "Xizmat juda sekin, kuryer 1 soat kechikdi.",
        "Ajoyib taomlar, doim shu yerdan buyurtma beramiz.",
        "Menga yoqmadi, salat sersuv bo'lib ketibdi.",
        "Uzum orqali buyurtma qildik, juda tez keldi. Rahmat!"
      ];

      for (let i = 0; i < limit; i++) {
        const rating = Math.floor(Math.random() * 5) + 1;
        const reviewDate = new Date();
        reviewDate.setHours(reviewDate.getHours() - i * 3);

        mockReviews.push({
          source: ReviewSource.UZUM_VENDOR,
          branchId: "",
          externalReviewId: `uzum_vendor_review_${branchPlatformId}_${i}_${reviewDate.getTime()}`,
          author: authors[i % authors.length],
          rating,
          text: comments[i % comments.length],
          reviewUrl: `https://partners.uzumtezkor.uz/feedbacks`,
          reviewDate,
        });
      }
      return mockReviews;
    }

    try {
      const headers: Record<string, string> = {
        "Accept": "application/json",
        "Accept-Language": "ru",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      };
      if (this.token) {
        headers["Authorization"] = this.token.startsWith("Bearer ") ? this.token : `Bearer ${this.token}`;
      }
      if (this.cookie) {
        headers["Cookie"] = this.cookie;
      }

      // Date range: 30 days
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(toDate.getDate() - 30);
      
      const dateFromStr = fromDate.toISOString().split('T')[0];
      const dateToStr = toDate.toISOString().split('T')[0];

      const queryParams = new URLSearchParams({
        dateFrom: dateFromStr,
        dateTo: dateToStr,
        limit: String(limit),
        offset: "0",
        question_id: "order",
        vendorIDs: branchPlatformId
      });

      const url = `https://vendors.uzumtezkor.uz/api/v2/feedback/rate?${queryParams.toString()}`;
      const response = await fetch(url, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(`Uzum Tezkor feedbacks API error status: ${response.status}`);
      }

      const data = await response.json();
      const feedbacksList = data.rates || data.items || data.result || [];

      if (!Array.isArray(feedbacksList)) {
        return [];
      }

      return feedbacksList.map((item: any) => {
        // Parse tags if available
        let text = item.text || "";
        if (Array.isArray(item.tags)) {
          const selectedTags = item.tags.filter((t: any) => t.selected).map((t: any) => t.name.replace(/\n/g, ' '));
          if (selectedTags.length > 0) {
            text += (text ? "\n" : "") + `[Теги: ${selectedTags.join(', ')}]`;
          }
        }

        return {
          source: ReviewSource.UZUM_VENDOR,
          branchId: "",
          externalReviewId: String(item.id),
          externalPlaceId: String(item.vendor_public_id || branchPlatformId),
          author: item.order_display_id ? `Заказ #${item.order_display_id}` : "Anonim",
          rating: item.rate || 5,
          text: text || null,
          reviewUrl: "https://partners.uzumtezkor.uz/ru/feedbacks",
          reviewDate: new Date(item.rate_created_at || item.order_created_at || Date.now()),
        };
      });

    } catch (e) {
      console.error(`[Uzum Vendor Connector] Error fetching reviews for ${branchPlatformId}:`, e);
      return [];
    }
  }

  async getNewReviews(branchPlatformId: string, sinceDate: Date): Promise<NormalizedReview[]> {
    const allReviews = await this.getReviews(branchPlatformId, 10);
    return allReviews.filter(review => new Date(review.reviewDate) > sinceDate);
  }
}
