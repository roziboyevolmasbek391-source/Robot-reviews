'use server';

import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { sessionOptions, type SessionData } from '@/lib/session';
import { createSession, destroySession } from '@/lib/security/session';
import { loginSchema } from '@/features/auth/schema';
import { authenticateUser } from '@/features/auth/auth-service';
import { verifyPassword } from '@/lib/security/password';

export async function loginAction(input: unknown) {
  const credentials = loginSchema.parse(input);
  const user = await authenticateUser(credentials);

  await createSession({
    id: user.id,
    email: user.email || '',
    name: user.name || user.fullName || user.username || 'User',
    role: user.role
  });

  redirect('/dashboard');
}

export async function loginWithUsernameAction(formData: FormData) {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!username || !password) {
    redirect('/login?error=' + encodeURIComponent('Введите имя пользователя и пароль'));
  }

  const user = await prisma.user.findUnique({
    where: { username }
  });

  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    redirect('/login?error=' + encodeURIComponent('Неверное имя пользователя или пароль'));
  }

  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

  session.user = {
    id: user.id,
    username: user.username || '',
    fullName: user.fullName || 'User',
    role: user.role
  };
  session.isLoggedIn = true;
  await session.save();

  await createSession({
    id: user.id,
    email: user.email || '',
    name: user.name || user.fullName || user.username || 'User',
    role: user.role
  });

  redirect('/dashboard');
}

export async function logoutAction() {
  await destroySession();
  redirect('/login');
}
