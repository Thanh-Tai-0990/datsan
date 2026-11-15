import crypto from 'crypto';
import { cookies } from 'next/headers';

export const COOKIE_NAME = 'admin_session';
export const COOKIE_MAX_AGE = 60 * 60 * 12; // đăng nhập có hiệu lực 12 giờ

function sign(value) {
  return crypto.createHmac('sha256', process.env.ADMIN_SECRET).update(value).digest('hex');
}

export function createToken() {
  const expires = String(Date.now() + COOKIE_MAX_AGE * 1000);
  return `${expires}.${sign(expires)}`;
}

function verifyToken(token) {
  if (!token || !process.env.ADMIN_SECRET) return false;
  const [expires, sig] = token.split('.');
  if (!expires || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(expires));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(expires) > Date.now();
}

export async function isAdmin() {
  const store = await cookies();
  return verifyToken(store.get(COOKIE_NAME)?.value);
}