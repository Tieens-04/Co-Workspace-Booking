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

Cấu hình các biến môi trường cần thiết trong `apps/server/.env`:

- `PORT`: Cổng máy chủ backend (mặc định `5000`).
- `DATABASE_URL`: Chuỗi kết nối MySQL (Prisma ORM).
- `JWT_SECRET`: Khóa bí mật ký xác thực JWT (tối thiểu 32 ký tự).
- `JWT_EXPIRES_IN`: Thời gian sống của Access Token (ví dụ `1d`, `15m`).
- `CLIENT_ORIGIN`: URL frontend được phép truy cập CORS (ví dụ `http://localhost:5173`).
- `CLOUDINARY_CLOUD_NAME`: Tên cloud tài khoản Cloudinary lưu trữ ảnh phòng.
- `CLOUDINARY_API_KEY`: API Key truy cập Cloudinary API.
- `CLOUDINARY_API_SECRET`: API Secret xác thực Cloudinary API.

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

| Tuyến đường             | Nội dung & Quyền truy cập                                                                                                                                                                | Hành vi điều hướng & Quy tắc hiển thị                                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                | Form đăng nhập (Email, mật khẩu, nút ẩn/hiện mật khẩu, liên kết đăng ký).                                                                                                                | Người dùng đã đăng nhập tự động chuyển về trang đích theo role (`CUSTOMER` → `/`, `ADMIN` → `/admin`). Điền sẵn email và hiển thị thông báo thành công nếu nhận state từ trang Đăng ký. Hỗ trợ quay lại trang phòng an toàn (`/rooms/:id`) nếu có `state.from`. |
| `/register`             | Form đăng ký tài khoản khách hàng (`fullName`, `email`, `phoneNumber` tùy chọn, `password`, `confirmPassword`, nút ẩn/hiện mật khẩu).                                                    | Người dùng đã đăng nhập tự chuyển về trang đích theo role. Đăng ký thành công → `/login` kèm email điền sẵn và banner thông báo thành công (chưa cấp phiên).                                                                                                    |
| `/`                     | Trang chào công khai: hiển thị trạng thái đăng nhập, nút Đăng xuất, liên kết Quản trị (nếu là `ADMIN`), và kiểm tra kết nối Backend (Health Check).                                      | Truy cập công khai cho cả khách vãng lai và người dùng đã đăng nhập.                                                                                                                                                                                            |
| `/admin`                | Trang quản trị phòng làm việc dành cho vai trò `ADMIN`: danh sách phòng phân trang, xem tiện ích/ảnh, form inline tạo và chỉnh sửa phòng dùng chung, quản lý danh sách URL ảnh thủ công. | Khách chưa đăng nhập → chuyển hướng sang `/login` (lưu vị trí `from`). Tài khoản `CUSTOMER` truy cập → hiển thị giao diện **403 - Không có quyền truy cập**, không tự đăng xuất và không chuyển hướng login.                                                    |
| `/booking-confirmation` | Màn hình xác nhận đặt phòng thành công: hiển thị mã đặt phòng, thông tin phòng, thời gian, trạng thái và hướng dẫn thanh toán tại quầy.                                                  | Nhận dữ liệu đặt phòng qua router state sau khi tạo thành công. Truy cập trực tiếp không có state sẽ hiển thị giao diện fallback thông báo thân thiện và nút quay lại danh sách phòng.                                                                          |
| Đường dẫn khác          | Giao diện 404 Not Found thân thiện.                                                                                                                                                      | Cung cấp liên kết đưa người dùng quay trở về trang chủ `/`.                                                                                                                                                                                                     |

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

### 3. Kiểm tra lịch trống của phòng: `GET /api/v1/rooms/:id/availability`

- **Quyền truy cập**: Công khai (không yêu cầu xác thực).
- **Path Parameters**:
  - `id`: UUID hợp lệ của phòng. Nếu không đúng định dạng UUID, trả `400 VALIDATION_ERROR`.
- **Query Parameters**:
  - `date` (bắt buộc): Chuỗi ngày theo định dạng `YYYY-MM-DD`. Bắt buộc phải là ngày lịch thực tế hợp lệ (bao gồm kiểm tra năm nhuận). Bất kỳ query parameter nào ngoài danh sách cho phép đều bị từ chối với `400 VALIDATION_ERROR`.
