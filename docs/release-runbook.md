# Release Runbook — Co-Space Working (CWB-61)

Quy trình triển khai, sao lưu, rollback/khôi phục và bằng chứng phát hành cho bản chạy bằng Docker Compose. Không ghi secret vào tài liệu, issue hay log; mọi lệnh dưới đây đọc mật khẩu từ biến môi trường bên trong container.

## 1. Topology và cổng

| Thành phần         | Cổng                                | Phạm vi                                                                       |
| ------------------ | ----------------------------------- | ----------------------------------------------------------------------------- |
| `client` (Nginx)   | `${CLIENT_PORT:-80}` → 80           | Cổng duy nhất đi ra ngoài; phục vụ SPA và proxy `/api/`, `/health` vào server |
| `server` (Express) | 5000 (không publish)                | Chỉ trong mạng `cospace-network`; `TRUST_PROXY=true` tin đúng 1 hop Nginx     |
| `db` (MySQL 8)     | `127.0.0.1:${DB_PORT:-3306}` → 3306 | Chỉ loopback của host cho công cụ quản trị/sao lưu; không mở ra mạng          |

Không publish cổng 5000 hoặc mở 3306 ra `0.0.0.0`. Firewall của host chỉ cho phép 80/443 (và SSH quản trị).

### HTTPS

Chọn **một** phương án; cả hai đều giữ đúng 1 hop tin cậy cho rate limit theo IP:

- **A. TLS tại Nginx của client (khuyến nghị khi chạy 1 host):** mount chứng chỉ vào container `client`, thêm `listen 443 ssl` cùng `ssl_certificate`/`ssl_certificate_key`, chuyển hướng 80 → 443, bật `Strict-Transport-Security`. Publish `443:443`.
- **B. Reverse proxy/LB TLS phía trước:** bind client vào loopback (`127.0.0.1:${CLIENT_PORT}:80`) hoặc mạng nội bộ. Trong `apps/client/nginx.conf` thêm `set_real_ip_from <IP proxy>;` và `real_ip_header X-Forwarded-For;` để `$remote_addr` là IP người dùng thật. Nếu thiếu bước này, mọi request mang IP của proxy và rate limit đăng nhập sẽ chặn chung tất cả người dùng.

Với cả hai phương án, đặt `CLIENT_URL=https://<domain>` cho CORS và link trong email.

## 2. Health check và dừng an toàn

- `GET /health` và `GET /api/v1/health/liveness`: **liveness**, chỉ cho biết tiến trình còn sống, không phụ thuộc DB.
- `GET /api/v1/health`: **readiness**, trả `503 SERVICE_UNAVAILABLE` khi DB mất kết nối (`database: "disconnected"`) hoặc khi tiến trình đang dừng (`shuttingDown: true`). Healthcheck của Dockerfile/Compose dùng endpoint này; `client` chỉ khởi động khi `server` ready.
- Khi nhận `SIGTERM`/`SIGINT`: readiness chuyển 503 → ngừng nhận kết nối mới (đóng keep-alive rảnh) → chờ request đang xử lý → chờ tác vụ nền đã đăng ký (email xác nhận/hủy) → `prisma.$disconnect()`. Toàn bộ dùng chung hạn `SHUTDOWN_TIMEOUT_MS` (mặc định 20000, giới hạn 1000–120000); quá hạn thì đóng kết nối còn lại và thoát mã 1.
- Compose chạy `exec node dist/server.js` để Node là PID 1 và nhận được tín hiệu; `stop_grace_period: 30s` phải lớn hơn `SHUTDOWN_TIMEOUT_MS`.

## 3. Quy trình phát hành

1. **Điều kiện:** PR đã merge với CI xanh (`quality`, `browser-e2e`, `docker-build`, `secret-scan`). Ghi lại commit SHA sẽ triển khai.
2. **Sao lưu trước migration** (bắt buộc với mọi bản có thư mục migration mới):

   ```bash
   mkdir -p backups
   docker compose exec -T db sh -c \
     'exec mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF \
      -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > "backups/cospace-$(date +%Y%m%d-%H%M%S).sql"
   sha256sum backups/cospace-*.sql | tail -1
   ```

   Kiểm tra file khác rỗng và kết thúc bằng dòng `-- Dump completed`. Sao chép ra ngoài host (kho lưu trữ có mã hóa); không commit file dump.

   - **Lưu ý migration CWB-76 (`20261107140000_cwb76_room_unique_name`):** Trước khi deploy, kiểm tra phòng trùng tên trong database:
     ```bash
     docker compose exec -T db mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" \
       -e "SELECT name, COUNT(*) AS count FROM rooms GROUP BY name HAVING count > 1;"
     ```
     Nếu có kết quả trả về, thực hiện đổi tên các phòng trùng lặp (ví dụ nối thêm hậu tố phân biệt) trước khi chạy `prisma migrate deploy` để tránh MySQL văng lỗi `ERROR 1062 (23000): Duplicate entry` làm gián đoạn triển khai.

   - **Lưu ý migration CWB-87 (`20261109150000_cwb87_email_verification`):**
     Migration thêm cột `email_verified_at` vào bảng `users` (mặc định NULL cho tài khoản đăng ký mới) và tự động chạy câu lệnh backfill:
     ```sql
     UPDATE `users` SET `email_verified_at` = CURRENT_TIMESTAMP(3);
     ```
     để toàn bộ tài khoản legacy hiện có không bị gián đoạn quyền đặt phòng. Đồng thời migration tạo bảng `email_verification_tokens`, bổ sung giá trị `EMAIL_VERIFICATION` vào enum `EmailOutboxKind`, và nới lỏng cột `booking_id` trong `email_outbox` sang nullable cùng khóa ngoại `user_id` liên kết `users(id)`. Không yêu cầu can thiệp thủ công trước khi deploy.

