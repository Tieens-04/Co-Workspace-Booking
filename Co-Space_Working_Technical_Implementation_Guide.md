# Co-Space Working Management System --- Technical Implementation Guide

> Tài liệu thực thi cho Front-end, Back-end và QA. Nguồn backlog: CSV
> Jira import-ready; giữ nguyên Issue Id/Parent Id.

## PHẦN I: TỔNG QUAN DỰ ÁN & TECH STACK

### 1. Tổng quan

**Tên dự án:** Co-Space Working Management System<br>
**Mục tiêu:** Quản lý, khám phá và đặt không gian làm việc chung; hỗ trợ
vận hành Admin, thanh toán tại quầy, check-in/state flow, thông báo và
báo cáo.

### 2. Tech Stack chính

---

Layer Công nghệ Vai trò

---

Frontend ReactJS Customer/Admin UI, Time-Grid,
forms, dashboard

Backend Node.js + Express REST API, business rules,
RBAC, transaction

Database MySQL 8 + Prisma ORM Persistence, migration,
transaction, aggregate

Auth JWT + bcrypt Authentication/authorization

Media Multer + Cloudinary Upload/lưu ảnh phòng

Notification Nodemailer + Gmail SMTP Email booking/cancellation

Validation/Security Zod/Joi, Input validation và hardening
express-rate-limit,<br>
CORS
------------------------------------------------------------------------------

### 3. Quy chuẩn mã nguồn & Git

- **Branch/GitFlow:** `main` = production, `develop` = integration;
  feature branch `feature/CS-<issue>-short-name`, fix
  `fix/CS-<issue>-short-name`, release `release/x.y.z`.
- **Commit:** Conventional Commits, ví dụ
  `feat(booking): CS-2015 prevent concurrent overlap`; mỗi commit nhỏ,
  build được và tham chiếu Issue Id.
- **Pull Request:** tối thiểu 1 reviewer; CI phải pass
  lint/test/build; thay đổi DB phải kèm migration và rollback note;
  thay đổi API phải cập nhật contract.
- **Lint/format:** ESLint + Prettier; không merge khi còn lint error;
  hạn chế `any`, dead code, unhandled Promise; import order thống
  nhất.
- **Architecture:** Backend ưu tiên
  `route -> controller -> service -> repository/Prisma`; business rule
  không đặt trong controller. Frontend tách
  `page/feature/component/hook/service` và không gọi Axios trực tiếp
  rải rác.
- **API convention:** `/api/...`, JSON UTF-8; lỗi chuẩn
  `{ "code": "...", "message": "...", "details": ... }`; log có
  correlation/request ID, không log secret/token/password.

```bash
git checkout develop
git checkout -b feature/CS-2015-booking-concurrency
# ... code + tests
git commit -m "feat(booking): CS-2015 prevent concurrent overlap"
```

## PHẦN II: CHI TIẾT TRIỂN KHAI THEO TỪNG EPIC VÀ TASK CON

## Epic `1001` --- Project Foundation & Authentication

**Issue Id:** `1001` \| **Parent Id:** _(none)_ \| **Labels:**
`co-space`

**Phạm vi:** Major capability của Co-Space Working: Project Foundation &
Authentication. **Epic AC:** Epic được tạo thành công và có thể chứa các
Task con.

### `2001` - Set up React + Express project structure

- **Issue Id**: `2001` \| **Parent Id**: `1001`
- **Epic**: Project Foundation & Authentication \| **Estimate**: 3 giờ
  (10800s) \| **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Khởi tạo monorepo/multi-repo cho Express backend và React frontend.
Thiết lập ESLint - Prettier - folder structure clean architecture.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Chốt cấu trúc repository (ưu tiên monorepo `apps/web`, `apps/api`,
  `packages/shared`) và chuẩn hóa Node/React version bằng
  `.nvmrc`/`engines`.
- Khởi tạo React app và Express API; cấu hình TypeScript nếu team dùng
  TS, alias import, `.env.example`, script
  `dev/build/test/lint/format`.
- Thiết lập ESLint + Prettier dùng chung; bật rule chống unused
  variables, floating promise, import cycle; chạy lint trong
  pre-commit/CI.
- Tổ chức Backend theo
  `routes -> controller -> service -> repository/Prisma`; Frontend
  theo `pages/features/components/services/hooks`.
- Viết README gồm prerequisites, bootstrap DB, env, seed và lệnh chạy
  FE/BE song song.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

Không có task kỹ thuật bắt buộc trước đó; cần chốt Node/npm, repo
strategy và môi trường dev.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: FE & BE khởi chạy thành công; linter/formatter hoạt động; README
có hướng dẫn cài đặt. Mở rộng: có automated/manual evidence phù hợp; lỗi
phải có `code/message` nhất quán. Deliverables: Repo skeleton,
ESLint/Prettier config, scripts, `.env.example`, README. HTTP
convention: `200/201` cho success; `400` validation; `401/403`
auth/RBAC; `404` resource; `409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Tránh lệch Node/package-manager version giữa dev/CI; không để secret
trong `.env.example`.

### `2002` - Configure MySQL 8 + Prisma and core schema

- **Issue Id**: `2002` \| **Parent Id**: `1001`
- **Epic**: Project Foundation & Authentication \| **Estimate**: 3 giờ
  (10800s) \| **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Thiết lập kết nối Prisma ORM với MySQL 8. Tạo schema hoàn chỉnh cho
User - Room - Amenity - RoomAmenity - RoomImage - Booking.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Tạo MySQL 8 database/user theo principle of least privilege; cấu
  hình `DATABASE_URL` và Prisma datasource.
- Mô hình hóa `User`, `Room`, `Amenity`, `RoomAmenity`, `RoomImage`,
  `Booking`; khai báo PK/FK, unique index, enum status và timestamp.
- Tạo migration đầu tiên; review SQL generated trước khi apply vào
  shared environment.
- Tạo `prisma/seed` idempotent với tối thiểu 1 ADMIN, 2 CUSTOMER, 4
  Room; không commit plaintext production secret.
- Thêm index cho `Booking(roomId,startTime,endTime,status)` và các
  trường filter phổ biến để chuẩn bị availability query.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2001. Cần MySQL 8 chạy được và quyền tạo schema/migration.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Prisma migration chạy thành công; seed data có ít nhất 1 admin -
2 customer - 4 room mẫu. Mở rộng: có automated/manual evidence phù hợp;
lỗi phải có `code/message` nhất quán. Deliverables:
`prisma/schema.prisma`, migration, seed script và index. HTTP
convention: `200/201` cho success; `400` validation; `401/403`
auth/RBAC; `404` resource; `409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Migration destructive, enum drift, thiếu index, seed không idempotent;
tiền nên dùng Decimal.

### `2003` - Implement Customer/Admin authentication with JWT

- **Issue Id**: `2003` \| **Parent Id**: `1001`
- **Epic**: Project Foundation & Authentication \| **Estimate**: 3 giờ
  (10800s) \| **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Xây dựng luồng Register và Login với mật khẩu mã hóa bcrypt. Cấp phát
