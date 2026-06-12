import { SessionOptions } from "iron-session";

export interface SessionData {
  user?: {
    id: string;
    username: string;
    fullName: string;
    role: "ADMIN" | "MANAGER" | "OPERATOR";
  };
  isLoggedIn: boolean;
}

export const defaultSession: SessionData = {
  isLoggedIn: false,
};

export const sessionOptions: SessionOptions = {
  password: process.env.COOKIE_PASSWORD || "complex-password-at-least-32-characters-long!!!",
  cookieName: "reviews_monitoring_session",
  cookieOptions: {
    secure: false,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};
