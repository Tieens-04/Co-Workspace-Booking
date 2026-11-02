# Benchmark báo cáo doanh thu/KPI (CWB-57)

Chạy: `npm run bench:reports --workspace=apps/server -- [bookingCount] [iterations]`
(`apps/server/scripts/benchmark-reports.ts`). Script chỉ chạy trên database `*_test` (dùng cùng guard với
integration), seed dữ liệu tạm có tiền tố `BENCH_<runId>` rồi xóa khi kết thúc.

## Kết quả (02/11/2026, máy phát triển, MySQL 8 local)

Dataset: 20.000 booking seed (20.007 trong bảng), 20 phòng, trải trên 1 năm; 30 lần đo sau 3 lần warm-up.
Đây là số đo một tiến trình trên máy local, **không** phải load test đồng thời; không dùng để khẳng định SLA
(ví dụ < 300 ms) cho production.

| Truy vấn                                               | Số dòng về Node | p50 ms | p95 ms | Heap tăng MB |
| ------------------------------------------------------ | --------------- | ------ | ------ | ------------ |
| Revenue, cách cũ: `findMany` toàn bộ + tính trong Node | 20007           | 430.3  | 464.6  | 76.1         |
| Revenue, mới: `groupBy(status, paymentStatus)`         | 8               | 73.8   | 85.7   | 1.0          |
| `calculateRevenue({})` (gồm kiểm tra lazy no-show)     | —               | 78.5   | 91.3   | 1.5          |
| `getKpiData` (kỳ 7 ngày)                               | —               | 56.8   | 69.8   | 8.1          |

Số SQL mỗi lần gọi: cả hai cách đều 1 query; cách cũ trả 20.007 dòng, `groupBy` trả tối đa 8 dòng.

EXPLAIN (`FORMAT=TREE`):

```
cũ:      -> Table scan on bookings  (cost=2239 rows=21347)
groupBy: -> Table scan on <temporary>
             -> Aggregate using temporary table
                 -> Table scan on bookings  (cost=2239 rows=21347)
```

## Nhận xét

- `groupBy` giảm p95 khoảng 5 lần và gần như loại bỏ tăng trưởng bộ nhớ, vì Node không còn nhận từng booking.
- Không có bộ lọc kỳ thì MySQL vẫn phải quét toàn bảng `bookings`. Chưa thêm index: một covering index
  `(status, payment_status, total_amount)` chỉ chuyển table scan thành index scan, chi phí vẫn tăng tuyến tính.
  Giải pháp bền vững là **giới hạn kỳ mặc định** cho revenue API (lọc theo `start_time`, dùng được index
  `(start_time, id)`), việc này đổi contract API nên cần thống nhất trước.
- Việc còn lại của CWB-57: giới hạn kỳ, phân trang schedule, thu hẹp phạm vi lazy evaluation và load test đồng
  thời trên môi trường gần production.