JWT token kèm user role (CUSTOMER - ADMIN).

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Thiết kế DTO Register/Login và validate email/password trước khi vào
  service.
- Hash password bằng bcrypt với cost phù hợp; tuyệt đối không log
  password/hash.
- Khi login, so khớp bcrypt rồi ký JWT chứa tối thiểu `sub`, `role`,
  `iat`, `exp`; secret lấy từ environment.
- Tạo `auth.service`, `auth.controller`, routes `/api/auth/register`,
  `/api/auth/login`; chuẩn hóa response không trả `passwordHash`.
- Viết unit/integration test cho register, login đúng, wrong password,
  duplicate email và token hết hạn.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2001, 2002. Cần model User và JWT/bcrypt environment.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Password được hash bằng bcrypt; đăng nhập trả về JWT hợp lệ;
test happy path và wrong password. Mở rộng: có automated/manual evidence
phù hợp; lỗi phải có `code/message` nhất quán. Deliverables: Auth
routes/controller/service, password/JWT utilities, auth tests. HTTP
convention: `200/201` cho success; `400` validation; `401/403`
auth/RBAC; `404` resource; `409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

JWT secret yếu, token sống quá lâu, user enumeration, bcrypt blocking
quá nặng.

### `2004` - Implement RBAC and protected API routes

- **Issue Id**: `2004` \| **Parent Id**: `1001`
- **Epic**: Project Foundation & Authentication \| **Estimate**: 3 giờ
  (10800s) \| **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Tạo middleware verifyToken và checkRole(\[ADMIN\]). Bảo vệ các route
nhạy cảm của Admin và route cá nhân của Customer.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Tạo `verifyToken` đọc `Authorization: Bearer <token>`, verify
  signature/expiry và gắn principal tối thiểu vào `req.user`.
- Tạo `checkRole(allowedRoles)`; trả `401` khi chưa xác thực, `403`
  khi đã xác thực nhưng thiếu quyền.
- Áp middleware theo route, không dựa vào việc ẩn menu ở Frontend để
  bảo mật.
- Với resource của Customer, kiểm tra ownership tại service/repository
  (`booking.userId === req.user.sub`).
- Bổ sung test matrix CUSTOMER/ADMIN/no-token/invalid-token cho
  protected endpoints.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2003. Cần JWT contract và role enum.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Customer không truy cập được route Admin (403 Forbidden);
request không token bị từ chối (401). Mở rộng: có automated/manual
evidence phù hợp; lỗi phải có `code/message` nhất quán. Deliverables:
Auth/RBAC middleware, protected route wiring, authorization tests. HTTP
convention: `200/201` cho success; `400` validation; `401/403`
auth/RBAC; `404` resource; `409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Nhầm `401`/`403`, quên ownership check, tin role từ client.

### `2005` - Build login/register UI and auth integration

- **Issue Id**: `2005` \| **Parent Id**: `1001`
- **Epic**: Project Foundation & Authentication \| **Estimate**: 3 giờ
  (10800s) \| **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Xây dựng trang Login và Register trên ReactJS. Lưu JWT vào
localStorage/cookie và cấu hình Axios interceptor tự gắn Bearer token.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Dựng Login/Register form, client-side validation và trạng thái
  submitting/error.
- Tạo `authApi` và Auth context/store; giải mã claim cần thiết nhưng
  không coi decoded JWT là nguồn phân quyền đáng tin cậy phía server.
- Cấu hình Axios request interceptor gắn Bearer token; response
  interceptor xử lý `401` và tránh refresh/redirect loop.
- Sau login, điều hướng theo role; guard route Admin/Customer ở UI để
  cải thiện UX.
- Nếu dùng `localStorage`, ghi nhận rủi ro XSS; production ưu tiên
  HttpOnly Secure SameSite cookie nếu kiến trúc cho phép.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2003, 2004; FE/API base URL và auth response contract ổn định.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: User đăng nhập/đăng ký thành công từ UI; tự động redirect theo
role; hiển thị lỗi khi sai mật khẩu. Mở rộng: có automated/manual
evidence phù hợp; lỗi phải có `code/message` nhất quán. Deliverables:
Login/Register pages, auth store/context, Axios client/interceptors,
route guards. HTTP convention: `200/201` cho success; `400` validation;
`401/403` auth/RBAC; `404` resource; `409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

XSS khi lưu token ở localStorage, interceptor loop, stale auth state
nhiều tab.

## Epic `1002` --- Room Discovery & Management

**Issue Id:** `1002` \| **Parent Id:** _(none)_ \| **Labels:**
`co-space`

**Phạm vi:** Major capability của Co-Space Working: Room Discovery &
Management. **Epic AC:** Epic được tạo thành công và có thể chứa các
Task con.

### `2006` - Implement room list/detail API with filters

- **Issue Id**: `2006` \| **Parent Id**: `1002`
- **Epic**: Room Discovery & Management \| **Estimate**: 3 giờ
  (10800s) \| **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Viết REST API lấy danh sách phòng hỗ trợ lọc theo capacity - khoảng
giá - tiện ích (amenities) và xem chi tiết 1 phòng.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Thiết kế
  `GET /api/rooms?page=&limit=&capacity=&minPrice=&maxPrice=&amenityIds=`
  và `GET /api/rooms/:id`.
- Parse/validate query; giới hạn `limit` để tránh payload quá lớn;
  dùng `skip/take` và `count` trong Prisma.
- Filter amenities bằng relation query; xác định rõ semantics ANY hay
  ALL amenities (khuyến nghị ALL khi người dùng chọn nhiều tiện ích).
- Include cover/images/amenities có chọn lọc, tránh N+1 và
  over-fetching.
- Trả metadata `page, limit, total, totalPages`; detail không tồn tại
  trả `404`.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2002. Cần Room/Amenity/RoomImage schema + seed.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: API trả về danh sách có phân trang; filter theo amenity hoạt
động chính xác; route detail trả đầy đủ ảnh/tiện ích. Mở rộng: có
automated/manual evidence phù hợp; lỗi phải có `code/message` nhất quán.
Deliverables: Room query/detail controller-service-repository,
DTO/schema validation. HTTP convention: `200/201` cho success; `400`
validation; `401/403` auth/RBAC; `404` resource; `409` conflict khi áp
dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

N+1, filter amenities sai ANY/ALL, pagination không deterministic.

### `2007` - Build customer room discovery screens

- **Issue Id**: `2007` \| **Parent Id**: `1002`
- **Epic**: Room Discovery & Management \| **Estimate**: 3 giờ
  (10800s) \| **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Xây dựng giao diện Danh sách phòng và Chi tiết phòng trên ReactJS. Hiển
thị ảnh bìa - giá theo giờ - sức chứa và danh sách tiện ích.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Tạo Room List, Room Card, Filter Panel, Pagination và Room Detail
  page.
- Đồng bộ filter vào URL query để reload/share link không mất trạng
  thái; debounce input giá nếu cần.
- Tạo API hook/service có loading/error/empty state; hủy request cũ
  khi filter thay đổi nhanh.
- Detail hiển thị gallery, capacity, `pricePerHour`, amenities và CTA
  kiểm tra lịch trống.
- Kiểm tra responsive tối thiểu mobile/tablet/desktop và accessibility
  cho form/filter.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2006 và FE foundation 2001.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Hiển thị đúng dữ liệu từ API; bộ lọc trên UI cập nhật danh sách
mượt mà; responsive cơ bản. Mở rộng: có automated/manual evidence phù
hợp; lỗi phải có `code/message` nhất quán. Deliverables: Room
list/detail pages, filter/pagination components và API hooks. HTTP
convention: `200/201` cho success; `400` validation; `401/403`
auth/RBAC; `404` resource; `409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Race giữa request filter, ảnh lỗi, URL state không đồng bộ.

