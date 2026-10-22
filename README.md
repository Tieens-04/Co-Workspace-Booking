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

## Chạy bằng Docker

```bash
cp .env.production.example .env
# Điền cấu hình và thay các giá trị mẫu trong .env trước khi chạy.
docker compose up -d --build
```

Truy cập `http://localhost` (hoặc cổng `CLIENT_PORT` đã cấu hình). API ở `/api/v1`, healthcheck ở `/health`; backend không công khai cổng `5000`. Migrations được áp dụng tự động khi container backend khởi động.

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

## Cấu trúc và tài liệu

- `apps/client/`: giao diện React, routes, hooks và API client.
- `apps/server/`: REST API, services, repositories và Prisma migrations.
- [API và luồng nghiệp vụ](docs/application-reference.md): xác thực, phân quyền, phòng, đặt chỗ và các lệnh test theo tính năng.
- [Quy tắc giao diện](apps/client/DESIGN.md) · [Thuật ngữ](GLOSSARY.md) · [Quyết định kiến trúc](docs/adr/).
