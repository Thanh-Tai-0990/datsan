import { supabase } from '@/lib/supabase';
import { OPEN_HOUR, CLOSE_HOUR, todayVN, nowHourVN, formatMoney } from '@/lib/config';
import { HOLD_MINUTES, expireOld, newCode, buildPay } from '@/lib/orders';
import { notifyOwner, esc } from '@/lib/notify';

export const dynamic = 'force-dynamic';

const MAX_PENDING_PER_PHONE = 6; // tối đa 6 giờ đang chờ thanh toán cho mỗi số điện thoại

export async function POST(req) {
  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 }); }

  const { fieldId, date, hours, name, phone } = body;

  // 1. Kiểm tra dữ liệu đầu vào
  const cleanName = String(name || '').trim();
  if (cleanName.length < 2 || cleanName.length > 60)
    return Response.json({ error: 'Vui lòng nhập họ tên (2-60 ký tự)' }, { status: 400 });

  if (!/^0\d{9}$/.test(String(phone || '')))
    return Response.json({ error: 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0' }, { status: 400 });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date < todayVN())
    return Response.json({ error: 'Ngày không hợp lệ' }, { status: 400 });

  if (!Array.isArray(hours) || hours.length === 0 || hours.length > 6)
    return Response.json({ error: 'Vui lòng chọn 1-6 khung giờ' }, { status: 400 });

  const uniqueHours = [...new Set(hours)];
  for (const h of uniqueHours) {
    if (!Number.isInteger(h) || h < OPEN_HOUR || h >= CLOSE_HOUR)
      return Response.json({ error: 'Khung giờ ngoài giờ mở cửa' }, { status: 400 });
    if (date === todayVN() && h <= nowHourVN())
      return Response.json({ error: 'Không thể đặt giờ đã qua' }, { status: 400 });
  }

  // 2. Dọn đơn quá hạn, rồi kiểm tra số đơn đang chờ của số điện thoại này
  await expireOld();

  const { count: pendingCount } = await supabase
    .from('bookings').select('id', { count: 'exact', head: true })
    .eq('phone', phone).eq('status', 'pending');

  if ((pendingCount || 0) + uniqueHours.length > MAX_PENDING_PER_PHONE)
    return Response.json(
      { error: 'Bạn đang có đơn chưa thanh toán. Vui lòng thanh toán hoặc hủy ở mục Tra cứu trước khi đặt thêm.' },
      { status: 400 }
    );

  // 3. Lấy giá thật từ database
  const { data: field } = await supabase
    .from('fields').select('id, name, price_per_hour, active')
    .eq('id', fieldId).single();

  if (!field || !field.active)
    return Response.json({ error: 'Sân không tồn tại' }, { status: 404 });

  // 4. Tạo mã đơn không trùng
  let code = null;
  for (let i = 0; i < 5 && !code; i++) {
    const c = newCode();
    const { count } = await supabase
      .from('bookings').select('id', { count: 'exact', head: true }).eq('code', c);
    if (!count) code = c;
  }
  if (!code) return Response.json({ error: 'Lỗi hệ thống, thử lại sau' }, { status: 500 });

  // 5. Ghi vào database (UNIQUE INDEX chặn đặt trùng)
  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
  const rows = uniqueHours.map(h => ({
    field_id: field.id,
    customer_name: cleanName,
    phone,
    date,
    start_hour: h,
    price: field.price_per_hour,
    status: 'pending',
    code,
    expires_at: expiresAt,
  }));

  const { error } = await supabase.from('bookings').insert(rows);

  if (error) {
    if (error.code === '23505')
      return Response.json(
        { error: 'Rất tiếc, có khung giờ vừa được người khác đặt. Vui lòng chọn lại.' },
        { status: 409 }
      );
    return Response.json({ error: 'Lỗi hệ thống, thử lại sau' }, { status: 500 });
  }

  const total = field.price_per_hour * uniqueHours.length;

  // 6. Báo chủ sân
  const hoursText = [...uniqueHours].sort((a, b) => a - b).map(h => `${h}h`).join(', ');
  await notifyOwner(
    `Đơn mới ${code}: ${field.name} ${date}`,
    `<p><b>Đơn mới, đang chờ chuyển khoản</b></p>
     <p>Mã đơn: <b>${code}</b><br>
     Khách: ${esc(cleanName)} - ${phone}<br>
     ${esc(field.name)} - ngày ${date} - ${hoursText}<br>
     Tổng: ${formatMoney(total)}</p>`
  );

  return Response.json({
    ok: true,
    code,
    total,
    secondsLeft: HOLD_MINUTES * 60,
    ...buildPay(total, code),
  });
}