### `2008` - Implement admin room CRUD and image URLs

- **Issue Id**: `2008` \| **Parent Id**: `1002`
- **Epic**: Room Discovery & Management \| **Estimate**: 3 giờ
  (10800s) \| **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Xây dựng API và giao diện cho Admin để thêm - sửa thông tin phòng - cập
nhật đơn giá - sức chứa và gán tiện ích.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Tạo Admin endpoints `POST/PATCH /api/admin/rooms` và đọc danh sách
  phục vụ quản trị; bảo vệ bằng ADMIN RBAC.
- Validate room name, capacity \> 0, price \>= 0, status và amenity
  IDs tồn tại.
- Cập nhật quan hệ `RoomAmenity` trong transaction để tránh trạng thái
  nửa chừng khi update room + amenities.
- Dựng Admin Room Form tái sử dụng create/edit; preload dữ liệu khi
  edit và hiển thị validation server-side.
- Audit tối thiểu `createdAt/updatedAt`; cân nhắc `updatedBy` nếu yêu
  cầu truy vết.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2002, 2004; nên có 2006 để tái sử dụng DTO/query.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Admin tạo/sửa phòng thành công; dữ liệu lưu đúng các bảng liên
kết room_amenities. Mở rộng: có automated/manual evidence phù hợp; lỗi
phải có `code/message` nhất quán. Deliverables: Admin room API/UI,
transaction cập nhật amenities. HTTP convention: `200/201` cho success;
`400` validation; `401/403` auth/RBAC; `404` resource; `409` conflict
khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Partial update room/amenity nếu thiếu transaction; mass assignment.

### `2009` - Implement Cloudinary image upload for rooms

- **Issue Id**: `2009` \| **Parent Id**: `1002`
- **Epic**: Room Discovery & Management \| **Estimate**: 3 giờ
  (10800s) \| **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Tích hợp Multer + Cloudinary SDK để Admin upload trực tiếp nhiều ảnh cho
phòng từ giao diện quản trị.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Cấu hình Multer giới hạn số file, MIME type và dung lượng trước khi
  upload; không tin `Content-Type` từ client một cách tuyệt đối.
- Tạo Cloudinary adapter/service, đọc credentials từ environment;
  chuẩn hóa folder theo room.
- Upload nhiều ảnh có kiểm soát concurrency; chỉ lưu `secure_url` và
  `public_id` sau khi upload thành công.
- Nếu DB insert thất bại sau upload, thực hiện compensating cleanup
  ảnh orphan; khi xóa ảnh dùng `public_id`.
- Frontend dùng multipart form, progress/loading state, retry hợp lý
  và disable submit trong lúc upload.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2008; cần Cloudinary account/credentials.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Upload ảnh thành công lên Cloudinary; URL ảnh được lưu vào bảng
room_images; có loading state khi upload. Mở rộng: có automated/manual
evidence phù hợp; lỗi phải có `code/message` nhất quán. Deliverables:
Upload middleware, Cloudinary adapter, room image persistence/UI. HTTP
convention: `200/201` cho success; `400` validation; `401/403`
auth/RBAC; `404` resource; `409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

File giả MIME, ảnh orphan, upload quá lớn, credential leakage.

### `2010` - Implement room status and maintenance blocking

- **Issue Id**: `2010` \| **Parent Id**: `1002`
- **Epic**: Room Discovery & Management \| **Estimate**: 3 giờ
  (10800s) \| **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Thêm tính năng chuyển trạng thái phòng sang MAINTENANCE; kiểm tra cảnh
báo nếu phòng đang có booking trong tương lai.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Bổ sung/chuẩn hóa `Room.status` gồm `AVAILABLE/MAINTENANCE` (và
  trạng thái khác nếu domain cần).
- Trước khi chuyển MAINTENANCE, query booking tương lai đang
  `CONFIRMED`; trả danh sách/mức cảnh báo cho Admin.
- Yêu cầu explicit confirmation; không tự động hủy booking trừ khi có
  nghiệp vụ riêng.
- Availability/create-booking phải loại room MAINTENANCE ở Backend,
  không chỉ disable trên UI.
- Test biên: maintenance bắt đầu khi có booking, room không booking,
  concurrent booking trong lúc đổi status.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2008 và Booking schema 2002; nên hoàn thành query booking cơ bản.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Nếu có booking tương lai - hệ thống hiện cảnh báo bắt xác nhận
hủy thủ công; phòng bảo trì không cho khách đặt. Mở rộng: có
automated/manual evidence phù hợp; lỗi phải có `code/message` nhất quán.
Deliverables: Room status API/UI và booking guard cho MAINTENANCE. HTTP
convention: `200/201` cho success; `400` validation; `401/403`
auth/RBAC; `404` resource; `409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Race giữa chuyển maintenance và tạo booking; không tự hủy booking tương
lai ngoài policy.

## Epic `1003` --- Booking Management

**Issue Id:** `1003` \| **Parent Id:** _(none)_ \| **Labels:**
`co-space`

**Phạm vi:** Major capability của Co-Space Working: Booking Management.
**Epic AC:** Epic được tạo thành công và có thể chứa các Task con.

### `2011` - Implement 30-minute slot and booking-time validation

- **Issue Id**: `2011` \| **Parent Id**: `1003`
- **Epic**: Booking Management \| **Estimate**: 3 giờ (10800s) \|
  **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Xây dựng module kiểm tra quy chuẩn thời gian đặt phòng: block 30 phút -
tối thiểu 1h - tối đa 4h - cấm đặt quá khứ - đặt trước ít nhất 30 phút.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Tạo domain validator độc lập cho thời gian để tái sử dụng ở
  availability/create/admin guest booking.
- Chuẩn hóa thời gian theo UTC trong DB/API; chuyển timezone chỉ ở
  boundary/UI. Kiểm tra start/end nằm trên mốc 30 phút.
- Enforce `duration >= 60 phút`, `duration <= 240 phút`,
  `start > now`, và `start >= now + 30 phút`.
- Trả `400` với error code ổn định như `INVALID_SLOT`, `MIN_DURATION`,
  `MAX_DURATION`, `PAST_TIME`, `ADVANCE_NOTICE`.
- Viết table-driven tests cho đúng mốc, lệch 1 phút, DST/timezone (nếu
  áp dụng) và boundary 1h/4h.