- **Hành vi & Dữ liệu trả về**:
  - Trả về danh sách **48 slot 30 phút liên tiếp**, bao phủ trọn vẹn 24 giờ của ngày yêu cầu theo múi giờ nghiệp vụ `Asia/Ho_Chi_Minh` (`+07:00`) từ `00:00` đến `24:00` (ngày kế tiếp).
  - Trạng thái từng slot là `AVAILABLE` hoặc `BOOKED`.
  - **Ý nghĩa trạng thái**: Trạng thái `AVAILABLE` thể hiện slot hiện tại chưa có booking blocking tại thời điểm truy vấn. Trạng thái này không đóng vai trò khóa giữ chỗ (lock/reservation) và không đồng nghĩa với việc một slot 30 phút đơn lẻ có thể tạo booking độc lập (các quy tắc nghiệp vụ khi đặt phòng như thời lượng tối thiểu 1 giờ, tối đa 8 giờ, lead time tối thiểu 30 phút vẫn do API tạo booking kiểm soát và quyết định).
  - **Thuật toán Overlap**: Một slot mang trạng thái `BOOKED` khi tồn tại booking có trạng thái thuộc danh sách chặn (`CONFIRMED`) giao với slot:
    $$\text{existing.startTime} < \text{slot.endTime} \quad\land\quad \text{existing.endTime} > \text{slot.startTime}$$
  - **Quy tắc chạm biên (Boundary Touching)**: Không bị tính là trùng lặp. Ví dụ booking kết thúc lúc `10:00` và slot bắt đầu lúc `10:00` thì slot đó vẫn là `AVAILABLE`.
  - Các booking có trạng thái khác (`CANCELLED`, `COMPLETED`, `NO_SHOW`) hoặc booking của phòng khác không làm ảnh hưởng trạng thái slot.
  - **Bảo mật dữ liệu**: API chỉ trả về mảng slot với mốc thời gian ISO 8601 UTC và trạng thái, không làm lộ bất kỳ thông tin cá nhân, mã đặt chỗ hay định danh booking nào.
- **Xử lý lỗi**:
  - `400 VALIDATION_ERROR`: Thiếu `date`, sai định dạng `YYYY-MM-DD`, ngày không hợp lệ trên lịch (ví dụ `2026-02-29`, `2026-04-31`), ID phòng không phải UUID, hoặc truyền tham số truy vấn ngoài danh sách.
  - `404 ROOM_NOT_FOUND`: Phòng không tồn tại trong hệ thống.
  - `409 ROOM_NOT_AVAILABLE`: Phòng đang ở trạng thái bảo trì (`MAINTENANCE`).

**Ví dụ phản hồi `200 OK`:**

```json
{
  "success": true,
  "message": "Lấy thông tin lịch trống của phòng thành công",
  "data": {
    "roomId": "c1f72922-38ef-46c5-9276-88b1424df94a",
    "date": "2026-09-21",
    "timezone": "Asia/Ho_Chi_Minh",
    "slots": [
      {
        "startTime": "2026-09-20T17:00:00.000Z",
        "endTime": "2026-09-20T17:30:00.000Z",
        "status": "AVAILABLE"
      },
      {
        "startTime": "2026-09-20T17:30:00.000Z",
        "endTime": "2026-09-20T18:00:00.000Z",
        "status": "AVAILABLE"
      }
    ]
  }
}
```

### 4. Danh mục tiện ích: `GET /api/v1/amenities`

- **Quyền truy cập**: Công khai (không yêu cầu xác thực).
- **Tham số truy vấn (Query Parameters)**: Không nhận bất kỳ query parameter nào. Bất kỳ query parameter nào được truyền vào đều bị từ chối với `400 VALIDATION_ERROR`.
- **Hành vi & Dữ liệu trả về**:
  - Trả về toàn bộ danh mục tiện ích công khai trong hệ thống để phục vụ bộ lọc tìm kiếm.
  - Danh sách được sắp xếp theo tên tăng dần (`name ASC`).
  - Chỉ bao gồm các trường: `id`, `name`, `icon`, `description`. Không làm lộ các trường nội bộ như `createdAt`, `updatedAt` hay quan hệ dữ liệu.

**Ví dụ phản hồi `200 OK`:**

```json
{
  "success": true,
  "message": "Lấy danh sách tiện ích thành công",
  "data": [
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
```

---

## 🏢 API Quản Trị Phòng (Admin Room API)

