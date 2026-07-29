import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from './env.js';

const secret = () => new TextEncoder().encode(env('JWT_SECRET'));

/** Token kinds this API mints, kept in the `typ` claim so one cannot pose as another. */
export type TokenType = 'state' | 'handoff' | 'session';

export interface SessionClaims extends JWTPayload {
  sub: string; // GitHub user id
  login: string;
  name: string | null;
  avatar: string | null;
  typ: TokenType;
}

export async function sign(payload: Omit<SessionClaims, keyof JWTPayload> & JWTPayload, ttl: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret());
}

export async function verify(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, secret());
  return payload as SessionClaims;
}
