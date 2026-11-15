export const OPEN_HOUR = 8;    // mở cửa 8:00
export const CLOSE_HOUR = 23;  // đóng cửa 23:00
export const PRICE = 300000;   // giá hiển thị, giá thật server lấy từ database

// Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD
export function todayVN() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

// Giờ hiện tại (0-23) theo giờ Việt Nam
export function nowHourVN() {
  const h = new Date().toLocaleString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false,
  });
  return parseInt(h, 10) % 24;
}

export function formatMoney(n) {
  return n.toLocaleString('vi-VN') + 'đ';
}

export const MIN_CANCEL_HOURS = 2; // khách chỉ được tự hủy trước giờ đá ít nhất 2 tiếng

// Còn bao nhiêu giờ nữa đến khung giờ này (theo giờ Việt Nam)
export function hoursUntil(date, hour) {
  const days = (Date.parse(date) - Date.parse(todayVN())) / 86400000;
  return days * 24 + hour - nowHourVN();
}