Các endpoint dành riêng cho vai trò `ADMIN` phục vụ quản trị danh sách, tạo mới và cập nhật thông tin phòng làm việc. Toàn bộ endpoint được bảo vệ bởi middleware `verifyToken` và `checkRole([Role.ADMIN])`.

### 1. Danh sách phòng quản trị: `GET /api/v1/admin/rooms`

- **Quyền truy cập**: Bắt buộc đăng nhập với vai trò `ADMIN`. Không có token trả về `401 UNAUTHORIZED`; vai trò `CUSTOMER` trả về `403 FORBIDDEN`.
- **Query Parameters**: Tái sử dụng query schema của danh sách công khai (`page`, `limit`, `capacity`, `minPrice`, `maxPrice`, `amenityIds`).
- **Phản hồi**: `200 OK` kèm danh sách phòng, phân trang và thông tin trạng thái đầy đủ.

### 2. Tạo phòng mới: `POST /api/v1/admin/rooms`

- **Quyền truy cập**: `ADMIN`.
- **Payload Request (`application/json`)**:
  - `name` (bắt buộc): Chuỗi ký tự từ 1 đến 191 ký tự (được trim khoảng trắng).
  - `description` (tùy chọn): Chuỗi mô tả phòng; chuỗi rỗng được chuẩn hóa thành `null`.
  - `capacity` (bắt buộc): Số nguyên dương $\ge 1$ và $\le 2,147,483,647$ (MySQL `INT`).
  - `pricePerHour` (bắt buộc): Số hoặc chuỗi số thập phân không âm với tối đa 2 chữ số thập phân, không vượt quá giới hạn `DECIMAL(10,2)` (`99,999,999.99`). Chuẩn hóa thành chuỗi 2 chữ số thập phân khi lưu và trả về.
  - `amenityIds` (tùy chọn, mặc định `[]`): Mảng UUID tiện ích không trùng lặp. Toàn bộ tiện ích phải tồn tại trong cơ sở dữ liệu.
  - `images` (tùy chọn, mặc định `[]`): Mảng các đối tượng `{ imageUrl, isPrimary }`. `imageUrl` là URL HTTP/HTTPS hợp lệ $\le 500$ ký tự, không trùng lặp URL. Nếu mảng có phần tử, bắt buộc phải có **đúng 1 ảnh** có `isPrimary: true`. Phòng không có ảnh (`images: []`) vẫn hợp lệ.
  - _Chặn Mass Assignment_: Schema sử dụng `.strict()`, từ chối bất kỳ trường lạ nào như `status`, `id`, `createdAt`, `updatedAt`. Phòng mới tạo luôn có trạng thái mặc định là `AVAILABLE`.
- **Transaction & Đồng bộ dữ liệu**:
  - Thực thi trong một Database Transaction duy nhất.
  - Kiểm tra tính tồn tại của tất cả tiện ích trong `amenityIds`; nếu thiếu ID ném lỗi `400 INVALID_AMENITY_IDS` kèm danh sách `missingIds` và rollback toàn bộ.
  - Lưu ảnh URL thủ công với `public_id = null`.
- **Phản hồi `201 Created`**: Trả về `RoomDetail` hoàn chỉnh.

### 3. Cập nhật một phần phòng: `PATCH /api/v1/admin/rooms/:id`

