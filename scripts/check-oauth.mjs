import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== OAUTH CREDENTIALS ===');
  const oauths = await prisma.oAuthCredential.findMany({
    include: { user: true }
  });
  console.log(oauths.map(o => ({
    id: o.id,
    provider: o.provider,
    email: o.user.email,
    expiresAt: o.expiresAt,
    createdAt: o.createdAt
  })));

  console.log('=== PROVIDER SESSIONS ===');
  const sessions = await prisma.providerSession.findMany({
    include: { user: true }
  });
  console.log(sessions.map(s => ({
    id: s.id,
    provider: s.provider,
    email: s.user.email,
    status: s.status,
    lastSuccessfulLogin: s.lastSuccessfulLogin
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
