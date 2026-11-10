# Quy tắc nghiệp vụ đặt phòng — tài liệu chuẩn (CWB-62)

Đây là nguồn chuẩn cho policy thời gian, vòng đời booking và thanh toán. Mọi giá trị dưới đây khớp với code
(`apps/server/src/utils/booking-time.util.ts`, `apps/client/src/utils/bookingTime.ts`) và được kiểm tra tự động bởi
`apps/server/src/__tests__/booking-policy-parity.test.ts`. Khi đổi policy phải sửa code BE, FE, tài liệu này và test
cùng lúc. Backend luôn là nơi quyết định; FE chỉ kiểm tra trước để phản hồi sớm.

## 1. Policy thời gian (hiệu lực)

| Quy tắc                   | Giá trị                                                                                                                           | Biên hợp lệ                                      | Lỗi khi vi phạm                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| Mốc slot                  | 30 phút, giây/ms = 0                                                                                                              | `09:00`, `09:30`                                 | `400 INVALID_SLOT`                  |
| Kết thúc sau bắt đầu      | `endTime > startTime`                                                                                                             | —                                                | `400 INVALID_SLOT`                  |
| Thời lượng tối thiểu      | 1 giờ (60 phút)                                                                                                                   | đúng 60 phút hợp lệ                              | `400 MIN_DURATION`                  |
| Thời lượng tối đa         | **8 giờ (480 phút)**                                                                                                              | đúng 480 phút hợp lệ                             | `400 MAX_DURATION`                  |
| Không đặt quá khứ         | `startTime > now`                                                                                                                 | —                                                | `400 PAST_TIME`                     |
| Đặt trước tối thiểu       | 30 phút trước giờ bắt đầu                                                                                                         | đúng 30 phút hợp lệ                              | `400 ADVANCE_NOTICE`                |
| Đặt trước tối đa (CWB-75) | `startTime ≤ now + BOOKING_MAX_ADVANCE_DAYS` ngày (mặc định **60**, env 1–365); áp dụng chung customer và guest booking của admin | đúng N ngày hợp lệ; N ngày + 30 phút bị từ chối  | `400 BOOKING_HORIZON`               |
| Giờ hoạt động             | 07:00–22:00 cùng một ngày, giờ Việt Nam (`Asia/Ho_Chi_Minh`, UTC+7)                                                               | `07:00–08:00`, `21:00–22:00` hợp lệ              | `400 OUTSIDE_OPERATING_HOURS`       |
| Customer tự hủy           | **còn ít nhất 1 giờ** trước giờ bắt đầu                                                                                           | đúng 60 phút hợp lệ; 59 phút bị từ chối          | `400 CANCELLATION_POLICY_VIOLATION` |
| Trùng lịch                | `existing.start < requested.end AND existing.end > requested.start` với booking `CONFIRMED`                                       | chạm biên (kết thúc 10:00, bắt đầu 10:00) hợp lệ | `409 BOOKING_CONFLICT`              |
| Khung đóng cửa (CWB-86)   | Không giao với `Closure` của phòng (`roomId = room.id`) hoặc toàn cơ sở (`roomId = null`)                                         | chạm biên với khung đóng cửa hợp lệ              | `409 ROOM_CLOSED`                   |

Server kiểm tra lại lead time bằng giờ server ngay trước khi insert, sau khi lấy khóa phòng (`SELECT ... FOR UPDATE`,
CWB-51). Giá tiền = `price_per_hour × thời lượng`, Decimal làm tròn `ROUND_HALF_UP` 2 chữ số; tổng tiền từ client
chỉ để hiển thị.

### Chống giữ chỗ hàng loạt (CWB-78)

Booking mặc định `UNPAID` (trả tại quầy), nên server giới hạn việc giữ chỗ không tốn chi phí:

