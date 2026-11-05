# Quy tắc nghiệp vụ đặt phòng — tài liệu chuẩn (CWB-62)

Đây là nguồn chuẩn cho policy thời gian, vòng đời booking và thanh toán. Mọi giá trị dưới đây khớp với code
(`apps/server/src/utils/booking-time.util.ts`, `apps/client/src/utils/bookingTime.ts`) và được kiểm tra tự động bởi
`apps/server/src/__tests__/booking-policy-parity.test.ts`. Khi đổi policy phải sửa code BE, FE, tài liệu này và test
cùng lúc. Backend luôn là nơi quyết định; FE chỉ kiểm tra trước để phản hồi sớm.

## 1. Policy thời gian (hiệu lực)

| Quy tắc              | Giá trị                                                                                     | Biên hợp lệ                                      | Lỗi khi vi phạm                     |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| Mốc slot             | 30 phút, giây/ms = 0                                                                        | `09:00`, `09:30`                                 | `400 INVALID_SLOT`                  |
| Kết thúc sau bắt đầu | `endTime > startTime`                                                                       | —                                                | `400 INVALID_SLOT`                  |
| Thời lượng tối thiểu | 1 giờ (60 phút)                                                                             | đúng 60 phút hợp lệ                              | `400 MIN_DURATION`                  |
| Thời lượng tối đa    | **8 giờ (480 phút)**                                                                        | đúng 480 phút hợp lệ                             | `400 MAX_DURATION`                  |
| Không đặt quá khứ    | `startTime > now`                                                                           | —                                                | `400 PAST_TIME`                     |
| Đặt trước tối thiểu  | 30 phút trước giờ bắt đầu                                                                   | đúng 30 phút hợp lệ                              | `400 ADVANCE_NOTICE`                |
| Giờ hoạt động        | 07:00–22:00 cùng một ngày, giờ Việt Nam (`Asia/Ho_Chi_Minh`, UTC+7)                         | `07:00–08:00`, `21:00–22:00` hợp lệ              | `400 OUTSIDE_OPERATING_HOURS`       |
| Customer tự hủy      | **còn ít nhất 1 giờ** trước giờ bắt đầu                                                     | đúng 60 phút hợp lệ; 59 phút bị từ chối          | `400 CANCELLATION_POLICY_VIOLATION` |
| Trùng lịch           | `existing.start < requested.end AND existing.end > requested.start` với booking `CONFIRMED` | chạm biên (kết thúc 10:00, bắt đầu 10:00) hợp lệ | `409 BOOKING_CONFLICT`              |

Server kiểm tra lại lead time bằng giờ server ngay trước khi insert, sau khi lấy khóa phòng (`SELECT ... FOR UPDATE`,
CWB-51). Giá tiền = `price_per_hour × thời lượng`, Decimal làm tròn `ROUND_HALF_UP` 2 chữ số; tổng tiền từ client
chỉ để hiển thị.

### Thay đổi đã thay thế (superseded)

| Quy tắc           | Mô tả cũ (Jira CWB-19, CWB-26) | Hiệu lực hiện tại                   |
| ----------------- | ------------------------------ | ----------------------------------- |
| Thời lượng tối đa | 4 giờ                          | **8 giờ** (AGENTS.md)               |
| Customer tự hủy   | trước ít nhất 2 giờ            | **trước ít nhất 1 giờ** (AGENTS.md) |

Không triển khai lại policy 4 giờ/2 giờ. CWB-19 và CWB-26 đã được ghi chú superseded và trỏ về tài liệu này.

## 2. Vòng đời booking và thanh toán

Trạng thái booking (`status`) và thanh toán (`paymentStatus`, `paymentMethod`) là hai trục độc lập.

