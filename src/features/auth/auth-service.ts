import { prisma } from '@/lib/db/prisma';
import { verifyPassword } from '@/lib/security/password';
import { loginSchema, type LoginInput } from './schema';

export async function authenticateUser(input: LoginInput) {
  const credentials = loginSchema.parse(input);
  const user = await prisma.user.findUnique({
    where: { email: credentials.email }
  });

  if (!user || !(await verifyPassword(credentials.password, user.passwordHash))) {
    throw new Error('Неверный email или пароль');
  }

  return user;
}