| Giới hạn                     | Giá trị                                                                                                   | Phạm vi                                             | Lỗi khi vượt               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------- |
| Booking sắp tới mỗi customer | tối đa `BOOKING_MAX_ACTIVE_PER_CUSTOMER` (mặc định **5**, env 1–100) booking `CONFIRMED` có `start ≥ now` | customer; guest booking của admin không bị giới hạn | `409 ACTIVE_BOOKING_LIMIT` |
| `POST /api/v1/bookings`      | 20 request / 15 phút, tính mọi request                                                                    | theo tài khoản đã xác thực (không theo IP)          | `429 TOO_MANY_REQUESTS`    |
| `POST /api/v1/auth/register` | 10 request / 1 giờ, tính mọi request                                                                      | theo IP (qua `TRUST_PROXY`, IPv6 gom theo /56)      | `429 TOO_MANY_REQUESTS`    |

Booking đã hủy, hoàn tất, no-show hoặc đã qua giờ bắt đầu không tính vào giới hạn; hủy một booking sắp tới giải
phóng một lượt. Kiểm tra giới hạn nằm trong transaction tạo booking, sau khi khóa dòng `users` của customer
(`SELECT ... FOR UPDATE`, khóa trước dòng phòng), nên hai request đồng thời cho hai phòng khác nhau không thể cùng
vượt giới hạn. Retry cùng `Idempotency-Key` của booking đã tạo vẫn trả lại booking gốc.

### Email nhắc lịch (CWB-80)

Khách có tài khoản nhận một email nhắc `BOOKING_REMINDER_HOURS` giờ (mặc định 2) trước giờ bắt đầu cho mỗi booking
`CONFIRMED`; không nhắc booking đặt sát giờ (đã trong cửa sổ nhắc), booking đã hủy/không còn `CONFIRMED`, booking đã bắt
đầu và khách vãng lai. Email là tác dụng phụ: lỗi gửi không đổi trạng thái booking.

### Khóa tài khoản khách (CWB-79)

Admin có thể khóa tài khoản `CUSTOMER` lạm dụng (bắt buộc lý do, có audit). Tài khoản bị khóa bị đăng xuất ngay,
không đăng nhập được (`403 ACCOUNT_LOCKED`) và không tạo được booking. Booking tương lai **không** tự hủy: admin
được cảnh báo danh sách để xử lý thủ công. Không khóa được tài khoản `ADMIN`, kể cả chính mình.

### Quản lý ngày nghỉ lễ & khung đóng cửa (CWB-86)

Admin có thể thiết lập các khoảng đóng cửa (`Closure`) áp dụng cho **toàn cơ sở** (`roomId = null`) hoặc **theo từng phòng** (`roomId = <uuid>`), kèm lý do bắt buộc (1–500 ký tự).
- **Chặn đặt phòng & đổi lịch**: Mọi thao tác tạo booking (`CUSTOMER` hoặc `GUEST`) và dời lịch (`PATCH /api/v1/bookings/:id/reschedule`) giao với bất kỳ `Closure` nào của phòng đó hoặc toàn cơ sở (`closure.startTime < requested.endTime AND closure.endTime > requested.startTime`) đều bị từ chối với `409 ROOM_CLOSED` ngay trong transaction sau khi khóa hàng phòng (`SELECT ... FOR UPDATE`).
- **Đồng bộ khóa hàng phòng (`SELECT ... FOR UPDATE`)**: Khi tạo hoặc cập nhật `Closure`, server khóa hàng phòng liên quan (hoặc toàn bộ phòng chưa lưu trữ khi đóng cửa toàn cơ sở) trước khi kiểm tra booking xung đột và ghi dữ liệu, đảm bảo tuần tự hóa với các request tạo/dời lịch booking chạy đồng thời.
- **Bảo toàn booking hiện có**: Nếu khoảng đóng cửa giao với các booking `CONFIRMED` đang có và request chưa gửi `acknowledgeConflictingBookings: true`, server trả về `409 CLOSURE_HAS_CONFLICTING_BOOKINGS` kèm danh sách các booking trùng (`bookingCode`, `roomId`, `roomName`, `startTime`, `endTime`, `userEmail`, `guestName`). Khi gửi kèm `acknowledgeConflictingBookings: true`, khung đóng cửa được lưu và **tuyệt đối không tự động hủy** các booking `CONFIRMED` hiện có.
- **Hiển thị lịch trống (`GET /api/v1/rooms/:id/availability` & `GET /api/v1/admin/dashboard/schedule`)**: Các slot 30 phút giao với `Closure` (và chưa có booking `CONFIRMED` chiếm chỗ) mang trạng thái `CLOSED` kèm `closureReason`.

