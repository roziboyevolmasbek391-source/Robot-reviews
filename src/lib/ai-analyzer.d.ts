export interface AnalysisResult {
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  topics: string[];
  replyRu: string;
  replyUz: string;
  aiUsed: boolean;
}

export function analyzeReview(
  text: string | null,
  rating: number,
  authorName?: string,
  branchName?: string
): Promise<AnalysisResult>;

export function detectTopicsLocal(text: string | null): string[];

export function generateLocalDrafts(
  text: string | null,
  rating: number,
  authorName?: string,
  branchName?: string
): { replyRu: string; replyUz: string };