```text
Slot size = 30 phút
60 phút <= duration <= 240 phút
startTime >= now + 30 phút
startTime/endTime phải align theo mốc 30 phút
```

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2002; cần business timezone/giờ hoạt động được chốt.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Toàn bộ 5 business rule về thời gian bị vi phạm đều trả về HTTP
400 kèm message rõ ràng. Mở rộng: có automated/manual evidence phù hợp;
lỗi phải có `code/message` nhất quán. Deliverables: Booking time
validator + unit tests. HTTP convention: `200/201` cho success; `400`
validation; `401/403` auth/RBAC; `404` resource; `409` conflict khi áp
dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

UTC/local mismatch, so sánh milliseconds, boundary đúng 30/60/240 phút.

### `2012` - Implement availability API and overlap query

- **Issue Id**: `2012` \| **Parent Id**: `1003`
- **Epic**: Booking Management \| **Estimate**: 3 giờ (10800s) \|
  **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Viết API kiểm tra phòng trống theo ngày. Dùng thuật toán kiểm tra
overlap: StartA \< EndB AND EndA \> StartB với các booking CONFIRMED.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Thiết kế `GET /api/rooms/:id/availability?date=YYYY-MM-DD` và xác
  định business timezone cho ngày.
- Sinh các slot 30 phút trong giờ hoạt động; query booking `CONFIRMED`
  giao với khoảng ngày.
- Áp dụng overlap chuẩn: `StartA < EndB AND EndA > StartB`; hai
  booking chạm biên (`EndA == StartB`) không overlap.
- Map mỗi slot sang `AVAILABLE/BOOKED`; loại MAINTENANCE và thời gian
  đã qua/không đủ advance notice nếu UX yêu cầu.
- Tối ưu bằng một query booking/ngày thay vì query từng slot; thêm
  integration test với nhiều pattern overlap.

```sql
-- Hai khoảng thời gian overlap khi:
existing.start_time < :requested_end
AND existing.end_time > :requested_start
```

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2011, 2002; cần status booking blocking được thống nhất.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: API trả về danh sách slot 30 phút kèm trạng thái AVAILABLE /
BOOKED chuẩn xác 100%. Mở rộng: có automated/manual evidence phù hợp;
lỗi phải có `code/message` nhất quán. Deliverables: Availability
endpoint/service + overlap integration tests. HTTP convention: `200/201`
cho success; `400` validation; `401/403` auth/RBAC; `404` resource;
`409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Dùng `<=`/`>=` sai làm slot chạm nhau bị coi overlap; query từng slot
gây chậm.

### `2013` - Build availability time-grid UI

- **Issue Id**: `2013` \| **Parent Id**: `1003`
- **Epic**: Booking Management \| **Estimate**: 3 giờ (10800s) \|
  **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Phát triển component Time-Grid trên React cho phép xem trực quan slot
trống/bận trong ngày và chọn giờ bắt đầu/kết thúc.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Tạo `TimeGrid` nhận danh sách slot từ availability API; key bằng
  timestamp thay vì index.
- Disable BOOKED/không hợp lệ; cho chọn contiguous range, không cho
  selection đi xuyên qua slot bận.
- State gồm `selectedStart`, `selectedEnd`; derive duration và
  subtotal thay vì lưu dữ liệu trùng lặp.
- Công thức tạm tính: `durationMinutes / 60 * pricePerHour`; dùng
  decimal-safe strategy và cùng rounding rule với Backend.
- Xử lý refresh availability trước bước confirm để giảm stale UI; hỗ
  trợ keyboard/focus cơ bản.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2012, 2007.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Slot đã đặt bị disable (xám); click chọn slot cập nhật đúng
start/end time; tự tính tổng tiền tạm tính. Mở rộng: có automated/manual
evidence phù hợp; lỗi phải có `code/message` nhất quán. Deliverables:
TimeGrid component/hook và price preview. HTTP convention: `200/201` cho
success; `400` validation; `401/403` auth/RBAC; `404` resource; `409`
conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Chọn range xuyên slot BOOKED; rounding preview khác Backend.

### `2014` - Implement create-booking API and price calculation

- **Issue Id**: `2014` \| **Parent Id**: `1003`
- **Epic**: Booking Management \| **Estimate**: 3 giờ (10800s) \|
  **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Viết API tạo đơn đặt phòng. Tự động tính duration - tổng tiền dựa trên
price_per_hour và sinh booking_code dạng CS-YYYYMMDD-XXXX.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Thiết kế `POST /api/bookings` nhận `roomId,startTime,endTime,note`;
  không nhận `totalAmount` đáng tin cậy từ client.
- Chạy validator Task 2011 và kiểm tra room status/availability trước
  khi ghi.
- Đọc `pricePerHour` từ DB, tính duration và tiền ở Backend; dùng
  Prisma Decimal/đơn vị tiền nhỏ nhất để tránh floating-point.
- Sinh `bookingCode` dạng `CS-YYYYMMDD-XXXX` bằng random/sequence đủ
  entropy và unique constraint; retry khi collision.
- Tạo booking `CONFIRMED` và trả `201`; lỗi validation `400`, resource
  `404`, conflict slot `409`.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2011, 2012, 2003/2004; cần Room price và User auth.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Tạo thành công booking với status CONFIRMED; booking_code là duy
nhất; tổng tiền làm tròn chính xác. Mở rộng: có automated/manual
evidence phù hợp; lỗi phải có `code/message` nhất quán. Deliverables:
Create-booking endpoint/service, booking-code generator. HTTP
convention: `200/201` cho success; `400` validation; `401/403`
auth/RBAC; `404` resource; `409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Tin giá từ client, collision booking code, floating-point tiền.

### `2015` - Prevent booking overlap with transaction and concurrency control

- **Issue Id**: `2015` \| **Parent Id**: `1003`
- **Epic**: Booking Management \| **Estimate**: 3 giờ (10800s) \|
  **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Bọc luồng tạo booking trong Prisma Transaction kết hợp raw query khóa
dòng (SELECT FOR UPDATE) để chống race condition tuyệt đối.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Đặt toàn bộ critical section của create-booking trong Prisma
  transaction; xác định đúng isolation level cho MySQL 8.
- Khóa tài nguyên đại diện cho room/slot trước khi re-check overlap;
  dùng parameterized raw query, không nối chuỗi SQL từ payload.
- Ngay sau khi lock, query lại overlap với điều kiện
  `start_time < requestedEnd AND end_time > requestedStart` và status
  blocking.
- Nếu có overlap, rollback và trả `409 BOOKING_CONFLICT`; nếu không,
  insert booking rồi commit.
- Viết concurrency test gửi hai request song song bằng
  barrier/Promise.all và assert đúng 1 bản ghi được commit.

