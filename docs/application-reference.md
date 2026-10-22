# Co-Space Working — API và luồng nghiệp vụ

[Quay lại README](../README.md). Các lệnh bên dưới chạy tại thư mục gốc dự án.

## 🌐 Giao Diện & Xác Thực Phía Client (Frontend Auth, Navigation & Session)

Ứng dụng React tại `apps/client` quản lý định tuyến bằng **React Router v7**, xác thực và phân quyền RBAC dựa trên JWT, giao diện "Editorial Minimalist" (Tailwind CSS v4 + shadcn/ui) có chế độ sáng/tối, và hỗ trợ đa thiết bị cùng các tiêu chuẩn trợ năng (a11y). Token, thành phần và quy tắc thiết kế được mô tả tại [`apps/client/DESIGN.md`](../apps/client/DESIGN.md).

### 1. Bảng Định Tuyến Tuyến Đường (Client Routes & Access Rules)

| Tuyến đường             | Nội dung & Quyền truy cập                                                                                                                                                                           | Hành vi điều hướng & Quy tắc hiển thị                                                                                                                                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                | Form đăng nhập (Email, mật khẩu, nút ẩn/hiện mật khẩu, liên kết đăng ký).                                                                                                                           | Người dùng đã đăng nhập tự động chuyển về trang đích theo role (`CUSTOMER` → `/`, `ADMIN` → `/admin`). Điền sẵn email và hiển thị thông báo thành công nếu nhận state từ trang Đăng ký. Hỗ trợ quay lại an toàn các đường dẫn (`/rooms/:id`, `/bookings`, `/bookings/:uuid`) nếu có `state.from`. |
| `/register`             | Form đăng ký tài khoản khách hàng (`fullName`, `email`, `phoneNumber` tùy chọn, `password`, `confirmPassword`, nút ẩn/hiện mật khẩu).                                                               | Người dùng đã đăng nhập tự chuyển về trang đích theo role. Đăng ký thành công → `/login` kèm email điền sẵn và banner thông báo thành công (chưa cấp phiên).                                                                                                                                      |
| `/`                     | Trang chào công khai: hiển thị trạng thái đăng nhập, nút Đăng xuất, liên kết Quản trị (nếu là `ADMIN`), liên kết Lịch sử đặt phòng (nếu là `CUSTOMER`), và khám phá danh sách phòng làm việc.       | Truy cập công khai cho cả khách vãng lai và người dùng đã đăng nhập.                                                                                                                                                                                                                              |
| `/admin`                | Trang quản trị phòng làm việc dành cho vai trò `ADMIN`: danh sách phòng phân trang, xem tiện ích/ảnh, form inline tạo và chỉnh sửa phòng dùng chung, quản lý danh sách URL ảnh thủ công.            | Khách chưa đăng nhập → chuyển hướng sang `/login` (lưu vị trí `from`). Tài khoản `CUSTOMER` truy cập → hiển thị giao diện **403 - Không có quyền truy cập**, không tự đăng xuất và không chuyển hướng login.                                                                                      |
| `/admin/bookings`       | Trang quản trị đặt phòng dành cho vai trò `ADMIN`: tra cứu đơn theo mã, lọc theo ngày sử dụng phòng (giờ VN), lọc theo trạng thái (kết hợp logic AND); form đặt phòng trực tiếp cho khách vãng lai. | Khách chưa đăng nhập → chuyển hướng sang `/login` (lưu vị trí `from`). Tài khoản `CUSTOMER` truy cập → hiển thị giao diện **403 - Không có quyền truy cập**, không tự đăng xuất và không chuyển hướng login.                                                                                      |
| `/booking-confirmation` | Màn hình xác nhận đặt phòng thành công: hiển thị mã đặt phòng, thông tin phòng, thời gian, trạng thái, liên kết xem chi tiết/lịch sử và hướng dẫn thanh toán tại quầy.                              | Nhận dữ liệu đặt phòng qua router state sau khi tạo thành công. Truy cập trực tiếp không có state sẽ hiển thị giao diện fallback thông báo thân thiện và nút quay lại danh sách phòng.                                                                                                            |
| `/bookings`             | Trang lịch sử đặt phòng dành cho vai trò `CUSTOMER`: danh sách đơn phân trang (10 đơn/trang), 3 bộ lọc (Tất cả, Sắp tới, Đã hoàn tất), hiển thị rõ mã đơn, ngày giờ, số tiền và trạng thái.         | Khách chưa đăng nhập → chuyển hướng sang `/login`. Vai trò `ADMIN` truy cập → chuyển về trang chủ `/`. Đổi tài khoản tự động làm mới dữ liệu, không rò rỉ đơn của phiên cũ.                                                                                                                       |
| `/bookings/:id`         | Trang chi tiết đặt phòng dành cho vai trò `CUSTOMER`: tải trực tiếp dữ liệu từ API bằng UUID, kiểm tra quyền sở hữu IDOR phía server, hiển thị đầy đủ thông tin phòng, giờ VN, tiền và trạng thái.  | Khách chưa đăng nhập → chuyển hướng sang `/login`. Đơn không tồn tại hoặc thuộc người khác → hiển thị thông báo không tìm thấy (404), kèm liên kết quay lại lịch sử và danh sách phòng.                                                                                                           |
| Đường dẫn khác          | Giao diện 404 Not Found thân thiện.                                                                                                                                                                 | Cung cấp liên kết đưa người dùng quay trở về trang chủ `/`.                                                                                                                                                                                                                                       |

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
  - **Trống (`AVAILABLE`)**: Ô nền thẻ có viền (`data-slot-state="available"`), có thể tương tác click để chọn khoảng giờ.
  - **Đã đặt (`BOOKED`)**: Ô nền xám có sọc chéo và chữ gạch ngang (`data-slot-state="booked"`), mang nhãn _"Đã đặt"_, áp dụng thuộc tính native `disabled`, không thể click hay chọn bằng bàn phím.
  - **Đã qua giờ / Dưới lead time 30 phút**: Ô mờ (`data-slot-state="past"`), native `disabled`.
  - **Đang chọn / Đã chọn**: Ô nền mực đen, chữ sáng (`data-slot-state="selected"`, `aria-pressed="true"`) khi nằm trong khoảng `[startTime, endTime)`.
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
  - Sau khi đăng nhập thành công với vai trò `CUSTOMER`, hệ thống kiểm tra an toàn bằng regex: hỗ trợ đường dẫn phòng `/rooms/:id`, trang lịch sử `/bookings`, và chi tiết đơn `/bookings/:uuid`. Nếu hợp lệ sẽ tự động đưa người dùng trở lại đúng trang yêu cầu; nếu đường dẫn không an toàn, ngoại vi hoặc chứa path traversal sẽ fallback an toàn về `/`.
  - Tài khoản với vai trò `ADMIN` luôn được ưu tiên điều hướng về `/admin`.