### Bắt buộc xác thực email khi đặt phòng (CWB-87)

Tài khoản khách hàng (`CUSTOMER`) sau khi đăng ký mới có `emailVerifiedAt = null`.
- **Chặn đặt phòng khi chưa xác thực:** Khi gọi `POST /api/v1/bookings`, hệ thống kiểm tra trạng thái xác thực trong transaction tạo booking, ngay sau khi khóa dòng `users` (`SELECT locked_at, email_verified_at FROM users WHERE id = ? FOR UPDATE`). Nếu tài khoản bị khóa (`locked_at IS NOT NULL`), hệ thống ưu tiên trả `403 ACCOUNT_LOCKED`. Nếu tài khoản chưa xác thực email (`email_verified_at IS NULL`), request bị từ chối với `403 EMAIL_NOT_VERIFIED` ("Vui lòng xác thực email trước khi đặt phòng").
- **Guest booking:** Luồng đặt phòng cho khách vãng lai của admin (`POST /api/v1/admin/bookings/guest`) không bị giới hạn này vì `userId` là `null`.
- **Token xác thực email:** Token là chuỗi 32 byte base64url ngẫu nhiên, bảng `email_verification_tokens` lưu bản băm SHA-256, thời hạn 30 phút, cơ chế one-time use chống replay. Khi một token được tiêu thụ thành công, `emailVerifiedAt` được cập nhật và toàn bộ token xác thực còn lại của người dùng đó bị xóa/hủy.
- **Tương thích dữ liệu cũ:** Tài khoản tạo trước CWB-87 được migration backfill `email_verified_at = CURRENT_TIMESTAMP(3)` nên không bị gián đoạn quyền đặt phòng.
- **Rate limits:** `POST /api/v1/auth/verify-email` giới hạn 10 lần thất bại / 15 phút / IP; `POST /api/v1/auth/resend-verification` giới hạn 5 lần / 15 phút / tài khoản.
- **Quyết định Product về đăng ký và chống dò email (AC4):** Giữ nguyên mã lỗi `409 EMAIL_ALREADY_EXISTS` và chuẩn hóa email (chữ thường, cắt khoảng trắng thừa) khi đăng ký tài khoản trùng lặp để đảm bảo tính tương thích với API và frontend hiện hành. Hệ thống chấp nhận việc đăng ký tiết lộ email đã tồn tại để người dùng có thể nhận biết và chuyển sang đăng nhập; ngược lại, các luồng quên mật khẩu (`forgot-password`) và gửi lại email xác thực (`resend-verification`) luôn trả về phản hồi trung tính (`200` với thông điệp chung) để chống dò quét trạng thái tài khoản.

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
| Customer hủy `PATCH /api/v1/bookings/:id/cancel`               | CUSTOMER (chủ booking) | `CONFIRMED`, còn ≥ 1 giờ; đã `CANCELLED` thì trả lại bản ghi (idempotent)                                       | `200 CANCELLED`, lưu `cancelledAt = now`, `cancelledBy = CUSTOMER`; `COMPLETED`/`NO_SHOW` → `409 BOOKING_STATE_CONFLICT`; của người khác → `404`                                                                         |
| Admin hủy `PATCH /api/v1/admin/bookings/:id/cancel`            | ADMIN                  | Bắt buộc lý do (≤ 500 ký tự); chỉ booking `CONFIRMED` (CWB-71); đã `CANCELLED` thì trả lại bản ghi (idempotent) | `200 CANCELLED`, lưu `cancellationReason`, `cancelledAt = now`, `cancelledBy = ADMIN`; `COMPLETED`/`NO_SHOW` hoặc `CONFIRMED` đã quá giờ kết thúc mà chưa check-in (no-show chưa được lazy evaluation ghi) → `409 BOOKING_STATE_CONFLICT`, không đổi DB/audit/email |
| Xác nhận thanh toán `PATCH /api/v1/admin/bookings/:id/payment` | ADMIN                  | Booking không `CANCELLED`; đã `PAID` thì trả lại bản ghi (idempotent)                                           | `PAID` + `CASH`/`QR`; `CANCELLED` → `409`                                                                                                                                                                               |
| Ghi nhận hoàn tiền `POST /api/v1/admin/bookings/:id/refund` (CWB-83) | ADMIN                  | Booking `CANCELLED` và `paymentStatus` là `PAID` hoặc `PARTIALLY_REFUNDED`; số tiền `0 < amount ≤ totalAmount - refundedAmount`; lý do bắt buộc (≤ 500 ký tự) | Cập nhật `refundedAmount`, chuyển `paymentStatus` sang `REFUNDED` (nếu hoàn 100%) hoặc `PARTIALLY_REFUNDED`; tạo bản ghi `Refund`, ghi `AuditEvent` `BOOKING_REFUNDED`; đơn chưa hủy hoặc chưa thanh toán → `409 BOOKING_STATE_CONFLICT`; đã hoàn đủ 100% → `409 BOOKING_ALREADY_FULLY_REFUNDED`; số tiền vượt quá số dư → `400 REFUND_AMOUNT_EXCEEDED` |
| Check-in `PATCH /api/v1/admin/bookings/:id/check-in`           | ADMIN                  | `CONFIRMED` và `startTime ≤ now < endTime`                                                                      | Lưu `checkedInAt` một lần, giữ `CONFIRMED`                                                                                                                                                                              |
| Hoàn tất / Không đến `PATCH .../complete`, `.../no-show`       | ADMIN                  | `CONFIRMED` và `now ≥ endTime`; theo dõi check-in thì hoàn tất cần `checkedInAt`, không đến cần chưa check-in   | `COMPLETED` / `NO_SHOW`; trạng thái kết thúc khác → `409`                                                                                                                                                               |
| No-show tự động (lazy)                                         | Hệ thống               | `CONFIRMED`, `attendanceTrackingEnabled`, chưa check-in, `endTime ≤ now`                                        | `NO_SHOW`, không phụ thuộc thanh toán                                                                                                                                                                                   |