```sql
-- Thực hiện bên trong transaction; tham số phải parameterized
SELECT id FROM rooms WHERE id = ? FOR UPDATE;
SELECT id FROM bookings
WHERE room_id = ? AND status = 'CONFIRMED'
  AND start_time < ? AND end_time > ?;
```

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2014; MySQL 8/InnoDB và quyền chạy transaction/raw query.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Khi 2 request gửi cùng lúc cho 1 slot: 1 request thành công
201 - 1 request nhận lỗi HTTP 409 Conflict. Mở rộng: có automated/manual
evidence phù hợp; lỗi phải có `code/message` nhất quán. Deliverables:
Transactional locking path + concurrency integration test. HTTP
convention: `200/201` cho success; `400` validation; `401/403`
auth/RBAC; `404` resource; `409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Lock sai row/range vẫn double-book; deadlock cần retry có giới hạn; raw
SQL phải parameterized.

### `2016` - Build booking form and confirmation UI

- **Issue Id**: `2016` \| **Parent Id**: `1003`
- **Epic**: Booking Management \| **Estimate**: 3 giờ (10800s) \|
  **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Xây dựng form điền ghi chú - xác nhận thông tin đặt phòng và hiển thị
màn hình chúc mừng kèm mã Booking Code sau khi đặt.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Guard route/form: nếu chưa authenticate, lưu intended URL/selection
  rồi chuyển Login.
- Dựng Booking Form hiển thị room, thời gian, duration, subtotal và
  note; confirm payload trước submit.
- Disable double-submit; xử lý `409` bằng thông báo slot vừa được
  người khác đặt và refresh availability.
- Sau `201`, điều hướng confirmation page từ booking response, hiển
  thị booking code và hướng dẫn thanh toán tại quầy.
- Không coi dữ liệu giá trên UI là authoritative; luôn hiển thị total
  do API trả về sau khi tạo.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2013, 2014, 2005.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Khách chưa đăng nhập bị chặn yêu cầu login; sau khi đặt hiện mã
đặt phòng và hướng dẫn thanh toán tại quầy. Mở rộng: có automated/manual
evidence phù hợp; lỗi phải có `code/message` nhất quán. Deliverables:
Booking form, confirmation page, conflict handling. HTTP convention:
`200/201` cho success; `400` validation; `401/403` auth/RBAC; `404`
resource; `409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Double-click tạo hai request; stale availability dẫn `409` là bình
thường và phải UX tốt.

### `2017` - Implement customer booking history and detail

- **Issue Id**: `2017` \| **Parent Id**: `1003`
- **Epic**: Booking Management \| **Estimate**: 3 giờ (10800s) \|
  **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Xây dựng trang Lịch sử đặt phòng cho Customer để theo dõi các đơn sắp
tới - đơn đã hoàn tất và xem chi tiết từng đơn.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Tạo `GET /api/me/bookings` và `GET /api/me/bookings/:id`; identity
  lấy từ JWT, không nhận `userId` tùy ý.
- Phân trang và filter nhóm upcoming/history theo thời gian/status;
  định nghĩa sort ổn định.
- Query detail kèm room/payment fields cần thiết, nhưng không lộ dữ
  liệu khách khác.
- Frontend tạo list/tabs và detail page; format timezone/tiền nhất
  quán.
- Test IDOR: Customer A truy cập booking của B phải nhận `404` hoặc
  `403` theo security convention.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2014, 2004.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Customer chỉ xem được booking của chính mình; hiển thị rõ mã
đơn - ngày giờ - số tiền và trạng thái. Mở rộng: có automated/manual
evidence phù hợp; lỗi phải có `code/message` nhất quán. Deliverables:
My-bookings API + history/detail UI. HTTP convention: `200/201` cho
success; `400` validation; `401/403` auth/RBAC; `404` resource; `409`
conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

IDOR/ownership, phân loại upcoming theo timezone.

### `2018` - Implement customer cancellation rules

- **Issue Id**: `2018` \| **Parent Id**: `1003`
- **Epic**: Booking Management \| **Estimate**: 3 giờ (10800s) \|
  **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Xây dựng chức năng cho phép Customer tự hủy đơn nếu cách giờ bắt đầu ít
nhất 2 tiếng. Dưới 2 tiếng hệ thống từ chối.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Tạo `PATCH/POST /api/me/bookings/:id/cancel`; kiểm tra ownership và
  trạng thái hiện tại.
- Tính `startTime - now >= 2h` ở Backend bằng cùng timezone policy;
  không dựa vào đồng hồ client.
- Update có điều kiện từ `CONFIRMED -> CANCELLED`; lưu `cancelledAt`
  và optional reason.
- Chống double cancel/idempotency: booking đã CANCELLED trả trạng thái
  rõ ràng, không phát side effect lặp.
- Trigger notification bất đồng bộ/fallback theo Task 2023 sau commit,
  không gửi email trước khi transaction thành công.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2017, 2014; cần cancellation policy 2h.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Hủy trước 2h thành công (chuyển CANCELLED); hủy sát giờ báo lỗi
vi phạm chính sách kèm giải thích. Mở rộng: có automated/manual evidence
phù hợp; lỗi phải có `code/message` nhất quán. Deliverables:
Cancellation endpoint/UI + policy tests. HTTP convention: `200/201` cho
success; `400` validation; `401/403` auth/RBAC; `404` resource; `409`
conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Clock skew, đúng mốc 2h, side effect email lặp.

### `2019` - Implement admin booking management and guest booking

- **Issue Id**: `2019` \| **Parent Id**: `1003`
- **Epic**: Booking Management \| **Estimate**: 3 giờ (10800s) \|
  **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Màn hình Admin quản lý danh sách booking - bộ lọc trạng thái và chức
năng đặt phòng hộ khách vãng lai (nhập tên + SĐT).

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Tạo Admin booking list/search theo booking code, date, status với
  pagination.
- Tái sử dụng booking validator/availability/concurrency service,
  không tạo nhánh logic riêng yếu hơn cho Admin.
- Mở rộng Booking để hỗ trợ guest identity (`guestName`, `guestPhone`)
  hoặc model Guest; xác định constraint user-vs-guest.
- Dựng Admin Guest Booking form; normalize/validate số điện thoại và
  ghi audit người tạo.
- Test guest booking không cần User nhưng vẫn bị chặn overlap,
  maintenance và time rules theo chính sách đã chốt.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2014, 2015, 2004; cần chốt guest data model.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Admin tra cứu được đơn theo mã/ngày; đặt phòng vãng lai thành
