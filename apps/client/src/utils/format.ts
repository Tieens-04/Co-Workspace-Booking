export function formatVnd(price: string | number): string {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num)) {
    return '0 đ/giờ';
  }
  return `${new Intl.NumberFormat('vi-VN').format(num)} đ/giờ`;
}