### 4. Lịch Sử & Chi Tiết Đặt Phòng Phía Customer (CWB-25)

Hệ thống cung cấp tính năng theo dõi lịch sử và mở xem chi tiết các đơn đặt phòng dành riêng cho khách hàng (`CUSTOMER`):

- **API Lấy danh sách đặt phòng (`GET /api/v1/bookings`)**:
  - Yêu cầu xác thực JWT với vai trò `CUSTOMER`. Quyền sở hữu được kiểm tra nghiêm ngặt tại cơ sở dữ liệu (`userId = req.user.sub`), khách hàng không thể xem đơn của người khác.
  - Phân trang giới hạn (Bounded Pagination): tham số `page` (mặc định 1) và `limit` (mặc định 10, tối đa 100).
  - 3 chế độ xem / bộ lọc (`view`):
    - `ALL` (mặc định): Toàn bộ đơn của khách hàng, sắp xếp theo `startTime desc, id desc`.
    - `UPCOMING`: Chỉ các đơn `status = CONFIRMED` và có `startTime >= now` theo giờ server, sắp xếp theo `startTime asc, id asc`.
    - `COMPLETED`: Chỉ các đơn `status = COMPLETED`, sắp xếp theo `startTime desc, id desc`.
  - Nghiêm cấm nhận các tham số ngoài allowlist (từ chối query lạ bằng `400 VALIDATION_ERROR`).