3. **Triển khai:**

   ```bash
   git fetch && git checkout <commit-sha>
   docker compose build
   docker compose up -d
   docker compose ps          # server/client phải ở trạng thái healthy
   ```

   Container `server` tự chạy `npm run db:deploy` (chỉ `prisma migrate deploy`) trước khi khởi động; **không** chạy seed demo.

4. **Lần triển khai đầu:** export `ADMIN_BOOTSTRAP_*` trong shell rồi tạo admin bằng `docker compose exec -e ADMIN_BOOTSTRAP_EMAIL -e ADMIN_BOOTSTRAP_PASSWORD -e ADMIN_BOOTSTRAP_FULL_NAME server npm run admin:bootstrap` (thư mục làm việc của container đã là `apps/server`, thêm `--workspace` sẽ lỗi `No workspaces found`; `-e TÊN` không kèm giá trị để mật khẩu không nằm trên dòng lệnh) (xem README, CWB-59), sau đó gỡ các biến này.
5. **Smoke test sau triển khai** (dùng tài khoản thật của môi trường, không dùng dữ liệu demo):
   - `curl -fsS https://<domain>/api/v1/health` → `status: "OK"`, `database: "connected"`.
   - Đăng ký tài khoản customer mới → kiểm tra email kích hoạt → xác thực tài khoản; kiểm tra chặn đặt phòng `403 EMAIL_NOT_VERIFIED` trước khi kích hoạt và cho phép đặt phòng sau khi kích hoạt. Đăng nhập customer cũ (được backfill verified) và đăng nhập admin.
   - Tìm phòng → đặt một slot hợp lệ (nhận mã `CS-YYYYMMDD-XXXX`) → hủy khi còn ≥ 1 giờ.
   - Admin: tạo booking khách vãng lai, xác nhận thanh toán (CASH/QR), check-in/hoàn tất theo quy tắc thời gian.
   - Admin: upload ảnh phòng (≤ 5MB) qua Nginx.
   - Email: kiểm tra hộp thư nhận xác nhận/hủy; nếu SMTP lỗi, booking vẫn thành công và log chỉ ghi mã booking, không có thông tin xác thực.
6. Điền **bằng chứng phát hành** (mục 6).

## 4. Rollback

- **Chỉ code (migration tương thích ngược hoặc không có migration):** checkout commit trước đó, `docker compose build && docker compose up -d`, chạy lại smoke test.
- **Có migration không tương thích hoặc dữ liệu hỏng:** dừng ghi (`docker compose stop client server`), khôi phục DB theo mục 5 vào database mới, kiểm chứng, rồi trỏ `DB_NAME` sang database đã khôi phục (hoặc đổi tên) và khởi động lại bản code tương ứng với bản dump. Không chạy `prisma migrate reset` trên production.

## 5. Khôi phục và diễn tập restore (trên database riêng)

Luôn restore vào database **mới** trước, không ghi đè database đang chạy:

```bash
RESTORE_DB=cospace_restore_check
docker compose exec -T db sh -c \
  "exec mysql -u root -p\"\$MYSQL_ROOT_PASSWORD\" -e 'CREATE DATABASE $RESTORE_DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'"
docker compose exec -T db sh -c \
  "exec mysql -u root -p\"\$MYSQL_ROOT_PASSWORD\" $RESTORE_DB" < backups/<file>.sql
docker compose exec -T db sh -c \
  "exec mysql -u root -p\"\$MYSQL_ROOT_PASSWORD\" $RESTORE_DB -e \
   'SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS bookings FROM bookings; \
    SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1;'"
```

So sánh số lượng với database nguồn tại thời điểm sao lưu và tên migration mới nhất. Diễn tập xong thì `DROP DATABASE cospace_restore_check`. Ghi kết quả vào bằng chứng phát hành. Nên diễn tập ít nhất mỗi lần có migration mới.

## 6. Bằng chứng phát hành (mẫu)

```
Release: <commit-sha>  Ngày: <YYYY-MM-DD>  Người thực hiện: <tên>
CI: quality / browser-e2e / docker-build / secret-scan = pass (link run)
Backup: backups/<file>.sql  sha256=<...>  size=<...>
Restore drill: <db> users=<n> bookings=<n> latest_migration=<name>  OK/FAIL
Deploy: compose ps healthy  readiness=200
Smoke: auth OK | booking/cancel OK | guest+payment OK | upload OK | email OK/known issue
Known issues: <...>
```

## 7. Trạng thái kiểm chứng của thay đổi CWB-61

- Đã kiểm chứng tự động: readiness/liveness, graceful shutdown (HTTP server thật: request đang chạy hoàn tất, kết nối mới bị từ chối, quá hạn thì đóng cưỡng bức), chờ tác vụ email nền và ngắt Prisma (`apps/server/src/__tests__/graceful-shutdown.test.ts`); CI `docker-build` build cả hai image.
- **Đã kiểm chứng bằng `docker compose` (03/11/2026, commit `ed57d01`):** build image, khởi động lần đầu trên volume trống, smoke 28/28 (auth/RBAC, booking/hủy/409, khách vãng lai + thanh toán, check-in/hoàn tất, doanh thu, audit, upload qua Nginx, email qua Mailpit và khi SMTP mất kết nối), backup → restore vào database riêng khớp số liệu, dừng an toàn exit 0. Bằng chứng chi tiết và known issues: [release-evidence/2026-11-03-compose-smoke.md](release-evidence/2026-11-03-compose-smoke.md). Upload ảnh lên Cloudinary thật vẫn cần kiểm tra trên staging có tài khoản Cloudinary riêng.
