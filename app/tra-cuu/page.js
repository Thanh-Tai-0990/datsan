'use client';
import { useState } from 'react';
import Link from 'next/link';
import { formatMoney } from '@/lib/config';

const LABEL = {
  pending: { text: 'Chờ chủ sân xác nhận', cls: 'bg-yellow-100 text-yellow-800' },
  paid: { text: 'Đã xác nhận', cls: 'bg-green-100 text-green-800' },
};

function fmtDate(d) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export default function LookupPage() {
  const [phone, setPhone] = useState('');
  const [items, setItems] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  async function search(e) {
    e?.preventDefault();
    setLoading(true); setMsg(null);
    const res = await fetch(`/api/lookup?phone=${phone}`);
    const json = await res.json();
    setLoading(false);
    if (res.ok) setItems(json.items);
    else { setItems(null); setMsg({ type: 'err', text: json.error }); }
  }

  async function cancel(id) {
    if (!window.confirm('Bạn chắc chắn muốn hủy giờ này?')) return;
    const res = await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, ids: [id] }),
    });
    const json = await res.json();
    if (res.ok) { setMsg({ type: 'ok', text: 'Đã hủy thành công.' }); search(); }
    else setMsg({ type: 'err', text: json.error });
  }

  return (
    <main className="max-w-xl mx-auto p-4">
      <Link href="/" className="text-green-700 text-sm">← Về trang chủ</Link>
      <h1 className="text-2xl font-bold mt-2">Tra cứu lịch đã đặt</h1>

      <form onSubmit={search} className="mt-4 flex gap-2">
        <input required placeholder="Số điện thoại đã dùng để đặt" inputMode="numeric"
          value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          className="flex-1 border rounded-lg p-2" />
        <button disabled={loading}
          className="rounded-lg bg-green-600 px-4 text-white font-semibold disabled:opacity-50">
          {loading ? '...' : 'Tra cứu'}
        </button>
      </form>

      {msg && (
        <div className={`mt-4 rounded-lg p-3 text-sm ${msg.type === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {msg.text}
        </div>
      )}

      {items && items.length === 0 && (
        <p className="mt-6 text-gray-500">Không có lịch sắp tới nào với số này.</p>
      )}

      <div className="mt-4 space-y-2">
        {items?.map(it => (
          <div key={it.id} className="rounded-xl border bg-white p-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{it.field} · {it.hour}:00 - {it.hour + 1}:00</p>
              <p className="text-sm text-gray-600">{fmtDate(it.date)} · {formatMoney(it.price)}</p>
              <span className={`text-xs px-2 py-0.5 rounded ${LABEL[it.status].cls}`}>{LABEL[it.status].text}</span>
            </div>
            {it.canCancel && (
              <button onClick={() => cancel(it.id)}
                className="rounded-lg border border-red-400 px-3 py-1.5 text-red-600 text-sm">Hủy</button>
            )}
          </div>
        ))}
      </div>

      {items && items.length > 0 && (
        <p className="mt-4 text-xs text-gray-500">
          Chỉ tự hủy được đơn chưa xác nhận, trước giờ đá ít nhất 2 tiếng. Đơn đã xác nhận, vui lòng gọi chủ sân.
        </p>
      )}
    </main>
  );
}