import { supabase } from '@/lib/supabase';
import { expireOld } from '@/lib/orders';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const code = new URL(req.url).searchParams.get('code') || '';
  if (!/^DS[A-Z0-9]{6}$/.test(code))
    return Response.json({ error: 'Mã đơn không hợp lệ' }, { status: 400 });

  await expireOld();

  const { data, error } = await supabase
    .from('bookings')
    .select('status, price, start_hour, date, fields(name)')
    .eq('code', code)
    .order('start_hour');

  if (error) return Response.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ status: 'cancelled' });

  let status = 'cancelled';
  if (data.some(r => r.status === 'pending')) status = 'pending';
  else if (data.every(r => r.status === 'paid')) status = 'paid';

  return Response.json({
    status,
    total: data.reduce((s, r) => s + r.price, 0),
    date: data[0].date,
    hours: data.map(r => r.start_hour),
    field: data[0].fields?.name,
  });
}