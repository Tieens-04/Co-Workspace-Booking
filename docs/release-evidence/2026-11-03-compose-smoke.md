# Bằng chứng phát hành — Compose smoke & restore drill (CWB-61)

```
Release: ed57d01 (master sau PR #25)  Ngày: 2026-11-03  Môi trường: máy dev, Docker 29.6.2 / Compose 5.3.1
CI: quality / browser-e2e / docker-build / secret-scan = pass (PR #25)
Backup: cospace-20261103-*.sql  size=27417 B  sha256=46c1410d76dbf50ed2df81f225ed2abcee5a485b4d30887d99fc4ef5b2404e13  kết thúc bằng "-- Dump completed"
Restore drill: cospace_restore_check users=3 bookings=10 rooms=2 email_outbox=6 audit_events=8 paid_revenue=900000.00
               latest_migration=20261103150000_cwb68_email_outbox (8 migrations) — khớp nguồn — OK, đã DROP
Deploy: 4 container healthy (db, server, client, mailpit) từ volume trống; readiness=200
Shutdown: docker compose stop server → "SIGTERM received; draining" → "Shutdown complete", exit 0 (~1s)
Smoke: auth OK | booking/cancel OK | guest+payment OK | check-in/complete OK | upload validation OK (Cloudinary thật: chưa) | email OK (Mailpit) + SMTP outage OK
Known issues: xem cuối tài liệu
```

## Cách chạy

- Stack compose **cô lập**: project `cwb61smoke`, override đặt tên container riêng, `restart: "no"`, cổng client `8189`, DB `127.0.0.1:3399`. Thêm Mailpit làm SMTP local (UI `127.0.0.1:8125`).
- Secret (DB, JWT) sinh ngẫu nhiên cho lần chạy và bị hủy cùng stack. Cloudinary dùng giá trị giả. Không dùng tài khoản email hoặc Cloudinary thật.
- Admin tạo bằng `docker compose exec -e ADMIN_BOOTSTRAP_EMAIL -e ADMIN_BOOTSTRAP_PASSWORD -e ADMIN_BOOTSTRAP_FULL_NAME server npm run admin:bootstrap`.
- Smoke chạy qua Nginx (`http://localhost:8189`) bằng một script Node tạm thời (không commit). Script gồm 28 kiểm tra, tóm tắt bên dưới.
- Backup và restore chạy đúng lệnh trong [release-runbook.md](../release-runbook.md) mục 3.2 và mục 5. Stack đã `down -v` sau khi chạy xong.

## Kết quả smoke (28/28 PASS)

| Nhóm             | Kiểm tra                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health           | `/health` 200 qua Nginx; `/api/v1/health` 200, `database: connected`                                                                                                                                 |
| Auth/RBAC        | đăng ký 201, đăng nhập 200, sai mật khẩu 401, admin bootstrap đăng nhập 200, CUSTOMER → admin API 403, không token 401                                                                               |
| Phòng            | admin tạo phòng 201; phòng xuất hiện ở `GET /rooms`                                                                                                                                                  |
| Booking          | tạo 201, mã `CS-YYYYMMDD-XXXX`, tổng tiền server tính (2h × 150000 = `300000.00`); booking chồng giờ 409; hủy ≥ 1 giờ trước 200                                                                      |
| Admin            | khách vãng lai 201; xác nhận thanh toán QR 200; check-in booking đang diễn ra 200; hoàn tất booking đã kết thúc 200; doanh thu 200; audit ghi `BOOKING_GUEST_CREATED` + `BOOKING_PAYMENT_CONFIRMED`  |
| Upload qua Nginx | file không phải ảnh → 400 `VALIDATION_ERROR`; ảnh > 5MB → 413 `FILE_TOO_LARGE`; ảnh hợp lệ tới backend, Cloudinary giả → 502 `IMAGE_UPLOAD_FAILED`, không lộ stack                                   |
| Email            | Mailpit nhận email xác nhận và hủy; outbox hai email `SENT`                                                                                                                                          |
| SMTP mất kết nối | booking vẫn 201; email `QUEUED` chờ retry, `lastError=SMTP_ERROR`; log chỉ có `[Email] confirmation delivery failed for <mã booking>; code=ETIMEDOUT`, không có email người nhận, mật khẩu SMTP, JWT |

## Lỗi phát hiện khi smoke và đã sửa trong PR này

1. **Server crash ở lần khởi động đầu (volume trống).**
   - Healthcheck MySQL ping qua socket (`-h localhost`) nên báo healthy khi server khởi tạo tạm thời của MySQL còn tắt mạng.
   - Kết quả: backend chạy `prisma migrate deploy` gặp `P1001: Can't reach database server at db:3306` và thoát 1. Production với `restart: always` sẽ crash-loop rồi mới lên.
   - Sửa: ping qua TCP `-h 127.0.0.1`. Kiểm chứng lại trên volume trống: server lên ngay lần đầu.
2. **Container `client` luôn `unhealthy`.**
   - `wget http://localhost/` trong image phân giải thành `[::1]`, nhưng Nginx chỉ `listen 80` (IPv4).
   - Sửa: healthcheck dùng `http://127.0.0.1/`.
3. **Lệnh tạo admin trong tài liệu bị sai.**
   - Lệnh cũ `docker compose exec server npm run admin:bootstrap --workspace=apps/server` lỗi `No workspaces found`, vì thư mục làm việc của container đã là `apps/server`. Lệnh cũ cũng không chuyển biến `ADMIN_BOOTSTRAP_*` vào container.
   - Sửa: README và runbook dùng lệnh ở mục "Cách chạy".

## Known issues / chưa kiểm chứng

- Upload lên **Cloudinary thật** chưa kiểm chứng; cần chạy trên staging với tài khoản Cloudinary riêng.
- HTTPS / reverse proxy phía trước chưa chạy thật. Lần này chỉ kiểm tra Nginx của container client qua HTTP.
- Đây là smoke trên máy dev một instance, không phải load test.
- Compose cảnh báo thuộc tính `version` đã lỗi thời. Không ảnh hưởng hoạt động; chưa xóa để giữ thay đổi nhỏ.