công mà không cần tạo User trước. Mở rộng: có automated/manual evidence
phù hợp; lỗi phải có `code/message` nhất quán. Deliverables: Admin
booking list/search + guest booking form/API. HTTP convention: `200/201`
cho success; `400` validation; `401/403` auth/RBAC; `404` resource;
`409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

PII guest, duplicate phone, bypass rule booking do Admin path.

### `2020` - Run booking regression and edge-case tests

- **Issue Id**: `2020` \| **Parent Id**: `1003`
- **Epic**: Booking Management \| **Estimate**: 3 giờ (10800s) \|
  **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Viết bộ unit/integration test tự động bao phủ 4 kịch bản cốt lõi:
Overlap - Booking nằm trọn bên trong - Booking chạm nhau (:00) và
Concurrency.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Chuẩn bị test database cô lập, seed room/booking theo từng case và
  cleanup deterministic.
- Case Overlap: partial overlap đầu/cuối phải bị từ chối; case
  contained: booking mới nằm trọn trong booking cũ phải bị từ chối.
- Case touching boundary: `end == start` được phép theo công thức
  strict inequality.
- Case concurrency: phát hai request đồng thời cùng slot và assert một
  `201`, một `409`, DB chỉ có một booking blocking.
- Đưa suite vào CI; log query/transaction khi fail để chẩn đoán race
  condition thay vì tăng retry mù quáng.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2011, 2012, 2014, 2015.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Tất cả 4 test case đều pass; không có hiện tượng double-booking
trong môi trường test. Mở rộng: có automated/manual evidence phù hợp;
lỗi phải có `code/message` nhất quán. Deliverables: Automated
regression/concurrency suite và CI hook. HTTP convention: `200/201` cho
success; `400` validation; `401/403` auth/RBAC; `404` resource; `409`
conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Concurrency test giả nếu request không thật sự đồng thời; test data rò
giữa case.

## Epic `1004` --- Payment & Check-in

**Issue Id:** `1004` \| **Parent Id:** _(none)_ \| **Labels:**
`co-space`

**Phạm vi:** Major capability của Co-Space Working: Payment & Check-in.
**Epic AC:** Epic được tạo thành công và có thể chứa các Task con.

### `2021` - Implement payment status and admin confirmation

- **Issue Id**: `2021` \| **Parent Id**: `1004`
- **Epic**: Payment & Check-in \| **Estimate**: 3 giờ (10800s) \|
  **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Xây dựng tính năng xác nhận thanh toán tại quầy (chuyển payment_status
từ UNPAID sang PAID) và hủy đơn phía Admin có lý do.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Chuẩn hóa `paymentStatus` (`UNPAID/PAID`) và `paymentMethod`
  (`CASH/QR`); migration nếu schema chưa có.
- Tạo Admin endpoint xác nhận thanh toán, validate transition và lưu
  `paidAt/confirmedBy` nếu có audit.
- Tạo Admin cancellation endpoint yêu cầu reason; kiểm tra transition
  hợp lệ để tránh hủy COMPLETED sai nghiệp vụ.
- UI cập nhật optimistic chỉ khi có rollback strategy; mặc định
  refetch sau success để giữ consistency.
- Đảm bảo payment update idempotent, không cộng doanh thu nhiều lần
  khi Admin click lặp.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2019 hoặc ít nhất 2014 + Admin RBAC 2004.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Admin cập nhật trạng thái thanh toán tức thì; ghi nhận phương
thức thanh toán (CASH/QR). Mở rộng: có automated/manual evidence phù
hợp; lỗi phải có `code/message` nhất quán. Deliverables: Payment/admin
cancellation endpoints + UI controls. HTTP convention: `200/201` cho
success; `400` validation; `401/403` auth/RBAC; `404` resource; `409`
conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Double payment confirmation, invalid state transition, audit thiếu.

### `2022` - Implement revenue calculation and check-in state flow

- **Issue Id**: `2022` \| **Parent Id**: `1004`
- **Epic**: Payment & Check-in \| **Estimate**: 3 giờ (10800s) \|
  **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Xây dựng logic hoàn tất ca (COMPLETED) và giải phóng phòng khi khách
không đến (NO_SHOW); tính toán doanh thu thực tế vs tạm tính.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Định nghĩa state machine rõ ràng cho
  `CONFIRMED -> COMPLETED/NO_SHOW/CANCELLED`; cấm transition ngược
  không hợp lệ.
- Tính actual revenue từ booking `PAID` theo kỳ báo cáo; tách
  booked/subtotal khỏi recognized/actual revenue.
- Lazy evaluation: khi đọc/điều hành booking quá ngưỡng check-in mà
  chưa hoàn tất, đánh giá điều kiện NO_SHOW theo policy.
- Nếu lazy update gây side effect khó kiểm soát, đóng gói service
  idempotent và cân nhắc scheduled job ở phiên bản sau.
- Test booking PAID/UNPAID, completed/no-show và ranh giới thời gian
  chính xác.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2021; cần state/payment semantics được chốt.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Doanh thu thực tế chỉ tính đơn PAID; lazy evaluation tự động
chuyển trạng thái NO_SHOW khi quá giờ. Mở rộng: có automated/manual
evidence phù hợp; lỗi phải có `code/message` nhất quán. Deliverables:
Booking state service, revenue query và no-show evaluation. HTTP
convention: `200/201` cho success; `400` validation; `401/403`
auth/RBAC; `404` resource; `409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Lazy evaluation gây write khi GET; định nghĩa doanh thu/NO_SHOW không
nhất quán.

## Epic `1005` --- Notifications

**Issue Id:** `1005` \| **Parent Id:** _(none)_ \| **Labels:**
`co-space`

**Phạm vi:** Major capability của Co-Space Working: Notifications.
**Epic AC:** Epic được tạo thành công và có thể chứa các Task con.

### `2023` - Implement email confirmation/cancellation and toast feedback

- **Issue Id**: `2023` \| **Parent Id**: `1005`
- **Epic**: Notifications \| **Estimate**: 3 giờ (10800s) \|
  **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Tích hợp Nodemailer gửi email xác nhận đặt phòng và email hủy đơn qua
Gmail SMTP (kèm chế độ fallback không làm nghẽn luồng).

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Tạo Notification service tách khỏi booking service; template
  confirmation/cancellation nhận dữ liệu đã sanitize.
- Cấu hình Nodemailer Gmail SMTP qua environment/app password; không
  commit credential.
- Chỉ gửi sau khi booking transaction commit. Bao try/catch và
  timeout; email fail không rollback booking.
- Log structured event/correlation ID và trạng thái gửi để hỗ trợ
  retry thủ công; tránh log PII quá mức.
- Frontend dùng Toast cho success/error; không dùng Toast thay thế
  validation inline đối với lỗi form.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2014, 2018; cần SMTP credential.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Email gửi tự động sau khi đặt/hủy; UI hiển thị Toast
