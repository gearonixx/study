import type { VercelRequest } from '@vercel/node';

/** Reads a required env var, throwing a clear error if it is missing. */
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * The frontend origins allowed to call this API. Usually one — the Pages site —
 * but a comma-separated list lets `http://localhost:5173` sync during
 * development without a second deployment.
 */
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

/** The primary origin: where OAuth returns to when nothing else is asked for. */
export const ALLOWED_ORIGIN = ALLOWED_ORIGINS[0] ?? '';

/** Vercel's Neon integration has shipped the URL under several names. */
export function databaseUrl(): string {
  const url =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error('Missing required environment variable: DATABASE_URL');
  return url;
}

/** This deployment's own base URL, rebuilt from the incoming request. */
export function baseUrl(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host;
  return `${proto}://${host}`;
}