- **Quyền truy cập**: `ADMIN`.
- **Path Parameter**: `id` là UUID hợp lệ của phòng.
- **Payload Request (`application/json`)**:
  - Chấp nhận các trường tùy chọn: `name`, `description`, `capacity`, `pricePerHour`, `amenityIds`, `images`, `status`, `acknowledgeFutureBookings`.
  - Từ chối body rỗng (`{}`) với `400 VALIDATION_ERROR`.
  - `status` (tùy chọn): Trạng thái phòng (`AVAILABLE` hoặc `MAINTENANCE`).
  - `acknowledgeFutureBookings` (tùy chọn, boolean, mặc định `false`): Cờ xác nhận của Admin cho phép chuyển sang `MAINTENANCE` khi phòng có lịch đặt trước trong tương lai.
  - Quy tắc Partial Update & Quan hệ:
    - Các trường scalar hoặc relation bị bỏ qua (omitted) thì giữ nguyên dữ liệu hiện tại.
    - Nếu gửi `amenityIds` hoặc `images`, mảng mới sẽ **thay thế toàn bộ** tập hợp hiện tại của phòng. Gửi mảng rỗng `[]` sẽ xóa toàn bộ liên kết tiện ích hoặc ảnh tương ứng. Nếu cập nhật danh sách ảnh loại bỏ ảnh Cloudinary cũ, hệ thống tự động xóa tài nguyên tương ứng trên Cloudinary sau khi commit transaction thành công.
  - **Quy tắc chuyển trạng thái Bảo trì & Cảnh báo lịch tương lai (AC1)**:
    - Khóa hàng MySQL `SELECT id, name, status, price_per_hour FROM rooms WHERE id = ? FOR UPDATE` trong transaction để đảm bảo tính tuần tự.
    - Khi chuyển từ `AVAILABLE` sang `MAINTENANCE`: Kiểm tra các booking ở trạng thái `CONFIRMED` có `startTime > now`.
    - Nếu tồn tại booking tương lai và request **không có** `acknowledgeFutureBookings: true`, transaction hủy ngay lập tức trước khi ghi dữ liệu và trả về `409 ROOM_HAS_FUTURE_BOOKINGS` kèm cấu trúc `details` chứa danh sách mã đặt chỗ và thời gian tương ứng.
    - Khi gửi lại với `acknowledgeFutureBookings: true`: Cập nhật trạng thái phòng sang `MAINTENANCE` thành công. **Bảo toàn bất biến nghiệp vụ**: Mọi lịch đặt phòng hiện có **giữ nguyên trạng thái và KHÔNG tự động bị hủy**.
- **Xử lý lỗi**:
  - `404 ROOM_NOT_FOUND`: Nếu phòng với `id` cung cấp không tồn tại.
  - `400 INVALID_AMENITY_IDS`: Nếu có bất kỳ amenity ID nào không tồn tại trong cơ sở dữ liệu.
  - `409 ROOM_HAS_FUTURE_BOOKINGS`: Khi chuyển sang bảo trì có lịch đặt chỗ tương lai mà chưa xác nhận.
  - Giao dịch thực thi nguyên tử (atomic transaction): nếu xảy ra bất kỳ lỗi nào, toàn bộ thay đổi scalar và relations đều bị rollback.
- **Phản hồi `200 OK`**: Trả về `RoomDetail` sau cập nhật.

### 4. Tải ảnh trực tiếp lên Cloudinary: `POST /api/v1/admin/rooms/:id/images`

- **Quyền truy cập**: `ADMIN`.
- **Path Parameter**: `id` là UUID hợp lệ của phòng.
- **Request Format (`multipart/form-data`)**:
  - Field name: `images` (tải lên 1 hoặc nhiều file ảnh).
  - Giới hạn: Tối đa 10 files mỗi lần gửi, dung lượng tối đa 5MB mỗi file.
  - Định dạng hỗ trợ: JPEG (`image/jpeg`, `image/jpg`), PNG (`image/png`), WebP (`image/webp`).
  - Kiểm tra an toàn kép (Dual Validation): Multer filter kiểm tra MIME type và Service kiểm tra **Magic Bytes (File Signature)** chống giả mạo đuôi mở rộng.
- **Lưu trữ & Transaction**:
  - Upload tuần tự từng ảnh lên Cloudinary tại folder `co-space/rooms/<roomId>`.
  - Khóa hàng MySQL `SELECT id FROM rooms WHERE id = ? FOR UPDATE` trong Prisma transaction để chống race condition khi bổ sung ảnh đồng thời.
  - Lưu bản ghi vào bảng `room_images` với `room_id`, `image_url` (`secure_url`), `public_id`, `is_primary`. Nếu phòng chưa có ảnh, file đầu tiên được tự động đánh dấu là `is_primary: true`.
  - Bảo mật dữ liệu: Public API response (`RoomDetailDto`) chỉ trả về `id`, `imageUrl`, `isPrimary` và **tuyệt đối không bao giờ để lộ `public_id`**.
  - Cơ chế Rollback bù (Compensating Cleanup): Nếu lưu database thất bại hoặc request lỗi giữa chừng, hệ thống tự động gọi dọn dẹp các asset vừa upload lên Cloudinary (best-effort với cơ chế log sanitized khi nhà cung cấp xảy ra lỗi) để tránh lưu trữ file mồ côi.
- **Xử lý lỗi**:
  - `400 VALIDATION_ERROR`: Thiếu file upload, sai định dạng file hoặc sai magic bytes.
  - `404 ROOM_NOT_FOUND`: Nếu phòng không tồn tại.
  - `413 FILE_TOO_LARGE`: Nếu bất kỳ file nào vượt quá 5MB.
