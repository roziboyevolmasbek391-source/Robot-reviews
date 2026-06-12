const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.branch.count();
  console.log("Total branches in database:", count);

  const branches = await prisma.branch.findMany({
    include: {
      platformIds: true
    }
  });

  console.log("\nBranches list:");
  for (const b of branches) {
    console.log(`- ID: ${b.id}, ExternalId: ${b.externalId}, Name: ${b.name}`);
    console.log("  Platform IDs:", b.platformIds.map(p => `${p.source}: ${p.platformId}`).join(", "));
  }

  const syncLogs = await prisma.reviewSyncLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 5
  });
  console.log("\nRecent Sync Logs:");
  for (const log of syncLogs) {
    console.log(`- Time: ${log.startedAt.toISOString()}, Source: ${log.source}, Status: ${log.status}, Synced: ${log.syncedReviews}, Error: ${log.error || "None"}`);
  }

  await prisma.$disconnect();
}

main();