- **API Lấy chi tiết đặt phòng (`GET /api/v1/bookings/:id`)**:
  - Nhận `id` là UUID của đơn đặt phòng.
  - Nếu ID không tồn tại hoặc thuộc về khách hàng khác, API trả về mã lỗi `404 BOOKING_NOT_FOUND` kèm thông báo _"Không tìm thấy đặt phòng"_ để bảo vệ quyền riêng tư và chống tấn công dò quét IDOR.
  - Trả về đầy đủ: mã đơn `bookingCode`, thông tin phòng (`id`, `name`), thời gian bắt đầu/kết thúc (ISO), số tiền đã lưu `totalAmount`, ghi chú, trạng thái đơn, trạng thái thanh toán và phương thức thanh toán.
- **Giao diện Lịch sử đặt phòng (`/bookings`)**:
  - Đồng bộ trạng thái URL (`?view=...&page=...`), tự động chuẩn hóa query không hợp lệ.
  - 3 tab chọn bộ lọc ("Tất cả", "Sắp tới", "Đã hoàn tất") với thuộc tính `aria-pressed`. Đổi bộ lọc tự động quay về trang 1.
  - Trình bày thông tin rõ ràng bằng `BookingSummary`: mã đơn, tên phòng, ngày giờ (Việt Nam `Asia/Ho_Chi_Minh`), tổng tiền (`formatCurrency`), nhãn trạng thái và badge màu riêng biệt.
  - Cung cấp nút _"Xem chi tiết →"_ cho từng đơn.
  - Cơ chế chống stale response và hủy request bằng `AbortController` khi chuyển trang/bộ lọc hoặc đăng xuất.
- **Giao diện Chi tiết đặt phòng (`/bookings/:id`)**:
  - Tải dữ liệu độc lập từ API server theo UUID trên URL; hoạt động ổn định khi truy cập trực tiếp, refresh trình duyệt hoặc qua deep link.
  - Xử lý đầy đủ các trạng thái loading (skeleton), lỗi mạng (kèm nút thử lại), và lỗi không tìm thấy (404/IDOR) với các liên kết quay lại lịch sử và danh sách phòng.

### 5. Chính Sách & Quy Trình Hủy Đặt Phòng Phía Khách Hàng (CWB-26)

Hệ thống cho phép khách hàng (`CUSTOMER`) chủ động tự hủy đơn đặt phòng của mình với các quy tắc nghiệp vụ và ràng buộc toàn vẹn dữ liệu:

- **API Hủy đặt phòng (`PATCH /api/v1/bookings/:id/cancel`)**:
  - Yêu cầu xác thực JWT với vai trò `CUSTOMER`. Thiếu token trả về `401 UNAUTHORIZED`; vai trò `ADMIN` trả về `403 FORBIDDEN`.
  - Quyền sở hữu được kiểm tra nghiêm ngặt tại cơ sở dữ liệu (`userId = req.user.sub`). Khách hàng không thể hủy đơn của người khác; nếu ID không tồn tại hoặc thuộc người khác, trả về `404 BOOKING_NOT_FOUND` để chống IDOR.
  - Tham số `:id` được kiểm tra định dạng UUID. Nghiêm cấm nhận body hoặc query lạ (`400 VALIDATION_ERROR`).
- **Quy tắc thời gian hủy (1-Hour Policy)**:
  - Khách hàng chỉ được tự hủy đơn nếu thời gian bắt đầu còn **ít nhất 1 giờ** (`startTime - serverNow >= 60 phút`). Giờ server là nguồn thẩm quyền duy nhất, không phụ thuộc vào đồng hồ thiết bị client.
  - Nếu yêu cầu hủy được gửi sát giờ (< 1 giờ hoặc giờ bắt đầu đã qua), hệ thống từ chối và trả về lỗi `400 CANCELLATION_POLICY_VIOLATION` kèm thông báo giải thích chính sách: _"Chỉ được hủy đặt phòng trước thời gian bắt đầu ít nhất 1 giờ"_.