Doanh thu thực tế chỉ tính các booking đã thanh toán (`PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`) trừ đi số tiền đã hoàn (`totalAmount - refundedAmount`); booking `CANCELLED` chưa thanh toán không tính vào doanh thu tiềm năng. Booking `REFUNDED` (hoàn 100%) có doanh thu thực bằng 0 và không tính vào số đơn đã thanh toán (`paidBookings`). Khách hàng tự hủy booking `PAID` được cảnh báo rõ ràng trên giao diện trước khi xác nhận.
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
| Lưu `cancelledAt`, `cancelledBy` và hiển thị lý do hủy cho khách hàng (CWB-82) | `booking-cancellation.test.ts`, `booking-cancellation.integration.test.ts`, `admin-booking.test.ts`, `admin-booking.integration.test.ts`, `booking-history.test.ts`, `BookingDetailPage.test.tsx`, `BookingHistoryPage.test.tsx`, `status.test.ts` |
| Ghi nhận hoàn tiền, locking, audit, doanh thu và cảnh báo khách hàng (CWB-83) | `booking-revenue.test.ts`, `admin-booking.test.ts`, `admin-booking.integration.test.ts`, `RefundBookingDialog.test.tsx`, `AdminBookingsPage.test.tsx`, `BookingDetailPage.test.tsx` |
| Quản lý khung đóng cửa toàn cơ sở / theo phòng, khóa đồng thời, chặn đặt/dời lịch, cảnh báo xung đột và audit (CWB-86) | `admin-closure.validator.test.ts`, `closure.service.test.ts`, `closure.integration.test.ts`, `AdminClosuresPage.test.tsx`, `BookingForm.test.tsx`, `AdminGuestBookingForm.test.tsx`, `BookingDetailPage.test.tsx`, `RoomOverviewGrid.test.tsx`, `AdminAuditPage.test.tsx`, `e2e/closure.spec.ts` |
| Bắt buộc xác thực email khi đặt phòng, tiêu thụ token một lần, resend và rate limit (CWB-87) | `email-verification.test.ts`, `email-verification.integration.test.ts`, `EmailVerification.test.tsx`, `BookingForm.test.tsx`, `e2e/email-verification.spec.ts` |