- **Phản hồi `201 Created`**: Trả về `RoomDetail` hoàn chỉnh chứa danh sách ảnh đã được cập nhật.

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

| Nhóm Route          | Middleware Áp Dụng                           |  CUSTOMER  |   ADMIN    | Không Có Token |
| ------------------- | -------------------------------------------- | :--------: | :--------: | :------------: |
| `/api/v1/auth/*`    | Không (Public)                               |     ✅     |     ✅     |       ✅       |
| `/api/v1/health`    | Không (Public)                               |     ✅     |     ✅     |       ✅       |
| `/api/v1/rooms/*`   | Không (Public)                               |     ✅     |     ✅     |       ✅       |
| `/api/v1/amenities` | Không (Public)                               |     ✅     |     ✅     |       ✅       |
| `/api/v1/me/*`      | `verifyToken`                                |     ✅     |     ✅     |   ❌ (`401`)   |
| `/api/v1/bookings`  | `verifyToken` → `checkRole([Role.CUSTOMER])` |     ✅     | ❌ (`403`) |   ❌ (`401`)   |
| `/api/v1/admin/*`   | `verifyToken` → `checkRole([Role.ADMIN])`    | ❌ (`403`) |     ✅     |   ❌ (`401`)   |

> **Lưu ý về endpoint nghiệp vụ Admin:** Nhóm `/api/v1/admin` hiện đã cung cấp các endpoint quản lý phòng (`/api/v1/admin/rooms`). Nhóm `/api/v1/me` hiện tại đã được dựng router và gắn middleware bảo vệ, nhưng chưa có endpoint nghiệp vụ cụ thể (trả về mã `404 Not Found`).

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

## 📅 API Đặt Chỗ Làm Việc (Customer Booking API)

Endpoint dành cho người dùng có vai trò `CUSTOMER` thực hiện đặt phòng làm việc theo khung giờ với cơ chế kiểm tra slot trống và chống xung đột đặt phòng đồng thời (anti-double-booking concurrency lock).

### 1. Tạo đặt phòng mới: `POST /api/v1/bookings`

- **Quyền truy cập**: Bắt buộc đăng nhập với vai trò `CUSTOMER`. Thiếu token trả về `401 UNAUTHORIZED`; tài khoản `ADMIN` trả về `403 FORBIDDEN`.
- **Payload Request (`application/json`)**:
  - `roomId` (bắt buộc): Chuỗi UUID hợp lệ của phòng làm việc.
  - `startTime` (bắt buộc): Chuỗi thời gian chuẩn ISO 8601 (ví dụ: `2026-10-25T10:00:00.000Z`).
  - `endTime` (bắt buộc): Chuỗi thời gian chuẩn ISO 8601 (ví dụ: `2026-10-25T12:00:00.000Z`).
  - `note` (tùy chọn): Ghi chú của khách hàng (tối đa 500 ký tự). Chuỗi rỗng hoặc chỉ có khoảng trắng được chuẩn hóa thành `null`.
  - _Chặn Mass Assignment_: Schema sử dụng `.strict()`, từ chối bất kỳ trường client nào cố gắng can thiệp giá trị hệ thống như `userId`, `role`, `status`, `paymentStatus`, `pricePerHour`, `totalAmount`, `bookingCode`.
- **Các Quy Tắc Nghiệp Vụ Thời Gian (Time Business Rules)**:
  - **Căn chỉnh slot 30 phút**: Phút của `startTime` và `endTime` bắt buộc phải là `00` hoặc `30`; giây và mili-giây bằng 0 (`:00.000Z`).
  - **Giới hạn thời lượng**: Thời lượng đặt tối thiểu là 1 giờ (60 phút) và tối đa là 8 giờ (480 phút).
  - **Thời gian bắt đầu hợp lệ**: `startTime` không được ở trong quá khứ và phải cách thời điểm hiện tại của máy chủ tối thiểu 30 phút (`startTime >= now + 30m`).
  - **Thứ tự thời gian**: Bắt buộc `endTime > startTime`.
