# Co-Space Working

Ứng dụng tìm kiếm và đặt phòng làm việc, hỗ trợ quản lý phòng, thanh toán, check-in và báo cáo doanh thu.

- **Khách hàng:** tìm phòng, xem lịch trống, đặt phòng, xem lịch sử và hủy đặt chỗ.
- **Quản trị viên:** quản lý phòng/ảnh, đặt phòng cho khách vãng lai, xác nhận thanh toán và theo dõi doanh thu.
- **Công nghệ:** React + TypeScript + Vite; Node.js + Express; MySQL 8 + Prisma; JWT, Cloudinary và Nodemailer.

## Chạy tại máy

Yêu cầu Node.js 20+, npm 10+ và MySQL 8. Chạy các lệnh tại thư mục gốc:

```bash
npm install
cp apps/server/.env.example apps/server/.env
```

Trong `apps/server/.env`, cấu hình `DATABASE_URL`, `JWT_SECRET` (ít nhất 32 ký tự), `CLOUDINARY_*` và `CLIENT_URL` (mặc định `http://localhost:5173`). Cấu hình `SMTP_*` nếu cần gửi email; xem các biến và chú thích trong [file mẫu](apps/server/.env.example).

Sau khi tạo database MySQL và điền cấu hình:

```bash
npm run db:generate --workspace=apps/server
npm exec --workspace=apps/server -- prisma migrate deploy
npm run dev
```

Frontend: <http://localhost:5173> · Backend: <http://localhost:5000> · Health: <http://localhost:5000/api/v1/health>.

Có thể chạy riêng bằng `npm run dev:client` hoặc `npm run dev:server`.

### Cấu hình email (CWB-44)

Backend đọc sáu biến SMTP sau; biến môi trường của tiến trình ưu tiên hơn giá trị trong dotenv:

| Biến          | Mặc định / ý nghĩa                                                         |
| ------------- | -------------------------------------------------------------------------- |
| `SMTP_HOST`   | `smtp.gmail.com` — máy chủ SMTP                                            |
| `SMTP_PORT`   | `587` — cổng SMTP                                                          |
| `SMTP_SECURE` | `false` — kết nối ban đầu không dùng TLS trực tiếp, nâng cấp bằng STARTTLS |
| `SMTP_USER`   | Tài khoản xác thực SMTP                                                    |
| `SMTP_PASS`   | Mật khẩu SMTP; với Gmail, dùng App Password                                |
| `SMTP_FROM`   | `"Co-Space Working" <no-reply@co-space.local>` — địa chỉ người gửi         |

`SMTP_*` là cấu hình chính. Các tên cũ `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM` chỉ được dùng làm fallback tương ứng khi không có `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Không có tài khoản/mật khẩu thì email bị tắt. Cấu hình SMTP không hợp lệ cũng tắt email và ghi cảnh báo an toàn; backend vẫn khởi động và xử lý booking/hủy booking. Lỗi gửi email không hoàn tác giao dịch đã lưu. Sửa cấu hình rồi khởi động lại backend để áp dụng.

Với Gmail, bật xác minh hai bước và tạo App Password cho `SMTP_PASS`; không dùng mật khẩu đăng nhập thông thường. Đặt `SMTP_FROM` thành tài khoản Gmail đã xác thực hoặc địa chỉ gửi được tài khoản đó cho phép. Giá trị mặc định `no-reply@co-space.local` chỉ là mẫu cho môi trường local. Dùng cổng `587` với `SMTP_SECURE=false` (STARTTLS), hoặc cổng `465` với `SMTP_SECURE=true` (TLS trực tiếp).

Chạy production trực tiếp bằng Node: sao chép `apps/server/.env.production.example` thành `apps/server/.env`, điền cấu hình, rồi chạy từ thư mục gốc:

```bash
npm run build --workspace=apps/server
npm run db:deploy --workspace=apps/server
npm run start --workspace=apps/server
```

Backend tự đọc `apps/server/.env`; không tự đọc `.env.production`. Với Docker Compose, dùng file `.env` ở gốc theo hướng dẫn bên dưới; Compose chuyển các biến SMTP vào container. Không đưa thông tin xác thực thật vào Git.

## Chạy bằng Docker

```bash
cp .env.production.example .env
# Điền cấu hình và thay các giá trị mẫu trong .env trước khi chạy.
docker compose up -d --build
```

Truy cập `http://localhost` (hoặc cổng `CLIENT_PORT` đã cấu hình). API ở `/api/v1`, healthcheck ở `/health`; backend không công khai cổng `5000`. Migrations được áp dụng tự động khi container backend khởi động qua `npm run db:deploy`, dùng Prisma CLI đã khóa trong dependencies của workspace server. Image mang theo cả dependencies ở gốc lẫn workspace; lệnh khởi động không tự tải Prisma phiên bản mới.

**Reverse proxy:** chạy trực tiếp giữ `TRUST_PROXY=false`, kể cả production. Compose đặt `true` để tin đúng một Nginx; Nginx ghi đè header chuyển tiếp bằng IP kết nối. Chỉ bật khi đã chặn truy cập trực tiếp backend; cần đánh giá lại nếu thêm CDN/load balancer.

**Giới hạn đăng nhập:** sau 10 lần sai liên tiếp trong 15 phút, lượt tiếp theo trả `429`; đăng nhập thành công reset bộ đếm, lỗi validation không tính. IPv6 cùng `/56` dùng chung giới hạn.

## Kiểm tra

```bash
npm run lint
npm test
npm run build
```

Các lệnh bổ sung:

```bash
npm run typecheck --workspace=apps/client
npm run typecheck:tests --workspace=apps/server
npm run format:check
```

