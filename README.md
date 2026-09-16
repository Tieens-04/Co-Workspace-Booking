# 🏢 Co-Space Working - Co-Workspace Booking Platform

Hệ thống quản lý và đặt chỗ làm việc (Co-Working Space Booking System) hỗ trợ tìm phòng, kiểm tra slot trống theo thời gian thực, đặt phòng chống trùng lịch và quản trị nghiệp vụ.

---

## 🛠️ Kiến Trúc Công Nghệ

Dự án được tổ chức theo mô hình **Monorepo** với `npm workspaces`:

- **Frontend (`apps/client`)**: React 19, TypeScript, Vite, Axios.
- **Backend (`apps/server`)**: Express.js, TypeScript, áp dụng **Clean Architecture** (Domain - Repository - Service - Controller).
- **Code Quality**: Prettier & ESLint cấu hình thống nhất toàn monorepo.

---

## 📋 Yêu Cầu Môi Trường

- **Node.js**: phiên bản `>= 20.x` (khuyến nghị `22.x` hoặc `24.x`)
- **npm**: phiên bản `>= 10.x`

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Cài đặt toàn bộ dependencies

Chạy lệnh duy nhất tại thư mục gốc:

```bash
npm install
```

### 2. Cấu hình biến môi trường

Tạo file `.env` cho backend:

```bash
cp apps/server/.env.example apps/server/.env
```

### 3. Khởi chạy dự án ở chế độ Development

- **Chạy cả Frontend và Backend song song (Khuyến nghị):**

  ```bash
  npm run dev
  ```
  - Backend: `http://localhost:5000` (Health Check: `http://localhost:5000/api/v1/health`)
  - Frontend: `http://localhost:5173`

- **Hoặc chạy riêng từng ứng dụng:**
  ```bash
  npm run dev:server   # Chỉ chạy Backend
  npm run dev:client   # Chỉ chạy Frontend
  ```

---

## 🔍 Kiểm Tra Chất Lượng Mã Nguồn (Lint & Format)

```bash
# Kiểm tra lỗi cú pháp và conventions bằng ESLint
npm run lint

# Chạy automated tests (Vitest)
npm test

# Tự động định dạng mã nguồn bằng Prettier
npm run format

# Kiểm tra xem code đã được format đúng chuẩn chưa
npm run format:check

# Build kiểm tra kiểu dữ liệu TypeScript (Production Build)
npm run build
```

---

## 🔐 API Xác Thực (Authentication API)

- **Đăng ký tài khoản (Customer):** `POST /api/v1/auth/register`
  - Body: `{ email, password, fullName, phoneNumber? }`
  - Mật khẩu tối thiểu 8 ký tự, tối đa 72 UTF-8 bytes. Role luôn là `CUSTOMER`.
- **Đăng nhập:** `POST /api/v1/auth/login`
  - Body: `{ email, password }`
  - Password không rỗng và tối đa 72 UTF-8 bytes; vượt giới hạn trả `400 VALIDATION_ERROR`.
  - Trả về JWT Access Token (HS256), mặc định 1 giờ, chứa `{ sub, role, iat, exp }`; `data.expiresIn` luôn khớp thời hạn token (giây).

Email, `fullName` và `phoneNumber` giới hạn 191 ký tự theo schema MySQL. Email trùng trả `409 EMAIL_ALREADY_EXISTS`; unique constraint khác trả `409 RESOURCE_CONFLICT`.

Biến môi trường cần thiết trong `apps/server/.env`:

- `JWT_SECRET`: Khóa bí mật ký JWT (bắt buộc, tối thiểu 32 ký tự).
- `JWT_EXPIRES_IN`: Số nguyên dương kèm đơn vị `s`, `m`, `h`, `d` (mặc định `1h`, ví dụ `15m`); cấu hình không hợp lệ khiến server từ chối khởi động.
- `BCRYPT_SALT_ROUNDS`: Số nguyên từ 10 đến 14 (mặc định `10`); không chấp nhận số thập phân.

### Chạy test auth

`npm test` chạy unit/API tests với repository giả lập, bcrypt/JWT thật và cấu hình test riêng; không kết nối database development. `npm run typecheck:tests --workspace=apps/server` kiểm tra TypeScript của cả test và cấu hình Vitest.

Để chạy integration tests với MySQL thật:

1. Tạo database riêng có tên kết thúc bằng `_test`, ví dụ `cospace_test`, với tài khoản MySQL chỉ có quyền trên database đó.
2. Cấu hình `TEST_DATABASE_URL` trong `apps/server/.env` hoặc environment. Không trỏ tới schema của `DATABASE_URL`.
3. Apply các migration hiện có vào test database bằng `prisma migrate deploy` với `DATABASE_URL` của riêng tiến trình đó trỏ đến test database; không thay đổi URL development đã lưu.
4. Chạy `npm run test:integration --workspace=apps/server`.

Integration tests từ chối chạy nếu thiếu URL hoặc dùng schema không hợp lệ/trùng schema development. Cleanup chỉ nhắm các email có UUID của lần chạy hiện tại; không xóa dữ liệu cũ bằng điều kiện chứa `test_`.

