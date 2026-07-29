import type { VercelRequest } from '@vercel/node';

/** Reads a required env var, throwing a clear error if it is missing. */
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** The frontend origin allowed to call this API (no trailing slash). */
export const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN ?? '').replace(/\/$/, '');

/** This deployment's own base URL, rebuilt from the incoming request. */
export function baseUrl(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host;
  return `${proto}://${host}`;
}
