'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { OPEN_HOUR, CLOSE_HOUR, PRICE, todayVN, nowHourVN, formatMoney } from '@/lib/config';

const HOURS = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);

export default function FieldPage() {
  const { id } = useParams();
  const [date, setDate] = useState(todayVN());
  const [booked, setBooked] = useState([]);
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState(null);            // {type: 'ok' | 'err', text}
  const [loading, setLoading] = useState(false);

  const [order, setOrder] = useState(null);        // đơn đang chờ thanh toán
  const [orderStatus, setOrderStatus] = useState('pending'); // pending | paid | cancelled
  const [now, setNow] = useState(Date.now());

  const loadSlots = useCallback(async () => {
    try {
      const res = await fetch(`/api/slots?fieldId=${id}&date=${date}`);
      const data = await res.json();
      setBooked(data.booked || []);
    } catch {}
  }, [id, date]);

  useEffect(() => {
    setSelected([]);
    loadSlots();
  }, [loadSlots]);

  // Khi đang chờ thanh toán: đếm ngược mỗi giây, hỏi trạng thái đơn mỗi 4 giây
  useEffect(() => {
    if (!order || orderStatus !== 'pending') return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/order?code=${order.code}`);
        const j = await res.json();
        if (res.ok) setOrderStatus(j.status);
      } catch {}
    }, 4000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [order, orderStatus]);

  // Đơn đổi trạng thái (đã trả / hết hạn): cập nhật lại lưới giờ
  useEffect(() => {
    if (orderStatus !== 'pending') loadSlots();
  }, [orderStatus, loadSlots]);

  const isPast = h => date === todayVN() && h <= nowHourVN();

  function toggle(h) {
    setMsg(null);
    setSelected(s =>
      s.includes(h) ? s.filter(x => x !== h) : [...s, h].sort((a, b) => a - b)
    );
  }

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldId: Number(id), date, hours: selected, name, phone }),
      });
      const data = await res.json();
      if (res.ok) {
        setOrder({
          code: data.code,
          total: data.total,
          qrUrl: data.qrUrl,
          pay: data.pay,
          deadline: Date.now() + data.secondsLeft * 1000,
          date,
          hours: selected,
        });
        setOrderStatus('pending');
        setNow(Date.now());
        setSelected([]);
      } else {
        setMsg({ type: 'err', text: data.error });
      }
    } catch {
      setMsg({ type: 'err', text: 'Không kết nối được server, thử lại sau' });
    }
    setLoading(false);
    loadSlots();
  }

  function resetOrder() {
    setOrder(null);
    setOrderStatus('pending');
    setMsg(null);
    loadSlots();
  }

  // ---------- Màn hình thanh toán ----------
  if (order) {
    const left = Math.max(0, Math.floor((order.deadline - now) / 1000));
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');
    const hoursText = order.hours.map(h => `${h}h`).join(', ');

    if (orderStatus === 'paid') {
      return (
        <main className="max-w-md mx-auto p-4 text-center">
          <div className="mt-10 rounded-xl border bg-white p-6">
            <div className="text-5xl">✅</div>
            <h1 className="text-2xl font-bold text-green-700 mt-2">Đã nhận thanh toán!</h1>
            <p className="mt-3">Sân {id} · {order.date} · {hoursText}</p>
            <p className="text-sm text-gray-500 mt-1">Mã đơn: {order.code}</p>
            <p className="mt-4 text-sm text-gray-600">
              Bạn có thể xem lại lịch ở mục <Link href="/tra-cuu" className="underline text-green-700">Tra cứu</Link> bằng số điện thoại.
            </p>
            <button onClick={resetOrder} className="mt-5 rounded-lg bg-green-600 px-5 py-2 text-white">Xong</button>
          </div>
        </main>
      );
    }

    if (orderStatus === 'cancelled') {
      return (
        <main className="max-w-md mx-auto p-4 text-center">
          <div className="mt-10 rounded-xl border bg-white p-6">
            <div className="text-5xl">⌛</div>
            <h1 className="text-xl font-bold mt-2">Đơn đã hết hạn</h1>
            <p className="mt-2 text-sm text-gray-600">
              Hệ thống chưa nhận được tiền trong thời gian giữ chỗ nên đã hủy đơn {order.code}.
              Nếu bạn đã chuyển khoản, vui lòng liên hệ chủ sân kèm mã đơn này.
            </p>
            <button onClick={resetOrder} className="mt-5 rounded-lg bg-green-600 px-5 py-2 text-white">Đặt lại</button>
          </div>
        </main>
      );
    }

    return (
      <main className="max-w-md mx-auto p-4">
        <div className="rounded-xl border bg-white p-5 text-center">
          <h1 className="text-xl font-bold text-green-700">Thanh toán để giữ sân</h1>
          <p className="text-sm text-gray-600 mt-1">Sân {id} · {order.date} · {hoursText}</p>

          <div className={`mt-3 text-3xl font-mono font-bold ${left < 120 ? 'text-red-600' : 'text-gray-800'}`}>
            {mm}:{ss}
          </div>
          <p className="text-xs text-gray-500">thời gian giữ chỗ còn lại</p>

          {order.qrUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={order.qrUrl} alt="Mã QR chuyển khoản" className="mx-auto mt-4 w-64 max-w-full rounded-lg border" />
              <div className="mt-4 text-left text-sm space-y-1 rounded-lg bg-gray-50 p-3">
                <p>Ngân hàng: <b>{order.pay.bank}</b></p>
                <p>Số tài khoản: <b>{order.pay.account}</b></p>
                <p>Chủ tài khoản: <b>{order.pay.holder}</b></p>
                <p>Số tiền: <b className="text-green-700">{formatMoney(order.total)}</b></p>
                <p>Nội dung: <b className="text-red-600 text-base">{order.code}</b></p>
              </div>
              <p className="mt-3 text-xs text-red-600">
                Phải ghi đúng nội dung <b>{order.code}</b> và đúng số tiền để hệ thống tự xác nhận.
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-gray-600">
              Tổng tiền {formatMoney(order.total)}. Chủ sân sẽ liên hệ số {phone} để hướng dẫn thanh toán. Mã đơn: <b>{order.code}</b>
            </p>
          )}

          <p className="mt-4 text-sm text-gray-500 animate-pulse">Đang chờ nhận tiền... (trang tự cập nhật, không cần tải lại)</p>
          {left === 0 && (
            <p className="mt-2 text-sm text-red-600">
              Đã hết thời gian. Nếu bạn vừa chuyển khoản, hãy đợi thêm ít phút.
            </p>
          )}
        </div>
        <button onClick={resetOrder} className="mt-3 block mx-auto text-sm text-gray-500 underline">
          Quay lại chọn giờ khác
        </button>
      </main>
    );
  }

  // ---------- Màn hình chọn giờ ----------
  return (
    <main className="max-w-3xl mx-auto p-4">
      <Link href="/" className="text-green-700 text-sm">← Quay lại danh sách sân</Link>
      <h1 className="text-2xl font-bold mt-2">Sân {id} - Chọn giờ đá</h1>

      <label className="block mt-4 font-medium">Chọn ngày</label>
      <input type="date" value={date} min={todayVN()}
        onChange={e => e.target.value && setDate(e.target.value)}
        className="border rounded-lg p-2 mt-1" />

      <div className="flex gap-4 text-sm mt-4">
        <span>🟩 Trống</span><span>🟨 Đang chọn</span><span>⬜ Đã đặt / đã qua</span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
        {HOURS.map(h => {
          const disabled = booked.includes(h) || isPast(h);
          const active = selected.includes(h);
          return (
            <button key={h} type="button" disabled={disabled} onClick={() => toggle(h)}
              className={`rounded-lg p-3 text-sm font-medium border transition
                ${disabled ? 'bg-gray-200 text-gray-400 cursor-not-allowed line-through'
                  : active ? 'bg-yellow-300 border-yellow-500'
                  : 'bg-green-100 border-green-400 hover:bg-green-200'}`}>
              {h}:00 - {h + 1}:00
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <form onSubmit={submit} className="mt-6 rounded-xl border bg-white p-4 space-y-3">
          <p className="font-semibold">
            Đã chọn {selected.length} giờ: {selected.map(h => `${h}h`).join(', ')}
            {' '}→ <span className="text-green-700">{formatMoney(selected.length * PRICE)}</span>
          </p>
          <input required placeholder="Họ và tên" value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border rounded-lg p-2" />
          <input required placeholder="Số điện thoại (VD: 0901234567)" inputMode="numeric"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            className="w-full border rounded-lg p-2" />
          <button disabled={loading}
            className="w-full rounded-lg bg-green-600 py-3 text-white font-semibold disabled:opacity-50">
            {loading ? 'Đang gửi...' : 'Đặt sân và thanh toán'}
          </button>
          <p className="text-xs text-gray-500">Sau khi bấm, sân được giữ cho bạn 15 phút để chuyển khoản.</p>
        </form>
      )}

      {msg && (
        <div className={`mt-4 rounded-lg p-3 ${msg.type === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {msg.text}
        </div>
      )}
    </main>
  );
}