- **Trạng thái Phòng & Chống Trùng Lịch (Availability, Overlap & Concurrency)**:
  - **Chặn phòng Bảo trì (AC2)**: Thực hiện khóa hàng MySQL `SELECT id, name, status, price_per_hour FROM rooms WHERE id = ? FOR UPDATE` trong transaction. Nếu trạng thái phòng là `MAINTENANCE`, request bị từ chối ngay lập tức với mã `409 ROOM_NOT_AVAILABLE`.
  - **Quy tắc Overlap chuẩn**: Slot yêu cầu bị coi là trùng lịch nếu tồn tại booking có trạng thái thuộc danh sách chặn (`CONFIRMED`) thỏa mãn điều kiện:
    $$\text{existing.startTime} < \text{requested.endTime} \quad\land\quad \text{existing.endTime} > \text{requested.startTime}$$
    Cho phép chạm mốc biên (boundary touching): một booking kết thúc lúc `10:00` và booking tiếp theo bắt đầu lúc `10:00` không bị coi là trùng lặp.
  - **Bảo vệ Concurrency / Double-booking**: Toàn bộ thao tác kiểm tra phòng, kiểm tra overlap và chèn dữ liệu được thực thi trong một `prisma.$transaction` kết hợp khóa hàng MySQL `FOR UPDATE`. Hai request đồng thời cho cùng một phòng/khung giờ sẽ được serialize; request thứ hai sẽ phát hiện overlap và trả về `409 BOOKING_CONFLICT`.
- **Định Giá & Tạo Mã Đặt Chỗ Phía Server**:
  - **Tính tổng tiền Authoritative**: Server tính toán tổng tiền dựa trên giá trị `price_per_hour` đọc từ database tại thời điểm giao dịch và thời lượng thực tế (`pricePerHour * durationMinutes / 60`). Sử dụng `Prisma.Decimal` với chế độ làm tròn `ROUND_HALF_UP` 2 chữ số thập phân (làm tròn một lần duy nhất trên tổng số tiền, không làm tròn theo từng slot 30 phút nhằm tránh sai lệch tích lũy; ví dụ: `100.55 * 1.5h = 150.825 -> 150.83`, `100.01 * 1.5h = 150.015 -> 150.02`), tuyệt đối không dùng số thực dấu phẩy động (floating-point) của JavaScript để bảo đảm tính chính xác tiền tệ.
  - **Định dạng mã đặt phòng**: Tạo mã duy nhất theo định dạng `CS-YYYYMMDD-XXXX` (trong đó phần ngày `YYYYMMDD` được xác định theo thời gian bắt đầu `startTime` quy đổi về múi giờ `Asia/Ho_Chi_Minh`, không phụ thuộc vào thời điểm gửi request; hậu tố gồm 4 ký tự ngẫu nhiên `[0-9A-Z]` sinh bằng `crypto.randomInt`). Khi phát hiện xung đột unique constraint trên `bookingCode` (`P2002`), hệ thống thực hiện cơ chế thử lại tối đa 5 lần tổng cộng (`MAX_CODE_RETRIES = 5`). Nếu sau 5 lần vẫn xung đột, hệ thống rollback an toàn và trả về `409 BOOKING_CODE_CONFLICT`.
  - **Trạng thái ban đầu**: Booking tạo mới luôn có `status: "CONFIRMED"`, `paymentStatus: "UNPAID"`, `paymentMethod: null`.
- **Xử lý lỗi**:
  - `400 VALIDATION_ERROR`: Sai định dạng request body, UUID phòng không hợp lệ, chuỗi thời gian không đúng chuẩn ISO 8601, hoặc ghi chú vượt quá 500 ký tự.
  - `400 INVALID_SLOT`: Thời gian bắt đầu hoặc kết thúc không đúng mốc 30 phút (`:00` hoặc `:30`), giây/mili-giây khác 0, hoặc `endTime <= startTime`.
  - `400 MIN_DURATION`: Thời lượng đặt phòng nhỏ hơn 1 giờ (60 phút).
  - `400 MAX_DURATION`: Thời lượng đặt phòng vượt quá 8 giờ (480 phút).
  - `400 PAST_TIME`: Thời gian bắt đầu ở trong quá khứ (`startTime <= now`).
  - `400 ADVANCE_NOTICE`: Thời gian đặt trước không đủ 30 phút (`startTime - now < 30m`).
  - `401 UNAUTHORIZED`: Thiếu hoặc sai token JWT.
  - `403 FORBIDDEN`: Đăng nhập với vai trò không phải `CUSTOMER` (ví dụ `ADMIN`).
  - `404 ROOM_NOT_FOUND`: Phòng không tồn tại trong hệ thống.
  - `409 ROOM_NOT_AVAILABLE`: Phòng đang ở trạng thái `MAINTENANCE`.
  - `409 BOOKING_CONFLICT`: Khung giờ yêu cầu đã bị trùng lặp với lịch đặt phòng khác.
  - `409 BOOKING_CODE_CONFLICT`: Xung đột mã đặt phòng sau số lần thử tối đa.
