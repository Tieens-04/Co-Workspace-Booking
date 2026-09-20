# Implementation Report: CWB-17

## 1. Implementation Summary

Đã hoàn thành triển khai tính năng tích hợp Multer và Cloudinary SDK để Admin upload trực tiếp nhiều ảnh cho phòng làm việc (task CWB-17) theo đúng approved plan (`.ai-workflow/tasks/CWB-17/plan.md`) và các quy tắc kiến trúc Clean Architecture của dự án.

Các thành phần chính đã hoàn thành:
- **Backend Infrastructure & Configuration**: Cài đặt `multer`, `cloudinary`, `@types/multer`. Khởi tạo cấu hình Cloudinary từ biến môi trường (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`), có kiểm tra runtime và fail-fast.
- **Security & Dual Validation**: Xây dựng `image-signature.util.ts` kiểm tra magic bytes cho JPEG, PNG, WebP kết hợp Multer memory storage filter với giới hạn 10 files và 5MB/file. Tuyệt đối không tin tưởng MIME type hoặc filename từ client gửi lên.
- **Service & Compensating Rollback**: Thiết kế `cloudinaryMediaService` làm adapter độc lập; `roomImageService` xử lý upload tuần tự lên folder `cospace/rooms/<roomId>`. Nếu xảy ra lỗi giữa chừng (trong batch hoặc khi lưu database), hệ thống thực hiện rollback bù tự động xóa toàn bộ asset vừa upload trên Cloudinary, không để lại file mồ côi.
- **Concurrency & Database Row-Locking**: `roomRepository.appendImages` sử dụng raw SQL parameterized `SELECT id FROM rooms WHERE id = ? FOR UPDATE` trong Prisma transaction để chống race condition khi gán ảnh chính (`is_primary`) giữa các request đồng thời. DTO phản hồi công khai loại bỏ trường `public_id`.
- **Preserve Metadata trên Update**: Cải tiến `updateWithRelations` trong `room.repository.ts` và `admin-room.service.ts` để bảo tồn `public_id` của các ảnh Cloudinary hiện có khi admin cập nhật metadata hoặc URL ảnh thủ công, đồng thời tự động xóa asset Cloudinary sau khi commit transaction nếu ảnh bị gỡ bỏ.
- **Frontend Admin Integration**: Bổ sung chức năng chọn file trực tiếp (Cloudinary) trên `AdminPage.tsx`, tách biệt state `pendingImageFiles`, hiển thị loading indicator với `aria-busy` và `aria-live="polite"`, vô hiệu hóa các nút điều khiển trong lúc upload. Xử lý kịch bản lỗi với cơ chế retry: phòng đã tạo được lưu lại (`persistedRoomId`), nút submit chuyển thành "Thử lại tải ảnh", tránh tạo trùng lặp phòng khi retry.

---

## 2. Acceptance Criteria Implementation

| AC | Implementation | Status |
|---|---|---|
| **AC1: Upload ảnh thành công lên Cloudinary** | Xây dựng middleware Multer memory storage (`room-image-upload.middleware.ts`), kiểm tra MIME type & Magic Bytes (`image-signature.util.ts`), upload tuần tự lên Cloudinary với folder `cospace/rooms/<roomId>` (`cloudinary-media.service.ts`, `room-image.service.ts`). Nếu batch upload lỗi giữa chừng, toàn bộ ảnh vừa upload trong batch được cleanup hủy bỏ ngay lập tức. | **COMPLETED** |
| **AC2: URL ảnh được lưu vào bảng room_images** | `room.repository.ts` bổ sung phương thức `appendImages` thực thi trong Prisma transaction có khóa hàng `SELECT ... FOR UPDATE`. Lưu bản ghi nguyên tử vào `room_images` với `room_id`, `image_url` (`secure_url`), `public_id`, và tính toán `is_primary` tất định. Nếu DB fail, cơ chế rollback bù xóa sạch các asset Cloudinary tương ứng. Response DTO `RoomDetail` công khai không bao giờ để lộ `public_id`. | **COMPLETED** |
| **AC3: Có loading state khi upload** | Trong `AdminPage.tsx`, thêm state `isUploadingImages`, `pendingImageFiles`, `imageUploadError`. Khi upload, form hiển thị `aria-busy="true"`, submit button hiển thị "Đang tải ảnh...", indicator `uploading-indicator` với `aria-live="polite"`. Toàn bộ controls (inputs, nút Hủy, nút đóng, nút submit) bị disabled. Nếu upload lỗi, giữ form mở, hiển thị thông báo lỗi `role="alert"`, giữ pending files và cho phép retry gọi trực tiếp upload bằng `persistedRoomId` mà không gọi tạo phòng lần hai. | **COMPLETED** |

---

## 3. Files Changed

| File | Change | Reason | Planned? |
|---|---|---|---|
| `apps/server/package.json` | Thêm runtime `multer`, `cloudinary` và dev dependency `@types/multer`. | Phục vụ upload file và tích hợp Cloudinary SDK theo Jira. | YES |
| `package-lock.json` | Cập nhật lockfile monorepo cho các gói mới cài đặt. | Đảm bảo reproducibility bằng npm workspaces. | YES |
| `apps/server/.env.example` | Bổ sung `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. | Tài liệu hóa biến môi trường cần thiết mà không để lộ credentials. | YES |
| `apps/server/src/config/env.config.ts` | Thêm validation và export cho các biến cấu hình Cloudinary. | Fail-fast khi thiếu cấu hình Cloudinary lúc server khởi động. | YES |
| `apps/server/src/config/cloudinary.config.ts` | Khởi tạo và cấu hình Cloudinary SDK v2 từ `envConfig`. | Đóng gói cấu hình SDK độc lập với business layer. | YES (New) |
| `apps/server/src/utils/image-signature.util.ts` | Định nghĩa magic bytes detector cho JPEG, PNG, WebP cùng các hằng số kích thước/số lượng file. | Kiểm tra an toàn tệp tin, chống giả mạo extension. | YES (New) |
| `apps/server/src/middlewares/room-image-upload.middleware.ts` | Multer memory storage middleware cho field `images` với fileFilter và limits. | Boundary xử lý multipart form data an toàn trong bộ nhớ. | YES (New) |
| `apps/server/src/middlewares/error.middleware.ts` | Bổ sung mapper cho `MulterError` (`LIMIT_FILE_SIZE` -> 413, lỗi khác -> 400). | Chuẩn hóa lỗi upload file theo chuẩn JSON API của dự án. | YES |
| `apps/server/src/services/cloudinary-media.service.ts` | Adapter bọc Cloudinary SDK (`uploadImage`, `destroyImage`, `destroyManyImages`). | Tách biệt hạ tầng Cloudinary, cho phép mock và inject trong tests. | YES (New) |
| `apps/server/src/repositories/room.repository.ts` | Thêm `appendImages` với row lock `SELECT FOR UPDATE` và deterministic primary logic; cập nhật `updateWithRelations` để reconcile ảnh (bảo tồn `publicId` và trả về `removedPublicIds`). | Đảm bảo tính toàn vẹn dữ liệu, chống race condition và không làm mất metadata ảnh Cloudinary. | YES |
| `apps/server/src/services/admin-room.service.ts` | Export `toRoomDetailDto`, gọi cleanup xóa Cloudinary asset sau commit transaction khi admin cập nhật bỏ bớt ảnh. | Giữ đồng bộ tài nguyên lưu trữ ngoài với database. | YES |
| `apps/server/src/services/room-image.service.ts` | Service nghiệp vụ upload ảnh phòng: validate phòng, check signature, upload Cloudinary, append DB và rollback bù khi lỗi. | Business logic layer cho tác vụ upload ảnh phòng. | YES (New) |
| `apps/server/src/controllers/admin-room-image.controller.ts` | Controller xử lý request `POST /api/v1/admin/rooms/:id/images`. | HTTP endpoint handler cho upload ảnh phòng. | YES (New) |
| `apps/server/src/routes/admin.route.ts` | Mount route `POST /rooms/:id/images` với params validator và Multer middleware. | Định tuyến API quản trị. | YES |
| `apps/server/eslint.config.js` | Khai báo `Express: 'readonly'` trong globals. | Tránh lỗi `no-undef` cho namespace `Express.Multer.File`. | YES (Deviation nhỏ) |
| `apps/server/src/__tests__/support/setup.ts` | Cung cấp dummy Cloudinary env variables cho unit tests. | Giúp test suite chạy độc lập không cần Cloudinary account thật. | YES |
| `apps/server/src/__tests__/support/integration-setup.ts` | Cung cấp dummy Cloudinary env variables cho integration tests. | Hỗ trợ integration setup nhất quán. | YES |
| `apps/server/src/__tests__/image-signature.test.ts` | 11 unit tests kiểm tra nhận diện magic byte và từ chối các file giả mạo/hỏng. | Xác minh tính an toàn của utility kiểm tra tệp tin. | YES (New) |
| `apps/server/src/__tests__/admin-room-image.test.ts` | 16 tests toàn diện cho Service & Supertest Controller (auth, validation, compensation, limits). | Chứng minh AC1, AC2 và các invariants nghiệp vụ. | YES (New) |
| `apps/server/src/__tests__/admin-room-image.integration.test.ts` | Integration tests cho MySQL transaction và concurrency primary assignment. | Xác minh tính toàn vẹn khi ghi cơ sở dữ liệu thật. | YES (New) |
| `apps/server/src/__tests__/admin-room.test.ts` | Cập nhật mock repository `updateWithRelations` để tương thích interface mới. | Tránh regression trong test suite hiện có của admin room. | YES |
| `apps/server/src/__tests__/config.test.ts` | Thêm assertions cho việc validate các biến môi trường Cloudinary. | Đảm bảo env validation hoạt động chính xác. | YES |
| `apps/client/src/services/admin-room.api.ts` | Bổ sung method `uploadRoomImages` gửi `FormData` với `Content-Type: undefined`. | Kết nối API multipart từ client. | YES |
| `apps/client/src/types/admin-room.ts` | Thêm hằng số file upload và kiểu `imageUpload` error. | Type safety phía client. | YES |
| `apps/client/src/pages/AdminPage.tsx` | UI chọn file trực tiếp, danh sách pending files, loading state `aria-busy`, orchestration create -> upload -> retry. | Đảm bảo AC3 và trải nghiệm quản trị không trùng lặp phòng. | YES |
| `apps/client/src/index.css` | Styles cho upload section, pending files list, upload indicator. | Đảm bảo giao diện nhất quán, responsive. | YES |
| `apps/client/src/__tests__/AdminPage.test.tsx` | 5 test cases chuyên biệt cho CWB-17 (selection, loading/aria-busy, create->upload, failure retry, edit->upload). | Chứng minh AC3 và flow quản trị phía frontend. | YES |
| `README.md` | Tài liệu hóa các biến môi trường Cloudinary và mô tả chi tiết endpoint `POST /api/v1/admin/rooms/:id/images`. | Cập nhật tài liệu dự án theo mục 12 AGENTS.md. | YES |

---

## 4. Tests Added / Updated

| Test File & Case | Behavior proven |
|---|---|
| `apps/server/src/__tests__/image-signature.test.ts` | Nhận diện chính xác signature của file JPEG (SOI marker `FF D8 FF`), PNG (`89 50 4E 47 0D 0A 1A 0A`), WebP (`RIFF....WEBP`); từ chối các buffer rỗng, buffer giả mạo (PDF, GIF, text), buffer bị cắt ngắn. |
| `apps/server/src/__tests__/admin-room-image.test.ts` > Unit & HTTP API (16 tests) | - Bắt buộc xác thực admin (`401 UNAUTHORIZED` khi thiếu token, `403 FORBIDDEN` với role `CUSTOMER`).<br>- Kiểm tra path parameter (`400 VALIDATION_ERROR` nếu ID không phải UUID, `404 ROOM_NOT_FOUND` nếu phòng không tồn tại).<br>- Validate payload file (`400` khi không có file, sai field name, file sai signature).<br>- Xử lý giới hạn dung lượng (`413 LIMIT_FILE_SIZE` khi file > 5MB).<br>- Upload tuần tự lên Cloudinary folder `cospace/rooms/<roomId>`.<br>- Tự động set `is_primary = true` cho file đầu tiên nếu phòng chưa có ảnh, giữ nguyên `is_primary = false` cho ảnh tiếp theo nếu phòng đã có ảnh chính.<br>- **Compensating Rollback**: Tự động gọi `destroyManyImages` dọn dẹp các asset Cloudinary vừa tạo nếu có lỗi trong quá trình upload batch hoặc lỗi database transaction.<br>- **Security Invariant**: Response DTO không bao giờ chứa trường `public_id`. |
| `apps/server/src/__tests__/admin-room-image.integration.test.ts` | Khóa hàng MySQL `SELECT FOR UPDATE` ngăn chặn double primary khi hai batch đồng thời upload vào cùng một phòng. Kiểm tra lưu trữ nguyên tử vào bảng `room_images`. |
| `apps/client/src/__tests__/AdminPage.test.tsx` > Direct Room Image Upload to Cloudinary (5 tests) | - Quản lý chọn file, kiểm tra client-side định dạng (JPEG/PNG/WebP) và dung lượng (tối đa 5MB), xóa file pending.<br>- **AC3 Loading state**: Form có `aria-busy="true"`, nút submit chuyển thành "Đang tải ảnh...", indicator `aria-live="polite"`, các nút điều khiển bị vô hiệu hóa.<br>- Tạo phòng trước (`createRoom`), nhận `id`, upload ảnh (`uploadRoomImages`) với `roomId` mới và chuyển về trang 1.<br>- **Retry without duplicate**: Khi upload thất bại, form mở nguyên vẹn, giữ pending files; nhấn "Thử lại tải ảnh" chỉ gọi upload lại vào ID đã tạo mà không gọi `createRoom` lần 2.<br>- Upload file khi chỉnh sửa phòng hiện có (`updateRoom` rồi `uploadRoomImages`) và giữ nguyên trang phân trang hiện tại. |

---

## 5. Verification Results

| Check | Command | Result |
|---|---|---|
| **Targeted tests (Server)** | `npm run test --workspace=apps/server -- src/__tests__/admin-room-image.test.ts src/__tests__/image-signature.test.ts` | **PASS** (27/27 tests passed) |
| **Targeted tests (Client)** | `npm run test --workspace=apps/client -- src/__tests__/AdminPage.test.tsx` | **PASS** (19/19 tests passed) |
| **Relevant/full tests (Client)** | `npm run test --workspace=apps/client` | **PASS** (8 test files, 81/81 tests passed) |
| **Relevant/full tests (Server)** | `npm run test --workspace=apps/server` | **PASS** (8 test files, 200/200 tests passed) |
| **Full monorepo tests** | `npm test` | **PASS** (16 test files, 281/281 tests passed) |
| **Lint** | `npm run lint` | **PASS** (0 errors, 0 warnings across workspaces) |
| **Typecheck (Client)** | `npm run typecheck --workspace=apps/client` | **PASS** (tsc noEmit clean) |
| **Typecheck:tests (Server)** | `npm run typecheck:tests --workspace=apps/server` | **PASS** (tsc tests clean) |
| **Typecheck:prisma (Server)** | `npm run typecheck:prisma --workspace=apps/server` | **PASS** (tsc prisma clean) |
| **Production Build** | `npm run build` | **PASS** (Client Vite build + Server tsc build succeeded) |
| **Prettier Formatting** | `npx prettier --check "apps/**/*.{ts,tsx,js,jsx,json,md,css}" README.md` | **PASS** (All touched files formatted) |

---

## 6. Deviations From Plan

- Trong `apps/server/eslint.config.js`: Đã bổ sung `Express: 'readonly'` vào `languageOptions.globals` để ESLint nhận diện đúng kiểu namespace toàn cục `Express.Multer.File` do gói `@types/multer` mở rộng, loại bỏ cảnh báo `no-undef` mà không làm thay đổi các quy tắc linter khác.
- Trong `AdminPage.test.tsx`: Sử dụng `fireEvent.change` thay vì `userEvent.type` đối với các trường văn bản của modal phòng nhằm tránh xung đột tiêu điểm (focus conflict) với hiệu ứng tự động focus vào tiêu đề form (`requestAnimationFrame`), giúp test suite thực thi ổn định và độc lập với môi trường chạy.

---

## 7. Remaining Risks

- Khi cập nhật thông tin phòng (`PATCH /api/v1/admin/rooms/:id`) có kèm xóa bớt ảnh Cloudinary: Tác vụ xóa asset trên Cloudinary được thực hiện bất đồng bộ sau khi database transaction đã commit thành công (`destroyManyImages`). Nếu kết nối mạng tới Cloudinary gặp sự cố tại thời điểm đó, asset trên Cloudinary có thể bị mồ côi (tuy nhiên tính toàn vẹn dữ liệu nghiệp vụ của phòng trong MySQL được bảo toàn hoàn toàn). Rủi ro này đã được ghi log an toàn có gắn prefix `[Cloudinary Cleanup Warning]` để đội ngũ vận hành theo dõi.

---

## 8. Blockers

- Không có blocker. Tất cả các yêu cầu chấp thuận (AC1, AC2, AC3) và các tiêu chuẩn kỹ thuật kiểm thử đều đã được xác minh đầy đủ.

---

## End condition

**IMPLEMENTATION COMPLETE - READY FOR INDEPENDENT REVIEW**
