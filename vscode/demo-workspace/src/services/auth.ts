// Auth service for the demo project.
import type { Session, User } from "./types.js";

const sessions = new Map<string, Session>();

export function signIn(user: User, token: string): Session {
  const session: Session = {
    token,
    user,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
  sessions.set(token, session);
  return session;
}

export function verify(token: string): User | null {
  const session = sessions.get(token);
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}
