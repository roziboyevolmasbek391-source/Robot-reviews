const { PrismaClient } = require("@prisma/client");
const path = require("path");
const fs = require("fs");
const { analyzeReview } = require("./src/lib/ai-analyzer");

// Load env variables
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf-8");
  for (const line of envConfig.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...values] = trimmed.split("=");
      process.env[key.trim()] = values.join("=").trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

const prisma = new PrismaClient();

async function main() {
  console.log("Starting backfill for existing reviews without AI sentiment/topic tags...");

  const reviews = await prisma.review.findMany({
    where: {
      OR: [
        { aiSentiment: null },
        { aiTopics: null }
      ]
    },
    include: {
      branch: true
    }
  });

  console.log(`Found ${reviews.length} reviews that need AI analysis backfill.`);

  let successCount = 0;
  for (let i = 0; i < reviews.length; i++) {
    const review = reviews[i];
    try {
      const analysis = await analyzeReview(
        review.text,
        review.rating,
        review.author,
        review.branch ? review.branch.name : ""
      );

      const aiSentiment = analysis.sentiment;
      const aiTopics = Array.isArray(analysis.topics) ? analysis.topics.join(", ") : "";

      await prisma.review.update({
        where: { id: review.id },
        data: {
          aiSentiment,
          aiTopics
        }
      });

      successCount++;
      if (successCount % 50 === 0 || successCount === reviews.length) {
        console.log(`Processed ${successCount}/${reviews.length} reviews...`);
      }
    } catch (e) {
      console.error(`Error processing review ID ${review.id}:`, e);
    }
  }

  console.log(`Backfill completed successfully. Updated ${successCount} reviews.`);
  await prisma.$disconnect();
}

main().catch(console.error);
