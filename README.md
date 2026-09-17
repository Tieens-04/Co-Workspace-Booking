# 🏢 Co-Space Working - Co-Workspace Booking Platform

Hệ thống quản lý và đặt chỗ làm việc (Co-Working Space Booking System) hỗ trợ tìm phòng, kiểm tra slot trống theo thời gian thực, đặt phòng chống trùng lịch và quản trị nghiệp vụ.

---

## 🛠️ Kiến Trúc Công Nghệ

Dự án được tổ chức theo mô hình **Monorepo** với `npm workspaces`:

- **Frontend (`apps/client`)**: React 19, TypeScript, Vite, React Router v7, Zod v4, Axios, Vitest, React Testing Library.
- **Backend (`apps/server`)**: Express.js, TypeScript, áp dụng **Clean Architecture** (Domain - Repository - Service - Controller), Prisma ORM, MySQL 8.
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

## 🔍 Kiểm Tra Chất Lượng Mã Nguồn (Lint, Test & Build)

```bash
# Kiểm tra lỗi cú pháp và conventions bằng ESLint toàn bộ workspaces
npm run lint

# Chạy toàn bộ automated tests (Vitest) cho cả Client và Server
npm test

# Chạy riêng biệt từng ứng dụng:
npm run test --workspace=apps/client  # Unit & integration tests frontend
npm run test --workspace=apps/server  # Unit & API tests backend

# Kiểm tra kiểu dữ liệu TypeScript (Typecheck):
npm run typecheck --workspace=apps/client
npm run typecheck:tests --workspace=apps/server

# Tự động định dạng mã nguồn bằng Prettier
npm run format

# Kiểm tra xem code đã được format đúng chuẩn chưa
npm run format:check

# Build kiểm tra kiểu dữ liệu TypeScript và đóng gói ứng dụng (Production Build)
npm run build
```

---

## 🌐 Giao Diện & Xác Thực Phía Client (Frontend Auth, Navigation & Session)

Ứng dụng React tại `apps/client` quản lý định tuyến bằng **React Router v7**, xác thực và phân quyền RBAC dựa trên JWT, giao diện thuần CSS với bảng màu xanh/xám nhất quán, và hỗ trợ đa thiết bị cùng các tiêu chuẩn trợ năng (a11y).

### 1. Bảng Định Tuyến Tuyến Đường (Client Routes & Access Rules)