Test tích hợp MySQL chạy bằng `npm run test:integration --workspace=apps/server`, yêu cầu `TEST_DATABASE_URL` trỏ tới database riêng có tên kết thúc bằng `_test`.

### Kiểm tra email qua SMTP local (CWB-44)

```bash
npm run test:smoke:email --workspace=apps/server
```

Yêu cầu đã cài dependencies, Docker CLI có Docker Compose và Docker daemon đang chạy; lần đầu cần tải image MySQL/Mailpit. Test dựng MySQL và Mailpit riêng biệt, chỉ dùng tài khoản/dữ liệu giả, gửi tới SMTP local và kiểm tra email booking/hủy booking. Không cần tài khoản Gmail và không gửi email qua SMTP thật. Test tự dọn tài nguyên đã tạo khi kết thúc, báo thất bại nếu Docker/Compose không sẵn sàng và không nằm trong bộ unit test thông thường.

### Kiểm tra upload ảnh qua Nginx (CWB-43)

Ảnh phòng hỗ trợ JPEG, PNG, WebP, tối đa **10 ảnh/lần**, mỗi ảnh tối đa **5 MiB** (5 × 1024 × 1024 byte). Nginx giới hạn toàn request API ở **55 MiB**, đủ cho 50 MiB ảnh cộng phần đóng gói multipart. Backend tiếp tục kiểm tra từng ảnh, số lượng, MIME và chữ ký ảnh; giới hạn proxy không thay thế các kiểm tra này. Khi đổi policy ảnh, cần điều chỉnh giới hạn proxy tương ứng.

```bash
npm run test:smoke:upload --workspace=apps/server
```

Yêu cầu Docker CLI, Docker daemon đang chạy và cổng host `5000` đang trống (dừng backend dev trước). Lần đầu Docker cần tải `nginx:1.27-alpine`; cho phép Docker truy cập backend test trên host qua `server:host-gateway`. Smoke test dùng cấu hình Nginx production nguyên bản, cổng proxy tự cấp, Express và JWT thật; repository và Cloudinary được mock nên không cần MySQL, tài khoản Cloudinary hoặc dữ liệu thật. Test tự dọn container/server khi kết thúc và báo thất bại nếu Docker không sẵn sàng; không chạy cùng bộ unit test thông thường.

Smoke test kiểm tra ảnh 1/3/5 MiB, batch 10 × 5 MiB, giới hạn từng file/số lượng/định dạng, quyền truy cập và request trên 55 MiB bị proxy chặn trước Express. Để kiểm chứng test bắt được lỗi cấu hình cũ, đặt biến môi trường `SMOKE_NGINX_CONFIG` thành đường dẫn tuyệt đối tới bản sao `nginx.conf` đã bỏ dòng `client_max_body_size 55m;`, rồi chạy lại cùng lệnh: các upload hợp lệ trên giới hạn mặc định phải thất bại. Bỏ biến này để kiểm tra cấu hình production. Không sửa cấu hình production chỉ để chạy đối chứng.

## Nâng cấp check-in (CWB-39)

Dừng tất cả backend cũ trước khi chạy migration và khởi động backend mới; không chạy song song bản cũ vì lazy evaluator cũ có thể ghi `NO_SHOW` sai. Với Docker Compose, dừng service backend trước khi rebuild/khởi động lại.

Migration lấy một mốc UTC cố định: booking đã bắt đầu tại mốc đó giữ dữ liệu lịch sử (`attendanceTrackingEnabled = false`), không tự chuyển `NO_SHOW`; ADMIN giải quyết thủ công sau giờ kết thúc. Booking chưa bắt đầu và booking mới bật theo dõi check-in. Migration không đổi trạng thái, không tạo timestamp check-in và không suy ra khách đã đến từ `PAID`. Các trạng thái lịch sử đã ghi sai trước nâng cấp cần đối soát thủ công, không được tự sửa.

Trước nâng cấp, sao lưu database theo quy trình triển khai. Chạy `npm exec --workspace=apps/server -- prisma migrate deploy`, khởi động bản mới, rồi kiểm tra luồng ADMIN check-in và detail/list/KPI. Không hạ backend về bản evaluator cũ trên database đang hoạt động.

## Nâng cấp lịch sử phòng (CWB-42)

Dừng các backend/seed cũ trước khi migration để không bỏ sót lịch sử trạng thái.
Sao lưu database theo quy trình triển khai, chạy `npm exec --workspace=apps/server -- prisma migrate deploy`
và `npm run db:generate --workspace=apps/server`, rồi khởi động backend mới. Không chạy bản cũ song song:
mọi thao tác tạo/đổi trạng thái phòng phải ghi lịch sử cùng giao dịch.

Migration bổ sung `room_status_history` và giả định trạng thái hiện tại của mỗi phòng đã áp dụng từ ngày tạo.
Những lần bảo trì trước nâng cấp chưa từng được lưu không thể khôi phục tự động; báo cáo cũ có thể thay đổi
một lần khi áp dụng định nghĩa mới. Từ nâng cấp trở đi, đổi trạng thái phòng không viết lại lịch sử đã ghi.
Xem [kế hoạch và định nghĩa CWB-42](docs/plans/cwb-42-dashboard-occupancy.md).

## Cấu trúc và tài liệu

- `apps/client/`: giao diện React, routes, hooks và API client.
- `apps/server/`: REST API, services, repositories và Prisma migrations.
- [API và luồng nghiệp vụ](docs/application-reference.md): xác thực, phân quyền, phòng, đặt chỗ và các lệnh test theo tính năng.
- [Quy tắc giao diện](apps/client/DESIGN.md) · [Thuật ngữ](GLOSSARY.md) · [Quyết định kiến trúc](docs/adr/).
