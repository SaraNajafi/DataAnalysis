import 'server-only';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { getSessionSecret } from '../config';

/** Keyed hash with domain separation, e.g. hmac('otp', …) vs hmac('ip', …). */
export function hmac(purpose: string, value: string): string {
  return createHmac('sha256', getSessionSecret()).update(`${purpose}:${value}`).digest('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 256-bit random, URL-safe token (session cookies). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Uniformly random numeric code, zero-padded (e.g. "048213"). */
export function generateNumericCode(length = 6): string {
  return randomInt(0, 10 ** length)
    .toString()
    .padStart(length, '0');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}
