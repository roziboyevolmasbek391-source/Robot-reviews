import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@prisma/client';
import { sessionCookieName } from './constants';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  return new TextEncoder().encode(secret);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getJwtSecret());

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    // Fallback to iron-session (Review Monitor session)
    try {
      const ironSession = await getIronSession<SessionData>(cookieStore, sessionOptions);
      if (ironSession.isLoggedIn && ironSession.user) {
        return {
          id: ironSession.user.id,
          email: '',
          name: ironSession.user.fullName || ironSession.user.username,
          role: ironSession.user.role as Role
        };
      }
    } catch (e) {
      console.error("Iron session fallback error:", e);
    }
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      id: String(payload.id),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role
    };
  } catch {
    // Fallback to iron-session even if JWT verification fails
    try {
      const ironSession = await getIronSession<SessionData>(cookieStore, sessionOptions);
      if (ironSession.isLoggedIn && ironSession.user) {
        return {
          id: ironSession.user.id,
          email: '',
          name: ironSession.user.fullName || ironSession.user.username,
          role: ironSession.user.role as Role
        };
      }
    } catch (e) {
      console.error("Iron session fallback error on verification catch:", e);
    }
    return null;
  }
}

export async function requireSession(roles?: Role[]) {
  const session = await getSession();

  if (!session) {
    throw new Error('Authentication required');
  }

  if (roles && !roles.includes(session.role)) {
    throw new Error('Insufficient permissions');
  }

  return session;
}

export { sessionCookieName };
