'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { OPEN_HOUR, CLOSE_HOUR, todayVN, formatMoney } from '@/lib/config';

const HOURS = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);

const STATUS = {
  pending: { label: 'Chờ xác nhận', cell: 'bg-yellow-200 border-yellow-500', badge: 'bg-yellow-100 text-yellow-800' },
  paid: { label: 'Đã xác nhận', cell: 'bg-green-200 border-green-600', badge: 'bg-green-100 text-green-800' },
  blocked: { label: 'Bảo trì', cell: 'bg-gray-400 border-gray-600 text-white', badge: 'bg-gray-200 text-gray-700' },
};

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(null); // null = đang kiểm tra
  const [password, setPassword] = useState('');
  const [date, setDate] = useState(todayVN());
  const [data, setData] = useState({ fields: [], bookings: [] });
  const [selected, setSelected] = useState([]); // dạng "fieldId-hour"
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/bookings?date=${date}`);
    if (res.status === 401) { setAuthed(false); return; }
    const json = await res.json();
    if (res.ok) { setData(json); setAuthed(true); }
    else setMsg({ type: 'err', text: json.error });
  }, [date]);

  useEffect(() => { setSelected([]); load(); }, [load]);

  // Tự làm mới mỗi 30 giây để thấy đơn mới
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [authed, load]);

  async function login(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) { setPassword(''); load(); }
    else {
      const j = await res.json().catch(() => ({}));
      setMsg({ type: 'err', text: j.error || 'Đăng nhập thất bại' });
    }
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    setAuthed(false);
  }

  async function call(method, body) {
    setBusy(true); setMsg(null);
    const res = await fetch('/api/admin/bookings', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 401) { setAuthed(false); return false; }
    if (!res.ok) { setMsg({ type: 'err', text: json.error || 'Có lỗi xảy ra' }); await load(); return false; }
    await load();
    return true;
  }

  async function setStatus(ids, status) {
    if (status === 'cancelled' && !window.confirm('Hủy đơn này? Khung giờ sẽ được mở lại cho khách khác đặt.')) return;
    await call('PATCH', { ids, status });
  }

  async function addSlots(kind) {
    const slots = selected.map(k => {
      const [fieldId, hour] = k.split('-').map(Number);
      return { fieldId, hour };
    });
    const ok = await call('POST', { date, slots, kind, name, phone });
    if (ok) {
      setSelected([]); setName(''); setPhone('');
      setMsg({ type: 'ok', text: kind === 'block' ? 'Đã chặn lịch bảo trì' : 'Đã thêm đơn đặt sân' });
    }
  }

  const cellMap = useMemo(() => {
    const m = {};
    data.bookings.forEach(b => { m[`${b.field_id}-${b.start_hour}`] = b; });
    return m;
  }, [data.bookings]);

  // Gộp các giờ liền nhau của cùng một lần đặt thành một thẻ
  const groups = useMemo(() => {
    const g = {};
    data.bookings.forEach(b => {
      const key = [b.field_id, b.phone, b.customer_name, b.status, b.created_at].join('|');
      if (!g[key]) g[key] = { key, fieldId: b.field_id, name: b.customer_name, phone: b.phone, status: b.status, hours: [], ids: [], total: 0 };
      g[key].hours.push(b.start_hour);
      g[key].ids.push(b.id);
      g[key].total += b.price;
    });
    return Object.values(g).sort((a, b) => a.hours[0] - b.hours[0]);
  }, [data.bookings]);

  const fieldName = id => data.fields.find(f => f.id === id)?.name || `Sân ${id}`;
  const revenue = data.bookings.filter(b => b.status === 'paid').reduce((s, b) => s + b.price, 0);
  const pendingCount = groups.filter(g => g.status === 'pending').length;
  const bookedHours = data.bookings.filter(b => b.status !== 'blocked').length;

  const toggleCell = key =>
    setSelected(s => (s.includes(key) ? s.filter(x => x !== key) : [...s, key]));

  // ---------- Màn hình đăng nhập ----------
  if (authed === null) return <main className="p-8 text-center text-gray-500">Đang tải...</main>;

  if (!authed) {
    return (
      <main className="max-w-sm mx-auto p-6 mt-16">
        <h1 className="text-2xl font-bold text-center text-green-700">🔒 Quản lý sân</h1>
        <form onSubmit={login} className="mt-6 space-y-3 rounded-xl border bg-white p-5">
          <input type="password" required autoFocus placeholder="Mật khẩu quản lý"
            value={password} onChange={e => setPassword(e.target.value)}
            className="w-full border rounded-lg p-2" />
          <button disabled={busy}
            className="w-full rounded-lg bg-green-600 py-2 text-white font-semibold disabled:opacity-50">
            {busy ? 'Đang kiểm tra...' : 'Đăng nhập'}
          </button>
          {msg && <p className="text-sm text-red-700">{msg.text}</p>}
        </form>
      </main>
    );
  }

  // ---------- Màn hình quản lý ----------
  return (
    <main className="max-w-5xl mx-auto p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-green-700">⚽ Quản lý sân</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/" className="text-green-700">Trang khách</Link>
          <button onClick={logout} className="text-red-600">Đăng xuất</button>
        </div>
      </div>

      {/* Chọn ngày */}
      <div className="flex items-center gap-2 mt-4">
        <button onClick={() => setDate(addDays(date, -1))} className="border rounded-lg px-3 py-2 bg-white">←</button>
        <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)}
          className="border rounded-lg p-2 bg-white" />
        <button onClick={() => setDate(addDays(date, 1))} className="border rounded-lg px-3 py-2 bg-white">→</button>
        <button onClick={() => setDate(todayVN())} className="border rounded-lg px-3 py-2 bg-white text-sm">Hôm nay</button>
      </div>

      {/* Thống kê */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="rounded-xl border bg-white p-3">
          <p className="text-xs text-gray-500">Doanh thu đã xác nhận</p>
          <p className="text-lg font-bold text-green-700">{formatMoney(revenue)}</p>
        </div>
        <div className="rounded-xl border bg-white p-3">
          <p className="text-xs text-gray-500">Chờ xác nhận</p>
          <p className="text-lg font-bold text-yellow-600">{pendingCount} đơn</p>
        </div>
        <div className="rounded-xl border bg-white p-3">
          <p className="text-xs text-gray-500">Giờ đã đặt</p>
          <p className="text-lg font-bold">{bookedHours}/{HOURS.length * data.fields.length}</p>
        </div>
      </div>

      {msg && (
        <div className={`mt-3 rounded-lg p-3 text-sm ${msg.type === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {msg.text}
        </div>
      )}

      {/* Lưới lịch */}
      <h2 className="font-semibold mt-6">Lịch trong ngày <span className="text-sm font-normal text-gray-500">(bấm ô trống để chọn)</span></h2>
      <div className="overflow-x-auto mt-2">
        <div className="grid gap-1 min-w-[460px]"
          style={{ gridTemplateColumns: `64px repeat(${data.fields.length}, 1fr)` }}>
          <div />
          {data.fields.map(f => (
            <div key={f.id} className="text-center font-semibold text-sm py-1">{f.name}</div>
          ))}
          {HOURS.map(h => (
            <div key={h} className="contents">
              <div className="text-sm text-gray-600 flex items-center">{h}:00</div>
              {data.fields.map(f => {
                const key = `${f.id}-${h}`;
                const b = cellMap[key];
                if (b) {
                  const st = STATUS[b.status];
                  return (
                    <div key={key} title={`${b.customer_name} ${b.phone}`}
                      className={`rounded border px-1 py-2 text-xs text-center truncate ${st.cell}`}>
                      {b.status === 'blocked' ? 'Bảo trì' : b.customer_name}
                    </div>
                  );
                }
                const on = selected.includes(key);
                return (
                  <button key={key} onClick={() => toggleCell(key)}
                    className={`rounded border px-1 py-2 text-xs ${on ? 'bg-blue-200 border-blue-500' : 'bg-white hover:bg-gray-100'}`}>
                    {on ? '✓' : ''}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs mt-3">
        <span className="px-2 py-1 rounded bg-yellow-200">Chờ xác nhận</span>
        <span className="px-2 py-1 rounded bg-green-200">Đã xác nhận</span>
        <span className="px-2 py-1 rounded bg-gray-400 text-white">Bảo trì</span>
        <span className="px-2 py-1 rounded bg-blue-200">Đang chọn</span>
      </div>

      {/* Khung thao tác khi có ô được chọn */}
      {selected.length > 0 && (
        <div className="mt-4 rounded-xl border-2 border-blue-400 bg-white p-4 space-y-3">
          <p className="font-semibold">Đã chọn {selected.length} ô trống</p>
          <div className="grid sm:grid-cols-2 gap-2">
            <input placeholder="Tên khách (nếu đặt hộ)" value={name}
              onChange={e => setName(e.target.value)} className="border rounded-lg p-2" />
            <input placeholder="Số điện thoại khách" inputMode="numeric" value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="border rounded-lg p-2" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => addSlots('manual')}
              className="rounded-lg bg-green-600 px-4 py-2 text-white text-sm disabled:opacity-50">
              Đặt hộ khách
            </button>
            <button disabled={busy} onClick={() => addSlots('block')}
              className="rounded-lg bg-gray-700 px-4 py-2 text-white text-sm disabled:opacity-50">
              Chặn bảo trì
            </button>
            <button onClick={() => setSelected([])} className="rounded-lg border px-4 py-2 text-sm">Bỏ chọn</button>
          </div>
        </div>
      )}

      {/* Danh sách đơn */}
      <h2 className="font-semibold mt-8">Danh sách đơn ({groups.length})</h2>
      <div className="mt-2 space-y-2">
        {groups.length === 0 && <p className="text-gray-500 text-sm">Chưa có đơn nào trong ngày này.</p>}
        {groups.map(g => {
          const st = STATUS[g.status];
          const hoursText = g.hours.map(h => `${h}h`).join(', ');
          return (
            <div key={g.key} className="rounded-xl border bg-white p-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {g.status === 'blocked' ? '🔧 Bảo trì' : g.name}
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded ${st.badge}`}>{st.label}</span>
                </p>
                <p className="text-sm text-gray-600">
                  {fieldName(g.fieldId)} · {hoursText}
                  {g.status !== 'blocked' && ` · ${formatMoney(g.total)}`}
                </p>
                {g.status !== 'blocked' && (
                  <a href={`tel:${g.phone}`} className="text-sm text-blue-600">📞 {g.phone}</a>
                )}
              </div>
              <div className="flex gap-2">
                {g.status === 'pending' && (
                  <button disabled={busy} onClick={() => setStatus(g.ids, 'paid')}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-white text-sm disabled:opacity-50">Xác nhận</button>
                )}
                {g.status === 'paid' && (
                  <button disabled={busy} onClick={() => setStatus(g.ids, 'pending')}
                    className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">Về chờ xác nhận</button>
                )}
                <button disabled={busy} onClick={() => setStatus(g.ids, 'cancelled')}
                  className="rounded-lg border border-red-400 px-3 py-1.5 text-red-600 text-sm disabled:opacity-50">
                  {g.status === 'blocked' ? 'Mở lại' : 'Hủy'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}