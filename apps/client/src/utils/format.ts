export function formatVnd(price: string | number): string {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num)) {
    return '0 đ/giờ';
  }
  return `${new Intl.NumberFormat('vi-VN').format(num)} đ/giờ`;
}

export function formatCurrency(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) {
    return '0 đ';
  }
  return `${new Intl.NumberFormat('vi-VN').format(num)} đ`;
}
