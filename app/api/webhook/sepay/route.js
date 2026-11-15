import { supabase } from '@/lib/supabase';
import { notifyOwner, esc } from '@/lib/notify';
import { formatMoney } from '@/lib/config';

export const dynamic = 'force-dynamic';

const ok = () => Response.json({ success: true });

export async function POST(req) {
  // 1. Chỉ chấp nhận yêu cầu có đúng khóa bí mật
  const key = process.env.SEPAY_API_KEY;
  if (!key || req.headers.get('authorization') !== `Apikey ${key}`)
    return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ error: 'Bad request' }, { status: 400 });

  // 2. Chỉ xử lý tiền VÀO tài khoản
  if (b.transferType !== 'in') return ok();

  const amount = Number(b.transferAmount) || 0;
  const content = String(b.content || '');
  const text = `${b.code || ''} ${content}`.toUpperCase();
  const code = text.match(/DS[A-Z0-9]{6}/)?.[0] || null;

  // 3. Ghi nhật ký trước. Nếu giao dịch này đã xử lý rồi thì dừng (chống xử lý trùng)
  const { error: dupErr } = await supabase.from('payment_events').insert({
    provider_id: String(b.id ?? ''),
    code, amount, content, result: 'processing', raw: b,
  });
  if (dupErr) return ok();

  const setResult = r =>
    supabase.from('payment_events').update({ result: r }).eq('provider_id', String(b.id ?? ''));

  // 4. Tìm đơn theo mã
  if (!code) { await setResult('no_order'); return ok(); }

  const { data: rows } = await supabase
    .from('bookings')
    .select('id, status, price, customer_name, phone, date, start_hour, fields(name)')
    .eq('code', code);

  if (!rows || rows.length === 0) { await setResult('no_order'); return ok(); }

  const pending = rows.filter(r => r.status === 'pending');
  const info = rows[0];

  // Đơn đã trả rồi: không làm gì thêm
  if (pending.length === 0 && rows.every(r => r.status === 'paid')) {
    await setResult('already_paid');
    return ok();
  }

  // Đơn đã bị hủy (quá hạn): giờ có thể đã có người khác đặt, để chủ sân xử lý tay (hoàn tiền hoặc xếp lại giờ)
  if (pending.length === 0) {
    await setResult('late');
    await notifyOwner(
      `⚠️ Tiền về cho đơn đã hủy ${code}`,
      `<p>Nhận <b>${formatMoney(amount)}</b> cho đơn <b>${code}</b> nhưng đơn đã quá hạn/bị hủy.</p>
       <p>Khách: ${esc(info.customer_name)} - ${info.phone}. Vui lòng liên hệ khách để xếp lại giờ hoặc hoàn tiền.</p>`
    );
    return ok();
  }

  const total = pending.reduce((s, r) => s + r.price, 0);

  // Chuyển thiếu tiền: chưa xác nhận
  if (amount < total) {
    await setResult('underpaid');
    await notifyOwner(
      `⚠️ Khách chuyển thiếu tiền - đơn ${code}`,
      `<p>Đơn <b>${code}</b> cần ${formatMoney(total)}, nhận ${formatMoney(amount)}.</p>
       <p>Khách: ${esc(info.customer_name)} - ${info.phone}.</p>`
    );
    return ok();
  }

  // 5. Đủ tiền: xác nhận đơn
  const { error } = await supabase
    .from('bookings').update({ status: 'paid' })
    .in('id', pending.map(r => r.id)).eq('status', 'pending');

  if (error) {
    await setResult('error');
    return Response.json({ error: 'DB error' }, { status: 500 });
  }

  await setResult('matched');
  await notifyOwner(
    `✅ Đã nhận tiền - đơn ${code}`,
    `<p>Đã nhận <b>${formatMoney(amount)}</b>, đơn <b>${code}</b> tự động chuyển sang "Đã xác nhận".</p>
     <p>Khách: ${esc(info.customer_name)} - ${info.phone}<br>
     ${esc(info.fields?.name || '')} - ngày ${info.date} - ${pending.map(r => r.start_hour + 'h').join(', ')}</p>`
  );
  return ok();
}