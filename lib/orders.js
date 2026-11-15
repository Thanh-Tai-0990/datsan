import { supabase } from './supabase';

export const HOLD_MINUTES = 15;          // thời gian giữ chỗ để khách chuyển khoản
const GRACE_MS = 2 * 60 * 1000;          // chờ thêm 2 phút phòng khi tiền về chậm

// Hủy các đơn chờ đã quá hạn để mở lại giờ cho người khác
export async function expireOld() {
  const cutoff = new Date(Date.now() - GRACE_MS).toISOString();
  await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('status', 'pending')
    .lt('expires_at', cutoff);
}

// Mã đơn dạng DS + 6 ký tự (bỏ các ký tự dễ nhầm như O, 0, I, 1)
export function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'DS';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Thông tin thanh toán + ảnh QR
export function buildPay(amount, code) {
  const bank = process.env.BANK_ID;
  const account = process.env.BANK_ACCOUNT;
  if (!bank || !account) return { qrUrl: null, pay: null };

  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: code,
    accountName: process.env.BANK_HOLDER || '',
  });
  return {
    qrUrl: `https://img.vietqr.io/image/${bank}-${account}-compact2.png?${params}`,
    pay: {
      bank: process.env.BANK_NAME || bank,
      account,
      holder: process.env.BANK_HOLDER || '',
    },
  };
}