---

## 🛡️ Middleware Xác Thực & Phân Quyền Route (Auth & RBAC Middleware)

Hệ thống bảo vệ các endpoint nội bộ thông qua middleware xác thực JWT `verifyToken` và phân quyền dựa trên vai trò `checkRole`.

### 1. Chuẩn gửi Token

Client gửi Access Token qua HTTP header:

```http
Authorization: Bearer <access_token>
```

- **Scheme Bearer:** Không phân biệt chữ hoa/thường (`Bearer`, `bearer`, `BEARER` đều hợp lệ); giá trị token được giữ nguyên.
- **Thuật toán & chữ ký:** Chỉ chấp nhận JWT sử dụng thuật toán `HS256`, chữ ký khớp với `JWT_SECRET` và token chưa hết hạn.
- **Payload tối thiểu:** Token được kiểm tra runtime bắt buộc phải có `sub` (chuỗi ID không rỗng), `role` (`CUSTOMER` hoặc `ADMIN` theo enum Prisma), và `exp` (thời điểm hết hạn hợp lệ).
- **Principal:** Middleware chỉ trích xuất và gán `{ sub, role }` vào `req.user`. Không nhận identity hay role từ request body/query để ngăn chặn tấn công giả mạo quyền hạn (privilege escalation).

### 2. Bảng Phân Quyền Tuyến Đường

| Nhóm Route        | Middleware Áp Dụng                        |  CUSTOMER  | ADMIN | Không Có Token |
| ----------------- | ----------------------------------------- | :--------: | :---: | :------------: |
| `/api/v1/auth/*`  | Không (Public)                            |     ✅     |  ✅   |       ✅       |
| `/api/v1/health`  | Không (Public)                            |     ✅     |  ✅   |       ✅       |
| `/api/v1/me/*`    | `verifyToken`                             |     ✅     |  ✅   |   ❌ (`401`)   |
| `/api/v1/admin/*` | `verifyToken` → `checkRole([Role.ADMIN])` | ❌ (`403`) |  ✅   |   ❌ (`401`)   |

> **Lưu ý về endpoint placeholder:** Nhóm `/api/v1/admin` và `/api/v1/me` hiện tại đã được dựng router và gắn middleware bảo vệ, nhưng chưa có endpoint nghiệp vụ cụ thể. Khi gửi request có quyền hợp lệ, hệ thống sẽ trả về mã `404 Not Found`.

### 3. Quy Ước Mã Lỗi Xác Thực & Phân Quyền

Tất cả các lỗi trả về theo chuẩn JSON nhất quán:

- **`401 UNAUTHORIZED`:** Xảy ra khi thiếu header `Authorization`, header sai định dạng Bearer, payload JWT không phải JSON hợp lệ, token sai chữ ký, token hết hạn, bị tamper hoặc thiếu các claims hợp lệ (`sub`, `role`, `exp`).
  ```json
  {
    "success": false,
    "code": "UNAUTHORIZED",
    "message": "Token không hợp lệ hoặc đã hết hạn"
  }
  ```
- **`403 FORBIDDEN`:** Xảy ra khi người dùng đã xác thực thành công nhưng không có quyền truy cập route yêu cầu (ví dụ: tài khoản `CUSTOMER` truy cập nhóm `/api/v1/admin` hoặc `checkRole` với danh sách quyền rỗng).
  ```json
  {
    "success": false,
    "code": "FORBIDDEN",
    "message": "Bạn không có quyền thực hiện thao tác này"
  }
  ```

### 4. Hướng Dẫn Gắn Tuyến Đường Nghiệp Vụ Mới

Khi xây dựng các tính năng tiếp theo (booking, quản lý phòng, profile), chỉ cần khai báo handler và gắn vào router tương ứng:

- **Tuyến đường Admin:** Khai báo trong `apps/server/src/routes/admin.route.ts` (đã được bọc tự động bởi `verifyToken` và `checkRole([Role.ADMIN])`).
- **Tuyến đường cá nhân (Customer/Admin):** Khai báo trong `apps/server/src/routes/me.route.ts` (đã được bọc tự động bởi `verifyToken`). Đối với tài nguyên cá nhân (như booking), service layer chịu trách nhiệm kiểm tra ownership (`resource.userId === req.user.sub`).

---

## 📁 Cấu Trúc Thư Mục Backend (Clean Architecture)

```text
apps/server/src/
├── config/          # Cấu hình môi trường, hằng số hệ thống
├── domain/          # Entities & Business Models độc lập
├── repositories/    # Data Access Layer (Prisma ORM query)
├── services/        # Business Logic & Use Cases (Quy tắc đặt cọc, tính tiền, overlap)
├── controllers/     # HTTP Request Handlers (Nhận request và phản hồi)
├── routes/          # Định tuyến API (/api/v1/...)
├── middlewares/     # JWT Authentication, RBAC, Validate input, Error handling
└── utils/           # Response formatters, logger, helper functions
```
