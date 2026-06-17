const { PrismaClient, ReviewSource } = require("@prisma/client");
const path = require("path");
const fs = require("fs");

// Load environment variables from .env file
const envPath = path.join(__dirname, "../.env");
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

function cleanText(text) {
  if (!text) return "";
  return text.toLowerCase()
    .replace(/[^a-z0-9а-яё]/g, "")
    .replace(/читатьдалее/g, "")
    .replace(/читатьполностью/g, "")
    .replace(/readmore/g, "");
}

async function main() {
  console.log("=== MERGE DUPLICATE REVIEWS START ===");

  // 1. Fetch all reviews
  const reviews = await prisma.review.findMany({
    orderBy: {
      reviewDate: "desc"
    }
  });

  console.log(`Total reviews in database: ${reviews.length}`);

  // 2. Group by branchId, source, author, rating
  const groups = {};
  for (const r of reviews) {
    const key = `${r.branchId}_${r.source}_${r.author}_${r.rating}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(r);
  }

  let totalMerged = 0;
  let totalDeleted = 0;

  // 3. Process each group
  for (const [groupKey, groupReviews] of Object.entries(groups)) {
    if (groupReviews.length <= 1) continue;

    // Further group reviews by fuzzy text similarity
    const clusters = [];
    for (const r of groupReviews) {
      const rClean = cleanText(r.text);
      
      let addedToCluster = false;
      for (const cluster of clusters) {
        const rep = cluster[0];
        const repClean = cleanText(rep.text);

        // If one cleans to empty and the other doesn't, we still check. If both empty, they match.
        const isMatch = (rClean === "" && repClean === "") ||
                        (rClean !== "" && repClean !== "" && (rClean.includes(repClean) || repClean.includes(rClean)));

        if (isMatch) {
          cluster.push(r);
          addedToCluster = true;
          break;
        }
      }

      if (!addedToCluster) {
        clusters.push([r]);
      }
    }

    // Process clusters of duplicates
    for (const cluster of clusters) {
      if (cluster.length <= 1) continue;

      console.log(`\nFound duplicate cluster of size ${cluster.length} for key: ${groupKey}`);
      cluster.forEach((r, idx) => {
        console.log(`  [${idx}] ID: ${r.id}, Date: ${r.reviewDate.toISOString().slice(0, 10)}, TextLength: ${r.text ? r.text.length : 0}, Reply: ${r.replyText ? 'YES' : 'NO'}`);
      });

      // Find best review to keep
      let toKeep = cluster[0];
      for (const r of cluster) {
        // Prefer one with replyText
        if (r.replyText && !toKeep.replyText) {
          toKeep = r;
        }
        // If reply status matches, prefer one with longer text
        else if (!!r.replyText === !!toKeep.replyText) {
          const rTextLen = r.text ? r.text.length : 0;
          const keepTextLen = toKeep.text ? toKeep.text.length : 0;
          if (rTextLen > keepTextLen) {
            toKeep = r;
          }
        }
      }

      console.log(`  -> Keep review ID: ${toKeep.id}`);

      // Merge other reviews properties into toKeep
      let mergedReplyText = toKeep.replyText;
      let mergedRepliedAt = toKeep.repliedAt;
      let mergedRepliedBy = toKeep.repliedBy;
      let mergedIsNew = toKeep.isNew;
      let mergedText = toKeep.text;

      const toDeleteIds = [];

      for (const r of cluster) {
        if (r.id === toKeep.id) continue;

        toDeleteIds.push(r.id);

        // Copy reply if toKeep doesn't have it
        if (!mergedReplyText && r.replyText) {
          mergedReplyText = r.replyText;
          mergedRepliedAt = r.repliedAt;
          mergedRepliedBy = r.repliedBy;
        }

        // If any duplicate is marked as replied (isNew = false), make sure we keep it as replied
        if (r.isNew === false) {
          mergedIsNew = false;
        }

        // Keep the longest text version (excluding '...читать далее' suffix)
        const rText = r.text || "";
        const keepText = mergedText || "";
        if (rText.length > keepText.length && !rText.includes("...читать далее") && !rText.includes("...читать полностью")) {
          mergedText = rText;
        }
      }

      // Update the kept review in DB
      await prisma.review.update({
        where: { id: toKeep.id },
        data: {
          text: mergedText,
          replyText: mergedReplyText,
          repliedAt: mergedRepliedAt || (mergedReplyText ? new Date() : null),
          repliedBy: mergedRepliedBy,
          isNew: mergedReplyText ? false : mergedIsNew
        }
      });

      // Delete other duplicate records
      const deleteResult = await prisma.review.deleteMany({
        where: {
          id: { in: toDeleteIds }
        }
      });

      console.log(`  -> Merged details. Deleted ${deleteResult.count} duplicate records.`);
      totalDeleted += deleteResult.count;
      totalMerged++;
    }
  }

  console.log(`\n=== MERGE DUPLICATE REVIEWS END ===`);
  console.log(`Merged clusters: ${totalMerged}`);
  console.log(`Deleted reviews: ${totalDeleted}`);
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
