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

## Cập nhật 03/11/2026: giới hạn kỳ mặc định và phân trang schedule

Cùng script `npm run bench:reports` (20.000 booking rải đều 365 ngày, 30 lần lặp, máy dev một tiến trình). Đã thêm phép đo đường đi mặc định mới:

| Query                                                  | p50 ms | p95 ms | Heap growth MB |
| ------------------------------------------------------ | -----: | -----: | -------------: |
| Repository calculateRevenue({}) — toàn bộ lịch sử (cũ) |   60.0 |   86.4 |            0.9 |
| Repository calculateRevenue(kỳ mặc định 90 ngày) — mới |   47.3 |   58.7 |            1.6 |

- `GET /admin/revenue` giờ luôn có kỳ (mặc định 90 ngày gần nhất, tối đa 366 ngày). Chi phí tỉ lệ với số booking **trong kỳ**, không còn tăng theo toàn bộ lịch sử.
- Mức giảm trên bộ dữ liệu này nhỏ (khoảng 32% p95) vì dữ liệu chỉ trải một năm. Bảng càng có nhiều năm lịch sử thì khoảng cách càng lớn.
- Chưa đo EXPLAIN cho truy vấn có kỳ nên không khẳng định MySQL dùng index `(start_time, id)`; chưa thêm index mới.
- `GET /admin/dashboard/schedule` phân trang theo phòng (mặc định 20, tối đa 50), nên số dòng slot/booking mỗi request bị chặn theo `limit`.
- Chưa làm: thu hẹp phạm vi lazy no-show evaluation trên các GET (đo được `calculateRevenue({})` gồm cả bước này ở mức p95 86.4 ms) và load test đồng thời trên môi trường gần production. Đây vẫn là số đo local, không phải load test.

## Cập nhật 04/11/2026: thu hẹp lazy no-show evaluation, tải đồng thời, EXPLAIN có kỳ

Cùng `npm run bench:reports` (20.000 booking rải 365 ngày, máy dev). Script thêm ba phép đo.

### 1. Lazy no-show evaluation có backlog

4.000 booking `CONFIRMED` đã kết thúc, chưa check-in. Trạng thái được đặt lại trước mỗi lần đo, 5 lần đo.

| Evaluator                               | Booking cập nhật | p50 ms | p95 ms |
| --------------------------------------- | ---------------: | -----: | -----: |
| Toàn bảng (trước CWB-57)                |            4.000 | 1714.9 | 1967.7 |
| Giới hạn theo kỳ mặc định 90 ngày (sau) |              990 |  400.2 |  440.7 |

Report GET (revenue, KPI, lịch phòng, CSV) giờ chỉ đánh giá booking giao với cửa sổ chúng đọc. Một GET không còn phải xử lý toàn bộ backlog của cả bảng.

### 2. Tải đồng thời

10 lời gọi `calculateRevenue(kỳ mặc định)` song song × 10 vòng = 100 lời gọi:

- p50 45.1 ms, p95 81.9 ms, 169.5 lời gọi/giây.
- Đo trên một tiến trình, connection pool mặc định của Prisma, MySQL local. Đây không phải load test HTTP trên môi trường production.

### 3. EXPLAIN (`FORMAT=TREE`)

```
groupBy, kỳ 90 ngày:
-> Aggregate using temporary table
    -> Filter: (start_time >= ... and start_time < ...)  (rows=9236)
        -> Table scan on bookings  (rows=20300)

no-show candidates, có phạm vi:
-> Limit: 100 -> Sort: id
    -> Filter: (start_time < ...)
        -> Index range scan on bookings using bookings_attendance_no_show_idx
           over (status='CONFIRMED' AND attendance_tracking_enabled=1 AND checked_in_at=NULL AND from < end_time <= now)
```

- Truy vấn ứng viên no-show dùng index hiện có `bookings_attendance_no_show_idx` (range theo `end_time`).
- Truy vấn doanh thu có kỳ vẫn **table scan + filter**. Trên bộ dữ liệu này, kỳ 90 ngày chiếm khoảng 45% số dòng nên optimizer chọn quét bảng thay vì index `(start_time, id)`.
- Lợi ích chính của giới hạn kỳ là số dòng tổng hợp và dữ liệu trả về bị chặn; chi phí quét vẫn tăng theo kích thước bảng.
- Theo yêu cầu "đo trước khi thêm index", **chưa thêm index mới**. Nên cân nhắc lại index `(start_time, status, payment_status, total_amount)` khi bảng có nhiều năm lịch sử và kỳ 90 ngày chỉ còn là một phần nhỏ dữ liệu.
