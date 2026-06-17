import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const log = await prisma.automationLog.findFirst({
    where: {
      automationRunId: 'cmq2wcwuc004lx7x99g6tvfrg',
      screenshotPath: { not: null }
    }
  });

  if (log) {
    console.log(`Failed Run Screenshot Path: ${log.screenshotPath}`);
  } else {
    console.log('No screenshot found for the failed run.');
    if (fs.existsSync('./outputs/screenshots')) {
      console.log('Screenshots in outputs/screenshots:', fs.readdirSync('./outputs/screenshots'));
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
