import { Suspense } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatMoney } from '@/lib/config';

async function FieldList() {
  const { data: fields } = await supabase
    .from('fields').select('*').eq('active', true).order('id');

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {fields?.map(f => (
        <Link key={f.id} href={`/san/${f.id}`}
          className="block rounded-xl border bg-white p-5 shadow-sm hover:shadow-md hover:border-green-500 transition">
          <div className="text-4xl mb-2">🏟️</div>
          <h2 className="text-xl font-semibold">{f.name}</h2>
          <p className="text-sm text-gray-500">{f.description}</p>
          <p className="mt-3 font-bold text-green-700">{formatMoney(f.price_per_hour)}/giờ</p>
          <span className="mt-3 inline-block rounded-lg bg-green-600 px-4 py-2 text-white text-sm">
            Chọn sân này
          </span>
        </Link>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto p-4">
      <header className="text-center py-8">
        <h1 className="text-3xl font-bold text-green-700">⚽ Đặt sân bóng mini</h1>
        <p className="text-gray-600 mt-2">Mở cửa 8:00 - 23:00 mỗi ngày</p>
        <Link href="/tra-cuu" className="inline-block mt-3 text-sm text-green-700 underline">
  Tra cứu / hủy lịch đã đặt
</Link>
      </header>
      <Suspense fallback={<p className="text-center text-gray-500">Đang tải danh sách sân...</p>}>
        <FieldList />
      </Suspense>
    </main>
  );
}