- **Phản hồi `201 Created`**:
  ```json
  {
    "success": true,
    "message": "Đặt phòng thành công",
    "data": {
      "id": "c1f19672-005d-4f81-a6ce-ca039b36ebc0",
      "bookingCode": "CS-20261025-ABCD",
      "room": {
        "id": "room-uuid",
        "name": "Phòng Hội Thảo Alpha"
      },
      "startTime": "2026-10-25T03:00:00.000Z",
      "endTime": "2026-10-25T05:00:00.000Z",
      "totalAmount": "500000.00",
      "note": "Chuẩn bị thêm 2 ghế phụ",
      "status": "CONFIRMED",
      "paymentStatus": "UNPAID",
      "paymentMethod": null
    }
  }
  ```

#### Kiểm thử tạo đặt phòng & tính giá (CWB-22)

```bash
# Unit & API tests (mocked DB, quy tắc thời gian, retry mã, mass assignment)
npm run test --workspace=apps/server -- src/__tests__/booking-time.test.ts src/__tests__/booking.test.ts

# Integration tests (MySQL thật, transaction row lock, overlap, collision retry, làm tròn giá lẻ)
npm run test:integration --workspace=apps/server -- src/__tests__/booking.integration.test.ts
```

---

### 2. Giao Diện Time-Grid & Đặt Phòng Phía Client (Frontend Time-Grid UI)

Biểu mẫu đặt phòng tại `/rooms/:id` được tích hợp thành phần **Time-Grid** tương tác trực quan dành cho người dùng có vai trò `CUSTOMER` đã đăng nhập:

- **Hiển thị 48 Slot trong ngày (Giờ Việt Nam UTC+7)**:
  - Cho phép người dùng chọn ngày xem lịch thông qua bộ chọn ngày `booking-view-date-input`.
  - Tải và kết xuất 48 khung giờ 30 phút liên tục trong ngày theo múi giờ `Asia/Ho_Chi_Minh`.
- **Trạng thái & Màu sắc các Slot (AC1)**:
  - **Trống (`AVAILABLE`)**: Ô màu trắng có viền, có thể tương tác click để chọn khoảng giờ.
  - **Đã đặt (`BOOKED`)**: Ô màu xám (`slot-booked`), mang nhãn _"Đã đặt"_, áp dụng thuộc tính native `disabled`, không thể click hay chọn bằng bàn phím.
  - **Đã qua giờ / Dưới lead time 30 phút**: Ô màu xám nhạt (`slot-past`), native `disabled`.
  - **Đang chọn / Đã chọn**: Ô được highlight màu xanh thương hiệu (`slot-selected`) khi nằm trong khoảng `[startTime, endTime)`.
- **Quy tắc chọn Khung giờ & Đồng bộ Hai chiều (Two-Way Sync - AC2)**:
  - **Chọn 2 bước**: Click ô đầu tiên để bắt đầu chọn `startTime`, click ô thứ hai để chọn `endTime`.
  - Không cho phép chọn khoảng thời gian đi xuyên qua slot đã đặt (`BOOKED`).
  - Ràng buộc thời lượng: Tối thiểu 1 giờ (60 phút) và tối đa 8 giờ (480 phút). Click lại chính ô bắt đầu sẽ hiển thị thông báo hướng dẫn thời lượng tối thiểu 1 giờ.
  - Đồng bộ hai chiều: Thao tác click trên grid tự động cập nhật hai ô nhập `datetime-local`; ngược lại, việc nhập tay vào các ô thời gian cũng cập nhật highlight trên grid và tự động chuyển ngày xem lịch.
  - **Hỗ trợ đặt phòng qua nửa đêm (Overnight Booking)**: Khách hàng có thể nhập khoảng giờ xuyên đêm (ví dụ `23:00` đến `01:00` ngày hôm sau). Hệ thống tự động tải và xác thực lịch trống cho cả hai ngày.
