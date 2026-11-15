import crypto from 'crypto';
import { cookies } from 'next/headers';
import { createToken, COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// So sánh mật khẩu an toàn (chống dò mật khẩu qua thời gian phản hồi)
function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(a).digest();
  const y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

export async function POST(req) {
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Server chưa cấu hình mật khẩu admin' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const password = String(body.password || '');

  if (!safeEqual(password, process.env.ADMIN_PASSWORD)) {
    await new Promise(r => setTimeout(r, 800)); // làm chậm để chống dò mật khẩu
    return Response.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }

  const store = await cookies();
  store.set(COOKIE_NAME, createToken(), {
    httpOnly: true,                                   // JavaScript không đọc được cookie
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return Response.json({ ok: true });
}