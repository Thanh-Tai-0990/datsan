// Escape ký tự đặc biệt để tên khách không chèn được mã HTML vào email
export const esc = s =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Gửi email cho chủ sân. Lỗi email không bao giờ làm hỏng việc đặt sân.
export async function notifyOwner(subject, html) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.OWNER_EMAIL;
  if (!key || !to) return;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Đặt sân <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.error('Gửi email lỗi:', e.message);
  }
}