notification phản hồi thao tác nhanh. Mở rộng: có automated/manual
evidence phù hợp; lỗi phải có `code/message` nhất quán. Deliverables:
Notification service/templates + Toast integration. HTTP convention:
`200/201` cho success; `400` validation; `401/403` auth/RBAC; `404`
resource; `409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

SMTP timeout làm chậm request, duplicate email, lộ PII trong log.

## Epic `1006` --- Admin Dashboard & Reports

**Issue Id:** `1006` \| **Parent Id:** _(none)_ \| **Labels:**
`co-space`

**Phạm vi:** Major capability của Co-Space Working: Admin Dashboard &
Reports. **Epic AC:** Epic được tạo thành công và có thể chứa các Task
con.

### `2024` - Build admin dashboard KPI and room time-grid

- **Issue Id**: `2024` \| **Parent Id**: `1006`
- **Epic**: Admin Dashboard & Reports \| **Estimate**: 3 giờ (10800s)
  \| **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Xây dựng màn hình Dashboard hiển thị KPI: Booking hôm nay - Tỷ lệ lấp
đầy phòng - Doanh thu thực tế và lịch Time-Grid tổng quan.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Thiết kế KPI endpoints hoặc aggregate endpoint nhận
  `from/to/granularity`; validate khoảng ngày.
- Booking hôm nay: count theo business timezone; occupancy: booked
  room-minutes / available room-minutes; revenue: chỉ PAID theo Task 2022.
- Dùng Prisma aggregate/groupBy hoặc raw SQL có index; tránh kéo toàn
  bộ booking về Node để tính.
- Dựng KPI cards + date/week filter + room time-grid tổng quan;
  cache/query key phải chứa filter.
- Đối soát KPI bằng fixture nhỏ có kết quả tính tay; kiểm tra timezone
  tại đầu/cuối ngày.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2022, 2012; cần dữ liệu booking/payment tin cậy.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Số liệu KPI hiển thị chính xác theo bộ lọc ngày/tuần; giao diện
grid lịch trực quan dễ nhìn. Mở rộng: có automated/manual evidence phù
hợp; lỗi phải có `code/message` nhất quán. Deliverables: KPI/aggregate
API, dashboard cards và room grid. HTTP convention: `200/201` cho
success; `400` validation; `401/403` auth/RBAC; `404` resource; `409`
conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Sai denominator occupancy, timezone boundary, aggregate query thiếu
index.

## Epic `1007` --- Content & System Management

**Issue Id:** `1007` \| **Parent Id:** _(none)_ \| **Labels:**
`co-space`

**Phạm vi:** Major capability của Co-Space Working: Content & System
Management. **Epic AC:** Epic được tạo thành công và có thể chứa các
Task con.

> Backlog hiện tại chưa có Task con được gán vào Epic này. Giữ Epic để
> quản lý scope và bổ sung task ở iteration sau.

## Epic `1008` --- Deployment - Security & Quality

**Issue Id:** `1008` \| **Parent Id:** _(none)_ \| **Labels:**
`co-space`

**Phạm vi:** Major capability của Co-Space Working: Deployment -
Security & Quality. **Epic AC:** Epic được tạo thành công và có thể chứa
các Task con.

### `2025` - Security review - validation and rate limiting

- **Issue Id**: `2025` \| **Parent Id**: `1008`
- **Epic**: Deployment - Security & Quality \| **Estimate**: 3 giờ
  (10800s) \| **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Bổ sung validate dữ liệu đầu vào bằng Zod/Joi - tích hợp
express-rate-limit chống brute-force và rà soát CORS - SQL injection.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Áp Zod/Joi schema cho body/query/params ở boundary; strip/reject
  unknown fields theo endpoint.
- Cấu hình `express-rate-limit` cho login; key strategy phải cân nhắc
  IP/proxy và `trust proxy` khi deploy sau reverse proxy.
- Rà CORS theo allowlist production, methods/headers cần thiết; không
  dùng wildcard với credentials.
- Đảm bảo Prisma/raw SQL đều parameterized; rà mass assignment, error
  stack leakage, JWT secret, upload validation.
- Thêm security tests: malformed payload, SQL metacharacters,
  brute-force \>10 lần, token sai/expired, oversized input.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

Các API chính (2003--2024) đã ổn định đủ để security review.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Không thể inject SQL qua input; rate limit chặn sau 10 lần login
sai liên tiếp. Mở rộng: có automated/manual evidence phù hợp; lỗi phải
có `code/message` nhất quán. Deliverables: Validation middleware,
rate-limit/CORS config, security test suite. HTTP convention: `200/201`
cho success; `400` validation; `401/403` auth/RBAC; `404` resource;
`409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Rate limit sau proxy sai IP, CORS quá rộng, schema cho phép unknown
field.

### `2026` - Run customer/admin happy-path tests

- **Issue Id**: `2026` \| **Parent Id**: `1008`
- **Epic**: Deployment - Security & Quality \| **Estimate**: 3 giờ
  (10800s) \| **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Kiểm thử thủ công toàn bộ luồng hoạt động từ đăng ký -\> tìm phòng -\>
đặt phòng -\> thanh toán tại quầy -\> hoàn tất ca.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Chuẩn bị test checklist và dữ liệu đại diện cho Customer/Admin/Room.
- Chạy E2E thủ công: register -\> login -\> discovery -\> availability
  -\> booking -\> Admin payment -\> complete.
- Chạy luồng Admin guest booking, cancellation hợp lệ/không hợp lệ và
  maintenance.
- Ghi evidence gồm request/response, screenshot cần thiết và defect
  với severity/repro steps.
- Chỉ sign-off khi không còn blocker/critical và regression cốt lõi
  pass trên build candidate.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

Luồng nghiệp vụ chính 2003--2025.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Toàn bộ luồng nghiệp vụ chạy mượt mà từ đầu đến cuối không gặp
lỗi gián đoạn. Mở rộng: có automated/manual evidence phù hợp; lỗi phải
có `code/message` nhất quán. Deliverables: Test
checklist/evidence/defect report và sign-off. HTTP convention: `200/201`
cho success; `400` validation; `401/403` auth/RBAC; `404` resource;
`409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Test chỉ happy path mà bỏ boundary; môi trường test khác production quá
nhiều.

### `2027` - Polish loading - error - empty states and responsive UX

- **Issue Id**: `2027` \| **Parent Id**: `1008`
- **Epic**: Deployment - Security & Quality \| **Estimate**: 3 giờ
  (10800s) \| **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Tối ưu trải nghiệm giao diện: Skeleton loading - Empty state khi không
có phòng - thông báo lỗi thân thiện và test trên mobile.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Chuẩn hóa component Skeleton/Spinner, Error State, Empty State và
  Toast dùng xuyên ứng dụng.
- Ngăn layout shift bằng kích thước ảnh/aspect ratio placeholder;
  lazy-load ảnh phòng hợp lý.
- Map error code Backend sang thông điệp người dùng; vẫn giữ
  correlation/debug info trong log, không lộ stack.
- Kiểm tra breakpoint mobile, touch target, overflow table/time-grid
  và form keyboard.
- Chạy Lighthouse/DevTools cơ bản và regression các màn hình chính sau
  thay đổi UI.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

Các màn hình FE chính 2005, 2007, 2013, 2016, 2017, 2019, 2024.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Trang web hiển thị tốt trên màn hình điện thoại; không xuất hiện
layout shift hoặc lỗi giao diện vỡ hạt. Mở rộng: có automated/manual
evidence phù hợp; lỗi phải có `code/message` nhất quán. Deliverables:
Shared UX state components và responsive fixes. HTTP convention:
`200/201` cho success; `400` validation; `401/403` auth/RBAC; `404`
resource; `409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Skeleton gây CLS nếu kích thước sai; thông báo lỗi lộ chi tiết kỹ thuật.

### `2028` - Production smoke test and final release fixes

