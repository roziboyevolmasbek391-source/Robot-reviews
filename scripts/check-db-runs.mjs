import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== LATEST AUTOMATION RUNS ===');
  const runs = await prisma.automationRun.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      branch: true,
      logs: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  for (const run of runs) {
    console.log(`Run ID: ${run.id}`);
    console.log(`Provider: ${run.provider}`);
    console.log(`Status: ${run.status}`);
    console.log(`Branch Name: ${run.branch.name}`);
    console.log(`Created At: ${run.createdAt}`);
    console.log('Logs:');
    for (const log of run.logs) {
      console.log(`  [${log.level}] ${log.createdAt.toISOString()}: ${log.message}`);
    }
    console.log('-------------------------------------------');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