- **Tính nguyên tử & Khóa dữ liệu (Transaction & Row-Locking)**:
  - Thao tác kiểm tra trạng thái, kiểm tra thời gian và cập nhật trạng thái diễn ra trong một MySQL transaction có khóa dòng bằng `FOR UPDATE`.
  - Chỉ đơn ở trạng thái `CONFIRMED` mới được phép hủy. Đơn ở trạng thái khác (`COMPLETED`, `NO_SHOW`) trả về `409 BOOKING_STATE_CONFLICT`.
  - Cơ chế Idempotent: Đơn đã ở trạng thái `CANCELLED` khi gọi lại sẽ trả về thành công `200 OK` với dữ liệu hiện tại, không gây lỗi và không tạo side effect lặp.
  - Khi đơn chuyển sang `CANCELLED`, khung giờ đặt phòng được giải phóng ngay lập tức khỏi availability để người dùng khác có thể đặt chỗ.
- **Trải nghiệm người dùng (Frontend Cancellation UI)**:
  - Tại trang chi tiết đặt phòng (`/bookings/:id`), hiển thị nút _"Hủy đặt phòng"_ cùng thông tin chính sách hủy trước 1 giờ dành cho đơn `CONFIRMED`.
  - Hộp thoại xác nhận thao tác rõ ràng để tránh người dùng bấm nhầm.
  - Khóa nút và hiển thị trạng thái đang xử lý (`isCancelling`), cập nhật trực tiếp huy hiệu trạng thái sang _"Đã hủy"_ khi thành công mà không cần tải lại toàn trang.
  - Hiển thị banner thông báo lỗi chính sách (`role="alert"`) hoặc lỗi xung đột trạng thái (kèm nút tải lại dữ liệu).

#### Kiểm thử Lịch sử, Chi tiết & Hủy đặt phòng (CWB-25, CWB-26)

```bash
# Unit & API tests (mocked DB, query validation, RBAC, time boundary 1h)
npm run test --workspace=apps/server -- src/__tests__/booking-history.test.ts src/__tests__/booking-cancellation.test.ts src/__tests__/booking-time.test.ts

# Integration tests (MySQL thật, cách ly dữ liệu giữa 2 Customer, 3 bộ lọc, locking và concurrency hủy phòng)
npm run test:integration --workspace=apps/server -- src/__tests__/booking-history.integration.test.ts src/__tests__/booking-cancellation.integration.test.ts

# Frontend tests (Lịch sử đặt phòng, Chi tiết đặt phòng, Quy trình hủy phòng và Guard)
npm run test --workspace=apps/client -- src/__tests__/BookingHistoryPage.test.tsx src/__tests__/BookingDetailPage.test.tsx
```

---

### 6. Quản Trị Đặt Chỗ & Đặt Phòng Cho Khách Vãng Lai (CWB-27)

Hệ thống cung cấp năng lực quản trị tập trung toàn bộ đơn đặt phòng và hỗ trợ nhân viên/quản trị viên (`ADMIN`) tạo đơn trực tiếp tại quầy cho khách vãng lai mà không cần đăng ký tài khoản trước:

- **API Tra cứu & Danh sách Đặt phòng Quản trị (`GET /api/v1/admin/bookings`)**:
  - Yêu cầu xác thực JWT với vai trò `ADMIN`. Không có token trả về `401 UNAUTHORIZED`; vai trò `CUSTOMER` trả về `403 FORBIDDEN`.
  - Phân trang giới hạn (Bounded Pagination): `page` (mặc định 1), `limit` (mặc định 10, tối đa 100). Sắp xếp mặc định: `startTime desc, id desc`.
  - **Bộ lọc nghiệp vụ (kết hợp logic AND chặt chẽ)**:
    - `bookingCode` (tùy chọn): Khớp chính xác (exact match), không phân biệt hoa thường (case-insensitive), tự động loại bỏ mọi khoảng trắng (`\s+`).
    - `date` (tùy chọn): Ngày bắt đầu sử dụng phòng (`YYYY-MM-DD`) theo múi giờ Việt Nam `Asia/Ho_Chi_Minh` (`+07:00`), tính trọn vẹn trong khoảng `[dayStart, dayEnd)`.
    - `status` (tùy chọn): Enum trạng thái (`CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`).
    - Nghiêm cấm tham số truy vấn ngoài allowlist (`400 VALIDATION_ERROR`).
  - **Dữ liệu trả về (Data Projection)**:
    - Danh sách `items` kèm đối tượng `customer`: Phân biệt rõ loại khách hàng (`kind: 'USER' | 'GUEST'`), họ tên (`name`) và số điện thoại (`phone`).
    - Phòng: `room` (`id`, `name`).
    - Thời gian: `startTime`, `endTime`.
    - Tài chính & Trạng thái: `totalAmount`, `status`, `paymentStatus`, `paymentMethod`, `note`.
- **API Đặt phòng Khách vãng lai (`POST /api/v1/admin/bookings/guest`)**:
  - Yêu cầu xác thực JWT với vai trò `ADMIN`.
  - Payload (`application/json`):
    - `guestName` (bắt buộc): Chuỗi ký tự từ 1 đến 191 ký tự (được trim khoảng trắng).
    - `guestPhone` (bắt buộc): Chuỗi ký tự số điện thoại từ 1 đến 191 ký tự (được trim khoảng trắng).
    - `roomId` (bắt buộc): UUID phòng làm việc.
    - `startTime`, `endTime` (bắt buộc): Khung giờ chuẩn ISO 8601, căn chỉnh slot 30 phút, thời lượng 1h - 8h, không trong quá khứ và cách hiện tại $\ge 30$ phút.
    - `note` (tùy chọn): Ghi chú $\le 500$ ký tự.
    - Chặn Mass Assignment bằng `.strict()`.
  - **Bảo toàn Bất biến Nghiệp vụ & Toàn vẹn Dữ liệu**:
    - **Không tạo User giả lập**: Bản ghi lưu trực tiếp `userId: null`, `guestName`, `guestPhone` trên bảng `bookings`.
    - **Tính tiền phía máy chủ**: Đọc `price_per_hour` từ database, tính theo thời lượng thực tế với Decimal `ROUND_HALF_UP` 2 chữ số thập phân.
    - **Mã đặt phòng**: Tạo mã duy nhất `CS-YYYYMMDD-XXXX` (giờ VN) với cơ chế retry tối đa 5 lần.
    - **Transaction & MySQL Row-Locking**: Sử dụng `prisma.$transaction` và khóa dòng `SELECT ... FOR UPDATE` đồng nhất với luồng khách hàng. Chống hoàn toàn tình trạng double-booking giữa khách vãng lai và khách hàng trực tuyến.
    - **Cách ly dữ liệu khách hàng**: Khách hàng thông thường (`CUSTOMER`) tuyệt đối không thể truy cập, xem hoặc thao tác trên đơn của khách vãng lai qua các API cá nhân.
- **Hoàn tất / Không đến (CWB-38)**:
  - `PATCH /api/v1/admin/bookings/:id/complete` và `PATCH /api/v1/admin/bookings/:id/no-show` yêu cầu vai trò `ADMIN`, chỉ chuyển từ `CONFIRMED` khi `now >= endTime`. Không hỗ trợ trả phòng sớm; thanh toán vẫn là trạng thái riêng.
  - Server đọc `end_time` bằng `SELECT ... FOR UPDATE` trong transaction và lấy thời gian đánh giá sau khi đã lấy khóa. Trước giờ kết thúc trả `409 BOOKING_STATE_CONFLICT`, không đổi trạng thái hay giải phóng phòng.
  - Gọi lại cùng trạng thái đích trả `200` với bản ghi hiện tại. Trạng thái kết thúc khác trả `409 BOOKING_STATE_CONFLICT`; không tìm thấy trả `404 BOOKING_NOT_FOUND`.
  - Tạo booking vẫn khóa phòng, kiểm tra overlap `existing.start < requested.end AND existing.end > requested.start` với `CONFIRMED`; yêu cầu đặt trùng trả `409 BOOKING_CONFLICT`.
  - **Giới hạn được giữ nguyên:** luồng đọc danh sách admin/lịch sử khách hàng/doanh thu tự chuyển các đơn `CONFIRMED` đã hết giờ thành `NO_SHOW`. Sau khi đã tự chuyển, không thể hoàn tất đơn đó; CWB-38 không thay đổi policy này.
