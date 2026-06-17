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

const queries = [
  { text: "Mazzali", weight: 0.60 },
  { text: "Mazzali Burger", weight: 0.15 },
  { text: "Mazzali Pizza", weight: 0.10 },
  { text: "доставка Mazzali", weight: 0.10 },
  { text: "кафе Mazzali", weight: 0.05 }
];

const sources = [
  { key: ReviewSource.GOOGLE_MAPS, baseMin: 120, baseMax: 250 },
  { key: ReviewSource.YANDEX_MAPS, baseMin: 100, baseMax: 220 },
  { key: ReviewSource.YANDEX_VENDOR, baseMin: 80, baseMax: 180 },
  { key: ReviewSource.UZUM_VENDOR, baseMin: 90, baseMax: 200 },
  { key: ReviewSource.DGIS, baseMin: 20, baseMax: 60 }
];

async function main() {
  console.log("==================================================");
  console.log("🚀 STARTING BRAND SEARCH STATISTICS SEEDER");
  console.log("==================================================");

  const branches = await prisma.branch.findMany({
    where: { isActive: true }
  });

  if (branches.length === 0) {
    console.log("❌ No active branches found in database. Please run migrations/seeders first.");
    return;
  }

  console.log(`Found ${branches.length} active branches.`);

  // Clean existing search stats
  console.log("Cleaning existing search stats...");
  const deleted = await prisma.searchStat.deleteMany({});
  console.log(`Deleted ${deleted.count} existing search stat records.`);

  const statsToInsert = [];
  const today = new Date();
  
  // Seed stats for the last 90 days
  const numDays = 90;
  console.log(`Generating search stats for the last ${numDays} days...`);

  for (let d = 0; d < numDays; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    date.setHours(0, 0, 0, 0);

    const isWeekend = date.getDay() === 0 || date.getDay() === 6; // Saturday (6) or Sunday (0)
    const weekendMultiplier = isWeekend ? 1.4 : 1.0;

    for (const branch of branches) {
      // Create a deterministic branch multiplier based on its ID so some locations are naturally more popular
      const branchHash = branch.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const branchMultiplier = 0.6 + (branchHash % 10) * 0.15; // Range: 0.6 to 1.95

      for (const source of sources) {
        // Daily baseline search count for this source
        const dailyBase = Math.floor(Math.random() * (source.baseMax - source.baseMin + 1)) + source.baseMin;
        const totalSourceSearches = Math.round(dailyBase * weekendMultiplier * branchMultiplier);

        // Distribute this source's searches among the queries according to weights
        for (const query of queries) {
          const rawCount = Math.round(totalSourceSearches * query.weight);
          // Add some minor random variance to the count
          const variance = Math.floor(Math.random() * 7) - 3; // -3 to +3
          const searchCount = Math.max(1, rawCount + variance);

          statsToInsert.push({
            branchId: branch.id,
            source: source.key,
            query: query.text,
            searchCount,
            date: new Date(date)
          });
        }
      }
    }
  }

  console.log(`Generated ${statsToInsert.length} search statistics records.`);
  console.log("Inserting into database in batches...");

  // Batch insert in chunks of 5000 to prevent database query limits or memory issues
  const chunkSize = 2000;
  for (let i = 0; i < statsToInsert.length; i += chunkSize) {
    const chunk = statsToInsert.slice(i, i + chunkSize);
    await prisma.searchStat.createMany({
      data: chunk
    });
    console.log(`  -> Inserted records ${i} to ${Math.min(i + chunkSize, statsToInsert.length)}`);
  }

  console.log("==================================================");
  console.log("🎉 SUCCESS: Seeding brand search statistics complete!");
  console.log("==================================================");
}

main()
  .catch(err => {
    console.error("Fatal error during seeding:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
