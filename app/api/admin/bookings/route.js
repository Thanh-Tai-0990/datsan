import { supabase } from '@/lib/supabase';
import { isAdmin } from '@/lib/auth';
import { expireOld } from '@/lib/orders';
import { OPEN_HOUR, CLOSE_HOUR, todayVN } from '@/lib/config';

export const dynamic = 'force-dynamic';

const unauthorized = () => Response.json({ error: 'Chưa đăng nhập' }, { status: 401 });
const bad = text => Response.json({ error: text }, { status: 400 });

// Xem toàn bộ đơn của 1 ngày (trừ đơn đã hủy)
export async function GET(req) {
  if (!(await isAdmin())) return unauthorized();

  const date = new URL(req.url).searchParams.get('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return bad('Ngày không hợp lệ');

    await expireOld();
  const [f, b] = await Promise.all([
    supabase.from('fields').select('id, name').eq('active', true).order('id'),
    supabase.from('bookings').select('*').eq('date', date)
      .neq('status', 'cancelled').order('start_hour'),
  ]);
  if (f.error || b.error) return Response.json({ error: 'Lỗi đọc dữ liệu' }, { status: 500 });

  return Response.json({ fields: f.data, bookings: b.data });
}

// Chặn lịch bảo trì (kind = block) hoặc thêm đơn cho khách gọi điện (kind = manual)
export async function POST(req) {
  if (!(await isAdmin())) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { date, slots, kind, name, phone } = body;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date < todayVN()) return bad('Ngày không hợp lệ');
  if (!['block', 'manual'].includes(kind)) return bad('Loại thao tác không hợp lệ');
  if (!Array.isArray(slots) || slots.length === 0 || slots.length > 45) return bad('Chưa chọn khung giờ');

  for (const s of slots) {
    if (!Number.isInteger(s.fieldId) || !Number.isInteger(s.hour) ||
        s.hour < OPEN_HOUR || s.hour >= CLOSE_HOUR) return bad('Khung giờ không hợp lệ');
  }

  let cleanName = 'Bảo trì';
  let cleanPhone = '-';
  if (kind === 'manual') {
    cleanName = String(name || '').trim();
    cleanPhone = String(phone || '');
    if (cleanName.length < 2 || cleanName.length > 60) return bad('Nhập tên khách (2-60 ký tự)');
    if (!/^0\d{9}$/.test(cleanPhone)) return bad('Số điện thoại phải gồm 10 số, bắt đầu bằng 0');
  }

  // Lấy giá thật từ database
  const fieldIds = [...new Set(slots.map(s => s.fieldId))];
  const { data: fields } = await supabase
    .from('fields').select('id, price_per_hour, active').in('id', fieldIds);
  const priceOf = Object.fromEntries((fields || []).filter(f => f.active).map(f => [f.id, f.price_per_hour]));
  if (fieldIds.some(id => priceOf[id] === undefined)) return bad('Sân không tồn tại');

  const rows = slots.map(s => ({
    field_id: s.fieldId,
    customer_name: cleanName,
    phone: cleanPhone,
    date,
    start_hour: s.hour,
    price: kind === 'block' ? 0 : priceOf[s.fieldId],
    status: kind === 'block' ? 'blocked' : 'paid',
  }));

  const { error } = await supabase.from('bookings').insert(rows);
  if (error) {
    if (error.code === '23505')
      return Response.json({ error: 'Có khung giờ vừa được đặt. Hãy tải lại trang.' }, { status: 409 });
    return Response.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
  return Response.json({ ok: true });
}

// Đổi trạng thái đơn: xác nhận (paid), về chờ (pending), hủy (cancelled)
// Hủy 1 dòng "blocked" chính là mở lại lịch bảo trì
export async function PATCH(req) {
  if (!(await isAdmin())) return unauthorized();

  const { ids, status } = await req.json().catch(() => ({}));
  if (!['pending', 'paid', 'cancelled'].includes(status)) return bad('Trạng thái không hợp lệ');
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50 ||
      !ids.every(Number.isInteger)) return bad('Danh sách đơn không hợp lệ');

  let q = supabase.from('bookings').update({ status }).in('id', ids);
  if (status !== 'cancelled') q = q.neq('status', 'blocked'); // lịch bảo trì chỉ được mở lại, không "xác nhận"

  const { error } = await q;
  if (error) return Response.json({ error: 'Lỗi cập nhật' }, { status: 500 });
  return Response.json({ ok: true });
}