| Thao tác                                                       | Vai trò                | Điều kiện                                                                                                       | Kết quả                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tạo booking `POST /api/v1/bookings`                            | CUSTOMER               | Toàn bộ policy mục 1, phòng không `MAINTENANCE`, không trùng lịch                                               | `201`, `CONFIRMED` + `UNPAID`, mã `CS-YYYYMMDD-XXXX`                                                                                                                                                                    |
| Booking khách vãng lai `POST /api/v1/admin/bookings/guest`     | ADMIN                  | Như trên, lưu `guestName`/`guestPhone`, `userId = null`                                                         | `201`, `CONFIRMED` + `UNPAID`                                                                                                                                                                                           |
| Customer hủy `PATCH /api/v1/bookings/:id/cancel`               | CUSTOMER (chủ booking) | `CONFIRMED`, còn ≥ 1 giờ; đã `CANCELLED` thì trả lại bản ghi (idempotent)                                       | `200 CANCELLED`; `COMPLETED`/`NO_SHOW` → `409 BOOKING_STATE_CONFLICT`; của người khác → `404`                                                                                                                           |
| Admin hủy `PATCH /api/v1/admin/bookings/:id/cancel`            | ADMIN                  | Bắt buộc lý do (≤ 500 ký tự); chỉ booking `CONFIRMED` (CWB-71); đã `CANCELLED` thì trả lại bản ghi (idempotent) | `200 CANCELLED`, lưu `cancellationReason`; `COMPLETED`/`NO_SHOW` hoặc `CONFIRMED` đã quá giờ kết thúc mà chưa check-in (no-show chưa được lazy evaluation ghi) → `409 BOOKING_STATE_CONFLICT`, không đổi DB/audit/email |
| Xác nhận thanh toán `PATCH /api/v1/admin/bookings/:id/payment` | ADMIN                  | Booking không `CANCELLED`; đã `PAID` thì trả lại bản ghi (idempotent)                                           | `PAID` + `CASH`/`QR`; `CANCELLED` → `409`                                                                                                                                                                               |
| Check-in `PATCH /api/v1/admin/bookings/:id/check-in`           | ADMIN                  | `CONFIRMED` và `startTime ≤ now < endTime`                                                                      | Lưu `checkedInAt` một lần, giữ `CONFIRMED`                                                                                                                                                                              |
| Hoàn tất / Không đến `PATCH .../complete`, `.../no-show`       | ADMIN                  | `CONFIRMED` và `now ≥ endTime`; theo dõi check-in thì hoàn tất cần `checkedInAt`, không đến cần chưa check-in   | `COMPLETED` / `NO_SHOW`; trạng thái kết thúc khác → `409`                                                                                                                                                               |
| No-show tự động (lazy)                                         | Hệ thống               | `CONFIRMED`, `attendanceTrackingEnabled`, chưa check-in, `endTime ≤ now`                                        | `NO_SHOW`, không phụ thuộc thanh toán                                                                                                                                                                                   |

Doanh thu thực tế chỉ tính booking `PAID`; booking `CANCELLED` chưa thanh toán không tính vào doanh thu tiềm năng.
Chi tiết request/response từng endpoint: [application-reference.md](application-reference.md).

## 3. Bằng chứng kiểm thử

| Quy tắc                                                | Test                                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Slot 30 phút, 1–8 giờ, quá khứ, 30 phút, giờ hoạt động | `apps/server/src/__tests__/booking-time.test.ts`                                                         |
| Lead time sau khi lấy khóa, đúng 30 phút               | `apps/server/src/__tests__/booking-lead-time.integration.test.ts`                                        |
| Hủy ≥ 1 giờ, đúng 60 phút, 45 phút, quá khứ, IDOR      | `booking-cancellation.test.ts`, `booking-cancellation.integration.test.ts`                               |
| Trùng lịch, chạm biên, chạy đồng thời                  | `booking-regression.test.ts`, `booking.integration.test.ts`                                              |
| FE: múi giờ, giá Decimal, validate lựa chọn            | `apps/client/src/__tests__/bookingTime.test.ts`                                                          |
| FE và BE cùng hằng số policy                           | `apps/server/src/__tests__/booking-policy-parity.test.ts`                                                |
| Thanh toán, check-in, hoàn tất/không đến               | `admin-booking.test.ts`, `booking-check-in.integration.test.ts`, `booking-lifecycle.integration.test.ts` |
| Admin không hủy được `COMPLETED`/`NO_SHOW` (CWB-71)    | `admin-booking.integration.test.ts`                                                                      |

## 4. QA checklist (FE/BE/docs khớp nhau)

Kiểm trên giao diện và API với giờ Việt Nam; ghi lại kết quả vào bằng chứng phát hành.

- [ ] Slot lệch mốc (09:15) bị từ chối ở form và API (`INVALID_SLOT`).
- [ ] 30 phút bị từ chối (`MIN_DURATION`); đúng 1 giờ được chấp nhận.
- [ ] Đúng 8 giờ được chấp nhận; 8 giờ 30 phút bị từ chối (`MAX_DURATION`).
- [ ] Bắt đầu sau 29 phút bị từ chối (`ADVANCE_NOTICE`); đúng 30 phút được chấp nhận.
- [ ] 06:30–08:00 hoặc 21:00–22:30 bị từ chối (`OUTSIDE_OPERATING_HOURS`); 07:00–08:00 và 21:00–22:00 hợp lệ.
- [ ] Hủy khi còn đúng 60 phút thành công; còn 59 phút bị từ chối (`CANCELLATION_POLICY_VIOLATION`).
- [ ] Booking kết thúc 10:00 và booking mới bắt đầu 10:00 cùng phòng đều thành công.
- [ ] Trình duyệt đặt múi giờ khác (ví dụ UTC) vẫn hiển thị và gửi đúng giờ Việt Nam.
- [ ] Tổng tiền hiển thị ở FE bằng `totalAmount` do server trả về.