- **Giao diện Quản trị Đặt phòng Phía Client (`/admin/bookings`)**:
  - Tích hợp điều hướng từ menu Quản trị (`/admin`).
  - Thanh tìm kiếm và bộ lọc nhanh: Ô nhập mã đơn, bộ chọn ngày (Việt Nam UTC+7), dropdown trạng thái, nút Tìm kiếm, Xóa bộ lọc và Làm mới dữ liệu. Đồng bộ trạng thái URL search params.
  - Bảng danh sách trực quan:
    - Huy hiệu nhận diện loại khách hàng: Tag tông slate cho **Khách vãng lai (Guest)** kèm SĐT; Tag trung tính cho **Tài khoản (User)**.
    - Trạng thái đơn dùng `StatusBadge` theo tông trạng thái của hệ thiết kế (`CONFIRMED` xanh dương, `COMPLETED` xanh lá, `CANCELLED` đỏ, `NO_SHOW` cam đất), luôn kèm nhãn chữ.
    - Phân trang đầy đủ kèm trạng thái trống/rỗng thân thiện.
    - Chỉ hiện “Hoàn tất” / “Không đến” cho đơn `CONFIRMED` đã đến `endTime`; cập nhật khi tới mốc kết thúc và khi cửa sổ được focus lại. Đồng hồ client chỉ hỗ trợ hiển thị, server quyết định điều kiện thời gian.
    - Lỗi thao tác hiển thị riêng, không thay thế bảng danh sách. Khi complete/no-show trả `409`, giữ bảng trong lúc tải lại dữ liệu và không báo thành công.
  - **Form Đặt phòng Khách vãng lai (`AdminGuestBookingForm`)**:
    - Nhập họ tên và số điện thoại khách vãng lai.
    - Danh sách chọn phòng làm việc kèm trạng thái và giá. Chặn chọn phòng đang bảo trì (`MAINTENANCE`).
    - Lưới TimeGrid 48 slot trực quan (giờ Việt Nam) hiển thị chính xác slot trống/bận.
    - Tự động hiển thị thời lượng và tổng tiền tạm tính.
    - Preflight availability refresh chống TOCTOU và xung đột đặt phòng đồng thời.
    - Thẻ tóm tắt `BookingSummary` thông báo thành công sau khi đặt phòng xong.

#### Kiểm thử Quản trị đặt phòng & Khách vãng lai (CWB-27)

```bash
# Unit & API tests (Mocked DB, RBAC 401/403, validation 400, mã hóa đơn, slot time)
npm run test --workspace=apps/server -- src/__tests__/admin-booking.test.ts

# Integration tests (MySQL thật, tra cứu exact-match case-insensitive, ngày bắt đầu VN, locking concurrency vãng lai vs online)
npm run test:integration --workspace=apps/server -- src/__tests__/admin-booking.integration.test.ts

# Lifecycle: endTime ± 1ms, chờ khóa, complete/no-show cạnh tranh với customer/guest create
npm run test:integration --workspace=apps/server -- src/__tests__/booking-lifecycle.integration.test.ts

# Frontend tests (Giao diện bảng admin bookings, form đặt phòng khách vãng lai, route guard)
npm run test --workspace=apps/client -- src/__tests__/AdminBookingsPage.test.tsx src/__tests__/AdminGuestBookingForm.test.tsx src/__tests__/AdminPage.test.tsx src/__tests__/RouteGuard.test.tsx
```

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