## 4. QA checklist (FE/BE/docs khớp nhau)

Kiểm trên giao diện và API với giờ Việt Nam; ghi lại kết quả vào bằng chứng phát hành.

- [ ] Slot lệch mốc (09:15) bị từ chối ở form và API (`INVALID_SLOT`).
- [ ] 30 phút bị từ chối (`MIN_DURATION`); đúng 1 giờ được chấp nhận.
- [ ] Đúng 8 giờ được chấp nhận; 8 giờ 30 phút bị từ chối (`MAX_DURATION`).
- [ ] Bắt đầu sau 29 phút bị từ chối (`ADVANCE_NOTICE`); đúng 30 phút được chấp nhận.
- [ ] Bắt đầu đúng N ngày sau được chấp nhận; N ngày + 30 phút hoặc 3 năm sau bị từ chối (`BOOKING_HORIZON`). Ô ngày trên form có `min` = hôm nay, `max` = hôm nay + N và dòng giải thích; ngày ngoài horizon trả lỗi availability `400 BOOKING_HORIZON`.
- [ ] 06:30–08:00 hoặc 21:00–22:30 bị từ chối (`OUTSIDE_OPERATING_HOURS`); 07:00–08:00 và 21:00–22:00 hợp lệ.
- [ ] Hủy khi còn đúng 60 phút thành công; còn 59 phút bị từ chối (`CANCELLATION_POLICY_VIOLATION`).
- [ ] Đơn bị hủy hiển thị rõ bên hủy ("Đã hủy bởi Co-Space" / "Bạn đã hủy"), thời gian hủy và lý do hủy (nếu có). Dữ liệu cũ có lý do được nhận diện là "Đã hủy bởi Co-Space" (CWB-82).
- [ ] Booking kết thúc 10:00 và booking mới bắt đầu 10:00 cùng phòng đều thành công.
- [ ] Customer có đủ 5 booking sắp tới: lượt thứ 6 bị từ chối (`409 ACTIVE_BOOKING_LIMIT`) với thông báo rõ trên form; hủy một booking thì đặt lại được. Admin đặt hộ khách vãng lai không bị giới hạn.
- [ ] Admin khóa một khách có booking sắp tới: khách bị đăng xuất, đăng nhập trả "Tài khoản của bạn đã bị khóa", booking vẫn `CONFIRMED` và được liệt kê trong cảnh báo; mở khóa thì đăng nhập lại được. Không có nút khóa cho tài khoản ADMIN.
- [ ] Request thứ 21 tạo booking trong 15 phút của cùng tài khoản và request đăng ký thứ 11 trong 1 giờ cùng IP trả `429 TOO_MANY_REQUESTS`.
- [ ] Đăng ký tài khoản mới: tài khoản có thể đăng nhập nhưng chưa đặt được phòng (hiển thị banner xác thực và báo lỗi `403 EMAIL_NOT_VERIFIED` nếu cố đặt); sau khi kích hoạt qua link/nút xác nhận thì đặt phòng bình thường (CWB-87).
- [ ] Trình duyệt đặt múi giờ khác (ví dụ UTC) vẫn hiển thị và gửi đúng giờ Việt Nam.
- [ ] Tổng tiền hiển thị ở FE bằng `totalAmount` do server trả về.