- **Issue Id**: `2028` \| **Parent Id**: `1008`
- **Epic**: Deployment - Security & Quality \| **Estimate**: 3 giờ
  (10800s) \| **Labels**: `co-space`

**1. Mục tiêu (Objective)**

Đóng gói ứng dụng - cấu hình biến môi trường production - chạy smoke
test toàn diện và hoàn tất mã nguồn nghiệm thu.

**2. Các bước thực hiện chi tiết (Step-by-step Implementation)**

- Tạo production env checklist: DB URL, JWT secret, Cloudinary, SMTP,
  CORS origin, logging; tách secret khỏi source control.
- Build FE/BE ở chế độ production; chạy migration bằng quy trình có
  backup/rollback plan.
- Smoke test health, auth, room list/detail, availability, create
  booking, payment/admin và static assets.
- Đo API representative endpoints; mục tiêu \<300ms phải ghi rõ
  percentile/load context, không chỉ một request local.
- Freeze release candidate, sửa blocker/critical, rerun
  smoke/regression và ghi release notes + known issues.

**3. Yêu cầu đầu vào & Tiền đề (Prerequisites / Inputs)**

2020, 2025, 2026, 2027 và hạ tầng production sẵn sàng.

**4. Tiêu chí nghiệm thu & Yêu cầu đầu ra (Acceptance Criteria &
Outputs)**

AC gốc: Hệ thống triển khai ổn định; API phản hồi \< 300ms; không có lỗi
blocker/critical tồn đọng. Mở rộng: có automated/manual evidence phù
hợp; lỗi phải có `code/message` nhất quán. Deliverables: Production
config checklist, smoke report, release notes/final fixes. HTTP
convention: `200/201` cho success; `400` validation; `401/403`
auth/RBAC; `404` resource; `409` conflict khi áp dụng.

**5. Rủi ro & Lưu ý kỹ thuật (Gotchas & Edge Cases)**

Migration không rollback, secret sai, benchmark không đại diện, smoke
pass nhưng critical regression fail.

## PHẦN III: MA TRẬN PHỤ THUỘC (DEPENDENCY MATRIX) & THỨ TỰ THI CÔNG GỢI Ý

### 1. Phân kỳ triển khai

---

Phase Mục tiêu Tasks Exit criteria

---

Phase 1 --- Repo, DB, Auth/RBAC 2001, 2002, 2003, FE/BE chạy;
Foundation 2004, 2005 migration/seed;
auth + protected
routes pass

Phase 2 --- Core Room API/UI/Admin/media/status 2006, 2007, 2008, Customer khám phá
Data & Discovery 2009, 2010 phòng; Admin quản trị
room đầy đủ

Phase 3 --- Time rules, availability, **2011**, Không double-book;
Booking Engine create, locking, booking **2012**, 2013, regression
UX/history/cancel/admin/test **2014**, overlap/concurrency
**2015**, 2016, pass
2017, 2018, 2019,
2020

Phase 4 --- Payment, state/revenue, 2021, 2022, 2023, E2E + security +
Operations & notification, dashboard, 2024, 2025, 2026, smoke pass; release
Security hardening, QA/release 2027, 2028 candidate sẵn sàng
----------------------------------------------------------------------------------------

### 2. Dependency Matrix

---

Task Depends on Có thể song song Critical Path
với

---

`2001` Không có task kỹ --- No
thuật bắt buộc trước<br>
đó; cần chốt<br>
Node/npm, repo<br>
strategy và môi<br>
trường dev

`2002` 2001 --- No

`2003` 2001, 2002 --- No

`2004` 2003 2005 (sau khi No
auth contract<br>
chốt)

`2005` 2003, 2004; FE/API 2004 No
base URL và auth<br>
response contract ổn<br>
định

`2006` 2002 2003/2004 No

`2007` 2006 và FE foundation 2008 No
2001

`2008` 2002, 2004; nên có 2007 No
2006 để tái sử dụng<br>
DTO/query

`2009` 2008; cần Cloudinary 2010 No
account/credentials

`2010` 2008 và Booking 2009 No
schema 2002; nên hoàn<br>
thành query booking<br>
cơ bản

`2011` 2002; cần business 2006/2007 **YES**
timezone/giờ hoạt<br>
động được chốt

`2012` 2011, 2002; cần --- **YES**
status booking<br>
blocking được thống<br>
nhất

`2013` 2012, 2007 2014 (sau No
contract<br>
availability)

`2014` 2011, 2012, 2013 **YES**
2003/2004; cần Room<br>
price và User auth

`2015` 2014; MySQL 8/InnoDB 2016 UI **YES**
và quyền chạy<br>
transaction/raw query

`2016` 2013, 2014, 2005 2015 tests No

`2017` 2014, 2004 2018 No

`2018` 2017, 2014; cần 2017 No
cancellation policy<br>
2h

`2019` 2014, 2015, 2004; cần 2017/2018 No
chốt guest data model

`2020` 2011, 2012, 2014, --- No
2015

`2021` 2019 hoặc ít nhất 2023 No
2014 + Admin RBAC<br>
2004

`2022` 2021; cần 2023 No
state/payment<br>
semantics được chốt

`2023` 2014, 2018; cần SMTP 2021/2022 No
credential

`2024` 2022, 2012; cần dữ 2023 No
liệu booking/payment<br>
tin cậy

`2025` Các API chính 2024 No
(2003--2024) đã ổn<br>
định đủ để security<br>
review

`2026` Luồng nghiệp vụ chính 2027 No
2003--2025

`2027` Các màn hình FE chính 2026 No
2005, 2007, 2013,<br>
2016, 2017, 2019,<br>
2024

`2028` 2020, 2025, 2026, --- No
2027 và hạ tầng<br>
production sẵn sàng
---------------------------------------------------------------------------

### 3. Đường găng đề xuất

```text
2001 -> 2002 -> 2011 -> 2012 -> 2014 -> 2015 -> 2020 -> 2026 -> 2028
                 ^       ^       ^       ^
              Critical booking path: 2011 / 2012 / 2014 / 2015
```

**Giải thích:** `2011` định nghĩa invariants thời gian; `2012` biến
invariants thành availability đáng tin cậy; `2014` tạo booking và tính
tiền; `2015` bảo vệ correctness dưới concurrency. Nếu một mắt xích này
chưa ổn định, các UI/operations phía sau có thể chạy nhưng không thể coi
hệ thống booking là production-ready.

### 4. Definition of Done chung

- Code đã review, lint/build pass; unit/integration test tương ứng
  pass và không giảm coverage vùng nghiệp vụ cốt lõi.
- API có validation, authorization, error mapping và logging phù hợp;
  không lộ secret/PII nhạy cảm.
- Migration/seed chạy lại được trên môi trường sạch; thay đổi schema
  có ghi chú triển khai.
- FE có loading/error/empty state; xử lý `401/403/409` theo UX;
  responsive ở viewport mục tiêu.
- QA có test evidence cho AC; blocker/critical = 0 trước release;
  concurrency/overlap suite bắt buộc pass.
- README/API contract/release note được cập nhật khi hành vi hệ thống
  thay đổi.
