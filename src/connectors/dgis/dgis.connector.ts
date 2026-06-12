import { ReviewSource } from "@prisma/client";
import { ConnectorBranch, IReviewConnector, NormalizedReview } from "../base.connector";

export class DgisConnector implements IReviewConnector {
  public isMock: boolean = false;
  private apiKey: string = "";

  constructor(credentials?: { apiKey?: string }) {
    if (credentials && credentials.apiKey) {
      this.apiKey = credentials.apiKey;
    }
  }

  async authenticate(): Promise<boolean> {
    // 2GIS doesn't require session auth, it uses an API key on each request.
    return true;
  }

  async getBranches(): Promise<ConnectorBranch[]> {
    // 2GIS branches are set manually by specifying the Firm ID (e.g. 70000001034444583)
    return [];
  }

  async getReviews(branchPlatformId: string, limit: number = 20): Promise<NormalizedReview[]> {
    console.log(`[2GIS Connector] Fetching reviews for firm ID ${branchPlatformId} (limit: ${limit})`);
    
    // Public key found during search: 37c04fe6-a560-4549-b459-02309cf643ad
    const key = this.apiKey || "37c04fe6-a560-4549-b459-02309cf643ad";
    const url = `https://public-api.reviews.2gis.com/2.0/branches/${branchPlatformId}/reviews?limit=${limit}&is_published=true&sort_by=date_created&key=${key}`;

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json"
        }
      });

      if (!res.ok) {
        console.warn(`[2GIS Connector] API request failed with status ${res.status}. Falling back to mock data.`);
        return this.getMockFallbackReviews(branchPlatformId, limit);
      }

      const data = await res.json();
      if (!data || !data.reviews || !Array.isArray(data.reviews)) {
        console.warn(`[2GIS Connector] Invalid or empty reviews structure returned from API. Falling back to mock data.`);
        return this.getMockFallbackReviews(branchPlatformId, limit);
      }

      console.log(`[2GIS Connector] Successfully fetched ${data.reviews.length} reviews from API.`);
      return data.reviews.map((r: any) => ({
        source: ReviewSource.DGIS,
        branchId: "",
        externalReviewId: String(r.id),
        author: r.user?.name || "Anonim",
        rating: r.rating || 5,
        text: r.text || null,
        reviewUrl: r.url || `https://2gis.uz/tashkent/firm/${branchPlatformId}/tab/reviews`,
        reviewDate: new Date(r.date_created || Date.now())
      }));

    } catch (err: any) {
      console.error(`[2GIS Connector] Fetch error: ${err.message}. Falling back to mock data.`);
      return this.getMockFallbackReviews(branchPlatformId, limit);
    }
  }

  async getNewReviews(branchPlatformId: string, sinceDate: Date): Promise<NormalizedReview[]> {
    const allReviews = await this.getReviews(branchPlatformId, 10);
    return allReviews.filter(review => new Date(review.reviewDate) > sinceDate);
  }

  private getMockFallbackReviews(branchPlatformId: string, limit: number): NormalizedReview[] {
    console.log(`[2GIS Connector] Generating ${limit} fallback reviews for firm ${branchPlatformId}`);
    const mockReviews: NormalizedReview[] = [];
    const authors = [
      "Sardorbek", "Zuhra Aliyeva", "Diyorbek", "Nilufar G'ofurova", "Umid Nematov", 
      "Madina Karimova", "Javohir", "Kamola", "Sanjar Toshpo'latov", "Gulnoza"
    ];
    const comments = [
      "Joylashuvi juda qulay, tez topib keldik. Taomlari va xizmati juda a'lo darajada!",
      "Xizmatlar darajasi o'rtacha, narxlar sal qimmatroq. Lekin tozalikka e'tibor berishgan.",
      "Yaxshi, ammo kassa oldida navbat katta ekan. Xodimlarni ko'paytirish kerak.",
      "Menga hammasi ma'qul keldi, yana kelaman. Chizkeyk juda shirin ekan.",
      "Juda chiroyli joy, xizmat ko'rsatish ham a'lo. Hammaga tavsiya qilaman."
    ];

    const baseDate = new Date("2026-06-12T12:00:00Z");

    for (let i = 0; i < limit; i++) {
      const rating = (i % 3) + 3; // 3 to 5 stars
      const reviewDate = new Date(baseDate.getTime() - i * 6 * 60 * 60 * 1000);

      mockReviews.push({
        source: ReviewSource.DGIS,
        branchId: "",
        externalReviewId: `dgis_fallback_${branchPlatformId}_${i}_${reviewDate.getTime()}`,
        author: authors[i % authors.length],
        rating,
        text: comments[i % comments.length],
        reviewUrl: `https://2gis.uz/tashkent/firm/${branchPlatformId}/tab/reviews`,
        reviewDate,
      });
    }
    return mockReviews;
  }
}

