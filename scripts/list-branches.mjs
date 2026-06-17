import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== BRANCHES IN DATABASE ===');
  const branches = await prisma.branch.findMany();
  console.log(branches.map(b => ({
    id: b.id,
    name: b.name,
    category: b.category,
    address: b.address,
    status: b.status,
    phone: b.phone
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
