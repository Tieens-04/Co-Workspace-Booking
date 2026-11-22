const viCurrencyFormatter = new Intl.NumberFormat('vi-VN');
const viHoursFormatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 1,
});

export function formatVnd(price: string | number): string {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num) || !isFinite(num)) {
    return '0 đ/giờ';
  }
  return `${viCurrencyFormatter.format(num)} đ/giờ`;
}

export function formatCurrency(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num) || !isFinite(num)) {
    return '0 đ';
  }
  return `${viCurrencyFormatter.format(num)} đ`;
}

export function formatHoursFromMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '0';
  }
  return viHoursFormatter.format(minutes / 60);
}
