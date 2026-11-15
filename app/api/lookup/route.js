import { supabase } from '@/lib/supabase';
import { todayVN, hoursUntil, MIN_CANCEL_HOURS } from '@/lib/config';

export const dynamic = 'force-dynamic';

const PHONE_RE = /^0\d{9}$/;

// Xem các lịch sắp tới của một số điện thoại
export async function GET(req) {
  const phone = new URL(req.url).searchParams.get('phone') || '';
  if (!PHONE_RE.test(phone))
    return Response.json({ error: 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0' }, { status: 400 });

  const { data, error } = await supabase
    .from('bookings')
    .select('id, date, start_hour, price, status, fields(name)')
    .eq('phone', phone)
    .gte('date', todayVN())
    .in('status', ['pending', 'paid'])
    .order('date').order('start_hour');

  if (error) return Response.json({ error: 'Lỗi hệ thống' }, { status: 500 });

  const items = data.map(b => ({
    id: b.id,
    date: b.date,
    hour: b.start_hour,
    price: b.price,
    status: b.status,
    field: b.fields?.name,
    canCancel: b.status === 'pending' && hoursUntil(b.date, b.start_hour) >= MIN_CANCEL_HOURS,
  }));
  return Response.json({ items });
}

// Khách tự hủy đơn chưa xác nhận
export async function POST(req) {
  const { phone, ids } = await req.json().catch(() => ({}));
  if (!PHONE_RE.test(String(phone || '')) || !Array.isArray(ids) || ids.length === 0 ||
      ids.length > 10 || !ids.every(Number.isInteger))
    return Response.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });

  const { data: rows } = await supabase
    .from('bookings').select('id, date, start_hour')
    .eq('phone', phone).eq('status', 'pending').in('id', ids);

  const okIds = (rows || [])
    .filter(r => hoursUntil(r.date, r.start_hour) >= MIN_CANCEL_HOURS)
    .map(r => r.id);

  if (okIds.length === 0)
    return Response.json(
      { error: `Không thể hủy. Chỉ hủy được đơn chưa xác nhận, trước giờ đá ít nhất ${MIN_CANCEL_HOURS} tiếng. Vui lòng gọi chủ sân.` },
      { status: 400 }
    );

  const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).in('id', okIds);
  if (error) return Response.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  return Response.json({ ok: true });
}