| Tuyến đường    | Nội dung & Quyền truy cập                                                                                                                           | Hành vi điều hướng & Quy tắc hiển thị                                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/login`       | Form đăng nhập (Email, mật khẩu, nút ẩn/hiện mật khẩu, liên kết đăng ký).                                                                           | Người dùng đã đăng nhập tự động chuyển về trang đích theo role (`CUSTOMER` → `/`, `ADMIN` → `/admin`). Điền sẵn email và hiển thị thông báo thành công nếu nhận state từ trang Đăng ký.                      |
| `/register`    | Form đăng ký tài khoản khách hàng (`fullName`, `email`, `phoneNumber` tùy chọn, `password`, `confirmPassword`, nút ẩn/hiện mật khẩu).               | Người dùng đã đăng nhập tự chuyển về trang đích theo role. Đăng ký thành công → `/login` kèm email điền sẵn và banner thông báo thành công (chưa cấp phiên).                                                 |
| `/`            | Trang chào công khai: hiển thị trạng thái đăng nhập, nút Đăng xuất, liên kết Quản trị (nếu là `ADMIN`), và kiểm tra kết nối Backend (Health Check). | Truy cập công khai cho cả khách vãng lai và người dùng đã đăng nhập.                                                                                                                                         |
| `/admin`       | Trang quản trị tối thiểu nghiệm thu quyền hạn, chỉ dành cho vai trò `ADMIN`, có nút Đăng xuất.                                                      | Khách chưa đăng nhập → chuyển hướng sang `/login` (lưu vị trí `from`). Tài khoản `CUSTOMER` truy cập → hiển thị giao diện **403 - Không có quyền truy cập**, không tự đăng xuất và không chuyển hướng login. |
| Đường dẫn khác | Giao diện 404 Not Found thân thiện.                                                                                                                 | Cung cấp liên kết đưa người dùng quay trở về trang chủ `/`.                                                                                                                                                  |

### 2. Quản Lý Phiên Làm Việc (Session Storage & Lifecycle)

- **Lưu trữ Token:** JWT Access Token được lưu trữ tại `localStorage` dưới khóa định danh `cospace.accessToken`. Hệ thống **tuyệt đối không lưu mật khẩu** hay thông tin nhạy cảm ở client.
- **Đọc phiên khi tải lại trang (Reload):** Ứng dụng giải mã an toàn các claims `sub`, `role`, `exp` từ payload JWT để hiển thị thông tin và định hướng route. Nếu token bị rỗng, hỏng cấu trúc, thiếu claim bắt buộc hoặc đã quá hạn (`exp * 1000 <= Date.now()`), token sẽ bị xóa khỏi `localStorage` và chuyển về trạng thái chưa đăng nhập.
- **Tự động hủy phiên theo thời gian:** Hệ thống tự động thiết lập bộ đếm thời gian (`setTimeout`) dựa trên thời điểm hết hạn `exp`. Khi phiên hết hiệu lực, ứng dụng tự động đăng xuất và thông báo cho người dùng.
- **Đồng bộ đa tab (Multi-tab Synchronization):** Thông qua sự kiện `window.addEventListener('storage')`, nếu người dùng thực hiện đăng xuất hoặc phiên bị thay đổi ở một tab khác, tất cả các tab đang mở sẽ ngay lập tức đồng bộ trạng thái đăng xuất.

### 3. Tích Hợp API & Axios Interceptor

Tất cả các lệnh gọi API được đóng gói qua `apiClient` tại `apps/client/src/services/api.ts` và module `authApi` tại `apps/client/src/services/auth.api.ts`:

- **Request Interceptor:** Tự động đính kèm header `Authorization: Bearer <token>` nếu có token trong `localStorage`. Tự động bỏ qua việc gắn token đối với các endpoint xác thực công khai (`/auth/login`, `/auth/register`).
- **Response Interceptor:**
  - Bắt mã lỗi `401 Unauthorized`:
    - Nếu là request đến `/auth/login`: Giữ nguyên dữ liệu và hiển thị lỗi _"Email hoặc mật khẩu không chính xác"_ ngay tại form.
    - Nếu là request từ API nghiệp vụ có token: Kiểm tra token gửi đi có khớp với token phiên hiện tại hay không. Nếu khớp, xóa token trong `localStorage` và chuyển người dùng về `/login` với thông báo hết phiên làm việc.
    - **Chống race condition phiên cũ:** Phản hồi `401` đến muộn từ request mang token cũ sẽ bị bỏ qua và không xóa token của phiên đăng nhập mới.
  - Mã lỗi `403 Forbidden`: Giữ nguyên phiên làm việc, không tự động đăng xuất.

### 4. Yêu Cầu Cấu Hình SPA Fallback Khi Triển Khai (Production Deployment)

Vì ứng dụng sử dụng React Router với HTML5 History API (`BrowserRouter`), các yêu cầu HTTP truy cập trực tiếp hoặc khi người dùng refresh tại các đường dẫn như `/login`, `/register`, `/admin` cần phải được máy chủ web phục vụ file `index.html`.

- **Nginx:**
  ```nginx
  location / {
      try_files $uri $uri/ /index.html;
  }
  ```
- **Apache (.htaccess):**
  ```apache
  <IfModule mod_rewrite.c>
      RewriteEngine On
      RewriteBase /
      RewriteRule ^index\.html$ - [L]
      RewriteCond %{REQUEST_FILENAME} !-f
      RewriteCond %{REQUEST_FILENAME} !-d
      RewriteRule . /index.html [L]
  </IfModule>
  ```
- **Vercel / Netlify:** Đã có cấu hình mặc định hoặc thêm file `vercel.json` / `_redirects` (`/* /index.html 200`).

### 5. Đánh Giá Bảo Mật & Giới Hạn Của `localStorage`

- **Rủi ro XSS (Cross-Site Scripting):** Dữ liệu trong `localStorage` có thể bị truy cập bởi bất kỳ mã JavaScript nào thực thi trên cùng domain. Nếu ứng dụng có lỗ hổng XSS (chèn mã độc qua thư viện bên thứ ba hoặc nội dung chưa được khử khuẩn), mã độc có thể đánh cắp Access Token.
- **Khuyến nghị cho môi trường Production cao cấp:**
  1. Với các hệ thống yêu cầu bảo mật cao (như thanh toán, dữ liệu nhạy cảm), giải pháp tốt nhất là lưu JWT trong **`httpOnly`, `Secure`, `SameSite=Strict` Cookies**. Cookie `httpOnly` hoàn toàn không thể đọc bằng JavaScript phía client, qua đó vô hiệu hóa nguy cơ đánh cắp token qua XSS.
  2. Triển khai cơ chế **Refresh Token Rotation** (kết hợp Access Token ngắn hạn ~15 phút và Refresh Token trong cookie) để giảm thiểu tối đa cửa sổ rủi ro.
  3. Áp dụng Content Security Policy (CSP) chặt chẽ để ngăn chặn việc nạp script tùy tiện.

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

## 🚪 API Danh Sách & Chi Tiết Phòng (Room API)

Cung cấp các endpoint công khai (không cần xác thực) phục vụ tìm kiếm, lọc và xem chi tiết phòng làm việc.

### 1. Danh sách phòng: `GET /api/v1/rooms`

Hỗ trợ phân trang và bộ lọc linh hoạt:

- **Query Parameters**:
  - `page` (tùy chọn): Số nguyên dương $\ge 1$, mặc định `1`; request tạo offset vượt giới hạn cơ sở dữ liệu sẽ bị từ chối.
  - `limit` (tùy chọn): Số nguyên từ `1` đến `100`, mặc định `10`.
  - `capacity` (tùy chọn): Sức chứa tối thiểu (lọc `capacity >= value`), trong phạm vi số nguyên của cột dữ liệu.
  - `minPrice` (tùy chọn): Giá theo giờ tối thiểu (không âm, inclusive), tối đa 2 chữ số thập phân.
  - `maxPrice` (tùy chọn): Giá theo giờ tối đa (không âm, inclusive), tối đa 2 chữ số thập phân. Giá phải nằm trong phạm vi `DECIMAL(10,2)`; `minPrice > maxPrice` sẽ trả về `400 VALIDATION_ERROR`.
  - `amenityIds` (tùy chọn): Chuỗi danh sách UUID phân cách bằng dấu phẩy (ví dụ `uuid1,uuid2`). Tự động chuẩn hóa khoảng trắng và loại bỏ ID trùng lặp.
- **Quy tắc lọc tiện ích (Amenity ALL Semantics)**:
  - Phòng phải sở hữu **tất cả** các tiện ích trong `amenityIds` mới xuất hiện trong kết quả. Phòng chỉ có một phần hoặc không có tiện ích nào sẽ bị loại trừ.
  - UUID hợp lệ nhưng không tồn tại trong hệ thống sẽ trả về danh sách rỗng (`total: 0`), không báo lỗi.
- **Kiểm tra đầu vào (Strict Query Whitelisting)**:
  - Bất kỳ query parameter nào không nằm trong danh sách cho phép (ví dụ `sort`, `order`) hoặc sai định dạng sẽ bị từ chối ngay lập tức với `400 VALIDATION_ERROR` trước khi truy cập cơ sở dữ liệu.
- **Phân trang & Ảnh bìa (Pagination & Cover Fallback)**:
  - `data.pagination`: Chứa `{ page, limit, total, totalPages }`. Trang vượt quá phạm vi dữ liệu sẽ trả danh sách `items: []` rỗng kèm metadata, không báo lỗi.
  - `coverImage`: Lấy ảnh primary đầu tiên; nếu phòng không có ảnh primary thì lấy ảnh đầu tiên theo thứ tự tạo (`createdAt/id`); nếu phòng không có ảnh nào thì trả về `null`.
  - `pricePerHour`: Luôn được định dạng chuỗi số thập phân 2 chữ số (ví dụ `"180000.00"`).
  - Sắp xếp mặc định: Cố định theo `createdAt DESC`, sau đó `id ASC`.

**Ví dụ phản hồi `200 OK`:**

```json
{
  "success": true,
  "message": "Lấy danh sách phòng thành công",
  "data": {
    "items": [
      {
        "id": "c1f72922-38ef-46c5-9276-88b1424df94a",
        "name": "Meeting Room Creative 4P",
        "capacity": 4,
        "pricePerHour": "180000.00",
        "status": "AVAILABLE",
        "coverImage": "https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=800",
        "amenities": [
          {
            "id": "e89d5334-a1a7-47b7-b0a6-21822a76f2f3",
            "name": "High-Speed Wi-Fi",
            "icon": "wifi",
            "description": "Kết nối Internet cáp quang tốc độ cao 300Mbps"
          },
          {
            "id": "f51a4413-4357-4183-93d3-13e77864f7b2",
            "name": "Monitor 4K",
            "icon": "monitor",
            "description": "Màn hình Dell UltraSharp 27 inch 4K Type-C"
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

### 2. Chi tiết phòng: `GET /api/v1/rooms/:id`

- **Path Parameters**:
  - `id`: UUID hợp lệ của phòng. Nếu không đúng định dạng UUID, trả `400 VALIDATION_ERROR`.
- **Hành vi & Dữ liệu trả về**:
  - Trả về thông tin chi tiết: `id`, `name`, `description`, `capacity`, `pricePerHour`, `status`, toàn bộ `images` và toàn bộ `amenities`.
  - Trong `images`: Ảnh primary được xếp lên đầu tiên.
  - Trong `amenities`: Được sắp xếp theo thứ tự bảng chữ cái của tên tiện ích (`name ASC`).
  - **Bảo mật dữ liệu**: Không làm lộ `publicId` (Cloudinary) hoặc dữ liệu bảng nối trung gian (`roomId`, `amenityId`).
  - Khi `id` hợp lệ nhưng phòng không tồn tại trong hệ thống: Trả về mã lỗi `404 ROOM_NOT_FOUND`.

**Ví dụ phản hồi `200 OK`:**

```json
{
  "success": true,
  "message": "Lấy thông tin chi tiết phòng thành công",
  "data": {
    "id": "c1f72922-38ef-46c5-9276-88b1424df94a",
    "name": "Meeting Room Creative 4P",
    "description": "Phòng họp nhóm 4 người với bàn tròn thảo luận, bảng viết kích thước lớn và màn hình trình chiếu.",
    "capacity": 4,
    "pricePerHour": "180000.00",
    "status": "AVAILABLE",
    "images": [
      {
        "id": "2b6b553e-53c8-4712-b06c-31fb8442a8b3",
        "imageUrl": "https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=800",
        "isPrimary": true
      },
      {
        "id": "8b9e69c1-8ce2-473d-82d2-8a90ecbb34d5",
        "imageUrl": "https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800",
        "isPrimary": false
      }
    ],
    "amenities": [
      {
        "id": "e89d5334-a1a7-47b7-b0a6-21822a76f2f3",
        "name": "High-Speed Wi-Fi",
        "icon": "wifi",
        "description": "Kết nối Internet cáp quang tốc độ cao 300Mbps"
      },
      {
        "id": "f51a4413-4357-4183-93d3-13e77864f7b2",
        "name": "Monitor 4K",
        "icon": "monitor",
        "description": "Màn hình Dell UltraSharp 27 inch 4K Type-C"
      }
    ]
  }
}
```

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
| `/api/v1/rooms/*` | Không (Public)                            |     ✅     |  ✅   |       ✅       |
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
