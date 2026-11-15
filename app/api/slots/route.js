import { supabase } from '@/lib/supabase';
import { expireOld } from '@/lib/orders';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const fieldId = searchParams.get('fieldId');
  const date = searchParams.get('date');

  if (!fieldId || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return Response.json({ error: 'Thiếu hoặc sai tham số' }, { status: 400 });
  }

  await expireOld();

  const { data, error } = await supabase
    .from('bookings')
    .select('start_hour')
    .eq('field_id', fieldId)
    .eq('date', date)
    .neq('status', 'cancelled');

  if (error) return Response.json({ error: 'Lỗi hệ thống' }, { status: 500 });

  return Response.json({ booked: data.map(b => b.start_hour) });
}