- **Tự tính Tiền Tạm tính (AC3)**:
  - Giao diện tự động tính thời lượng đặt và tổng tiền ước tính (`preview`) dựa trên `pricePerHour` của phòng và số lượng slot 30 phút.
  - Áp dụng làm tròn `ROUND_HALF_UP` trên tổng tiền (sử dụng đơn vị integer cents) đảm bảo tính toán đồng nhất với thuật toán Decimal của backend.
- **Cơ chế Preflight Refresh & Chống Xung đột**:
  - Trước khi gửi request `POST /api/v1/bookings`, hệ thống tự động tải lại (refresh) trạng thái phòng và lịch trống của các ngày liên quan để phát hiện sớm các slot vừa bị đặt bởi người dùng khác.
  - Nếu phát hiện xung đột hoặc nhận phản hồi `409 BOOKING_CONFLICT`, biểu mẫu giữ nguyên thông tin đã nhập, hiển thị thông báo lỗi rõ ràng và cập nhật lại lưới hiển thị để slot bận chuyển sang màu xám.

### 3. Quy Trình Xác Nhận & Màn Hình Kết Quả Đặt Phòng (CWB-24)

- **Quy trình 2 bước (Review Before Submit)**:
  - **Bước 1 - Chỉnh sửa (`edit`)**: Người dùng chọn ngày, chọn khung giờ trên Time-Grid hoặc nhập `datetime-local`, điền ghi chú và xem tạm tính tổng tiền. Nút _"Tiếp tục xem lại thông tin"_ thực hiện validate dữ liệu phía client trước khi chuyển sang bước duyệt thông tin (không gọi API).
  - **Bước 2 - Xem lại thông tin (`review`)**: Tóm tắt rõ ràng tên phòng, khoảng thời gian chuẩn Việt Nam UTC+7, ghi chú và tổng tiền ước tính. Cung cấp nút _"← Quay lại chỉnh sửa"_ (giữ nguyên toàn bộ dữ liệu đã nhập) và nút _"Xác nhận đặt phòng"_ để thực thi preflight availability refresh và gửi request `POST /api/v1/bookings`.
- **Màn hình xác nhận đặt phòng (`/booking-confirmation`)**:
  - Sau khi `POST /api/v1/bookings` thành công, client điều hướng an toàn sang `/booking-confirmation` kèm state dữ liệu booking server trả về.
  - Hiển thị đầy đủ: Mã đặt phòng do server cấp (ví dụ `CS-YYYYMMDD-XXXX`), tên phòng, khoảng thời gian chi tiết (Việt Nam UTC+7), ghi chú, trạng thái đơn (`CONFIRMED`), trạng thái thanh toán (`UNPAID`), và tổng tiền chính xác do server tính.
  - **Hộp hướng dẫn thanh toán tại quầy (Counter Payment)**: Nêu rõ đơn đặt phòng đang ở trạng thái `UNPAID`; khách hàng cần lưu giữ/xuất trình mã đặt phòng và hoàn tất thanh toán trực tiếp tại quầy khi đến nhận không gian làm việc.
  - Cung cấp nút tiện ích _"← Quay lại trang phòng"_ và _"Về danh sách phòng"_.
  - **Cơ chế Fallback bảo vệ truy cập trực tiếp**: Khi người dùng refresh trình duyệt hoặc truy cập trực tiếp URL `/booking-confirmation` mà không có dữ liệu booking hợp lệ trong router state, ứng dụng hiển thị giao diện thông báo nhẹ nhàng kèm nút điều hướng về trang chủ thay vì bị crash.
- **Điều hướng thông minh sau đăng nhập cho khách vãng lai (Safe Post-Login Redirect)**:
  - Khách chưa đăng nhập khi xem phòng sẽ được hiển thị prompt đăng nhập kèm lưu lại đường dẫn gốc vào `location.state.from` (ví dụ `/rooms/:id`).
  - Sau khi đăng nhập thành công với vai trò `CUSTOMER`, hệ thống kiểm tra an toàn bằng regex `/^\/rooms\/[a-zA-Z0-9_-]+$/`: nếu hợp lệ sẽ tự động đưa người dùng trở lại đúng phòng đang xem; nếu đường dẫn không an toàn, ngoại vi hoặc chứa path traversal sẽ fallback an toàn về `/`.
  - Tài khoản với vai trò `ADMIN` luôn được ưu tiên điều hướng về `/admin`.

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
