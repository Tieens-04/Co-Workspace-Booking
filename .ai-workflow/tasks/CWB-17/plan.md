# Implementation Plan: CWB-17 - Implement Cloudinary image upload for rooms

## 1. Goal

Cho phép `ADMIN` chọn và upload trực tiếp nhiều file ảnh từ form quản trị phòng. Backend phải xác thực file, upload ảnh lên Cloudinary, lưu `secure_url` cùng `public_id` vào `room_images`, trả lại `RoomDetail` theo contract hiện tại và không để lại ảnh Cloudinary mồ côi khi bước ghi database thất bại. Giao diện phải thể hiện rõ trạng thái đang upload, chặn submit lặp và cho phép retry khi upload lỗi.

Giải pháp giữ nguyên các API JSON tạo/cập nhật phòng hiện tại; bổ sung một endpoint multipart dành riêng cho ảnh của phòng đã tồn tại. Form tạo phòng sẽ tạo dữ liệu phòng trước để nhận `roomId`, sau đó gọi endpoint upload trong cùng luồng UI.

## 2. Acceptance Criteria Mapping

| AC | Expected behavior | Relevant area | Verification |
|---|---|---|---|
| AC1 | Admin gửi nhiều file ảnh hợp lệ qua multipart; backend upload chúng vào folder Cloudinary của phòng và chỉ dùng kết quả `secure_url`/`public_id` do Cloudinary trả về. Nếu một upload trong batch lỗi, các ảnh đã upload trong batch được cleanup và không ghi DB. | Cloudinary config/adapter, Multer middleware, admin image route/controller/service | Unit test adapter/service với Cloudinary mock; API test multipart; manual smoke test với Cloudinary credentials thật và kiểm tra asset trong Cloudinary Media Library. |
| AC2 | Sau khi cả batch upload thành công, các bản ghi tương ứng được tạo nguyên tử trong `room_images` với đúng `room_id`, `image_url`, `public_id`, `is_primary`; response công khai không lộ `public_id`. Nếu DB fail thì xóa bù các asset vừa upload. | `RoomImage` model hiện có, `room.repository.ts`, room-image service | MySQL integration test với media adapter giả lập; query trực tiếp `room_images`; test DB failure gọi cleanup và không để row bán phần. |
| AC3 | Trong lúc request upload đang chạy, UI hiển thị thông báo/loading rõ ràng, đặt vùng form ở `aria-busy`, vô hiệu hóa submit/đóng/chọn lại file để tránh request trùng; lỗi được hiển thị và file đã chọn được giữ để retry. | `AdminPage.tsx`, admin API client/types, CSS | React Testing Library dùng deferred promise để kiểm tra loading/disabled/`aria-busy`, success, failure và retry không tạo lại phòng. |

## 3. Current State

- Monorepo dùng npm workspaces theo `package.json` và README; frontend là React/Vite/Axios, backend là Express/TypeScript/Prisma/MySQL. `package-lock.json` là lockfile phù hợp với hướng dẫn npm hiện tại.
- `apps/server/prisma/schema.prisma` đã có quan hệ `Room.images` và model `RoomImage` ánh xạ bảng `room_images`. Model đã có đủ `imageUrl VARCHAR(500)`, nullable `publicId`, `isPrimary`, `createdAt` và cascade theo `roomId`; migration ban đầu cũng đã tạo đủ cột/index này.
- API admin được mount dưới `/api/v1/admin` sau `verifyToken` và `checkRole([Role.ADMIN])`. Hiện có `GET /rooms`, `POST /rooms` JSON và `PATCH /rooms/:id` JSON; chưa có endpoint multipart.
- `createRoomSchema`/`updateRoomSchema` nhận danh sách URL `{ imageUrl, isPrimary }`, bắt URL HTTP(S), không trùng và đúng một primary nếu có ảnh. `RoomRepository` hiện tạo ảnh URL với `publicId: null`; update ảnh đang xóa toàn bộ rồi tạo lại, vì vậy sẽ làm mất `publicId` nếu áp dụng nguyên trạng cho ảnh Cloudinary.
- `RoomImage.publicId` không được select/trả ra DTO công khai. `mapImages` chỉ trả `id`, `imageUrl`, `isPrimary`, đúng yêu cầu không lộ định danh quản trị Cloudinary.
- `AdminPage` có form create/edit dùng chung và chỉ quản lý danh sách URL thủ công. `isSubmitting` hiện bao phủ request lưu phòng, nhưng chưa có state upload file, input `multiple`, retry upload hoặc multipart API client.
- `apiClient` đặt mặc định `Content-Type: application/json`; request upload phải bỏ/override header này để Axios/browser tự tạo multipart boundary.
- Backend chưa cài `multer`, `cloudinary` hoặc typings của Multer; `env.config.ts` và `.env.example` chưa có Cloudinary variables.
- Error middleware hiện xử lý `AppError`, Prisma unique conflict và JSON parse error; chưa chuẩn hóa `MulterError`/lỗi file upload.
- Test hiện có bao phủ CRUD admin, auth/RBAC, relation transaction và UI URL ảnh. Chưa có fixture/file upload, Cloudinary mock hoặc test ghi `public_id` khác null.
- Tài liệu kỹ thuật của repo cho task 2009 yêu cầu giới hạn count/MIME/size, không tin MIME khai báo, upload có kiểm soát concurrency, lưu `secure_url`/`public_id`, cleanup asset mồ côi và loading state.

## 4. Proposed Changes

1. Cài đúng các dependency được Jira yêu cầu: runtime `multer`, `cloudinary`; dev dependency `@types/multer`. Cập nhật `apps/server/package.json` và `package-lock.json` bằng npm workspace, không đổi framework/version lớn.
2. Bổ sung cấu hình Cloudinary từ environment và một adapter có interface nhỏ để upload buffer/xóa theo `public_id`. Adapter che SDK khỏi business service và cho phép inject fake trong tests.
3. Bổ sung Multer memory-storage middleware cho field multipart `images`, với giới hạn count/size và allowlist MIME. Sau lớp Multer, kiểm tra magic bytes của buffer cho JPEG/PNG/WebP trước khi gọi Cloudinary; không dùng `originalname` để tạo đường dẫn.
4. Bổ sung `POST /api/v1/admin/rooms/:id/images`:
   - `Content-Type: multipart/form-data`;
   - field file là `images`, có thể lặp nhiều lần;
   - route vẫn nằm sau auth/RBAC admin;
   - `:id` dùng schema UUID hiện có;
   - success `201` theo response envelope hiện tại, `data` là `RoomDetail` mới nhất.
5. Room-image service xác minh phòng tồn tại trước khi gọi Cloudinary; upload batch theo concurrency giới hạn; nếu bất kỳ file/upload nào lỗi thì xóa bù các asset đã tạo. Chỉ sau khi toàn batch thành công mới gọi repository transaction để append các row.
6. Repository lock row phòng trong transaction trước khi kiểm tra ảnh/ghi batch để hai request upload song song không cùng tự gán primary. Nếu phòng chưa có primary, ảnh đầu tiên của batch trở thành primary; nếu đã có primary, toàn bộ ảnh mới là secondary. Sau insert, query lại `RoomDetailRecord` theo ordering hiện tại.
7. Nếu transaction ghi DB lỗi sau upload, service gọi cleanup cho toàn bộ `public_id` vừa tạo rồi chuyển lỗi qua error middleware. Cleanup không được log credentials hoặc raw SDK response.
8. Điều chỉnh update relation ảnh hiện tại từ “delete all/recreate all” sang reconcile theo URL trong cùng transaction: URL còn giữ lại phải giữ nguyên row/id/`publicId`, URL mới thủ công có `publicId = null`, URL bị bỏ mới bị xóa. Danh sách `publicId` bị loại được trả nội bộ để service xóa asset Cloudinary sau commit. Việc này ngăn một PATCH thông tin phòng làm mất metadata Cloudinary. Cleanup sau commit là best-effort có log đã sanitize; không báo PATCH thất bại sau khi DB đã commit.
9. Frontend giữ hỗ trợ URL ảnh hiện có và thêm vùng chọn nhiều file. State file pending tách khỏi `formData.images`. Khi lưu:
   - không có file: giữ flow hiện tại;
   - create: tạo phòng trước, lấy `data.id`, rồi upload file;
   - edit: lưu metadata/URL trước, rồi upload vào `editingRoomId`;
   - nếu create thành công nhưng upload lỗi, chuyển form sang trạng thái edit của room vừa tạo và nút retry chỉ gọi lại upload, không POST tạo phòng lần hai.
10. Sau upload thành công, dùng `RoomDetail` trả về để đồng bộ danh sách ảnh, đóng/reset form và refresh danh sách phòng. Trong lúc upload, hiển thị text riêng “Đang tải ảnh...”, `aria-busy`, và disable các action có thể phát sinh request/trạng thái cạnh tranh.
11. Cập nhật README và `.env.example` với contract endpoint, giới hạn file, biến môi trường và hướng dẫn smoke test không chứa giá trị secret.

## 5. Backend

### Route / API contract

- Endpoint mới: `POST /api/v1/admin/rooms/:id/images`.
- Request:
  - Authorization: Bearer token hiện tại; chỉ role `ADMIN`.
  - `Content-Type: multipart/form-data`.
  - Repeated file field: `images`.
  - Không nhận `roomId`, URL, `publicId`, folder hoặc role từ body.
- Middleware order:
  1. auth/RBAC hiện có ở `/admin` router;
  2. `validateParams(getRoomByIdParamsSchema)`;
  3. Multer `array('images', MAX_ROOM_IMAGE_FILES)`;
  4. controller.
- Response success: `201`, envelope `sendSuccess`, `data: RoomDetail`. DTO tiếp tục không có `publicId`.
- Error mapping dự kiến:
  - `400 VALIDATION_ERROR`: UUID sai, không có file, field name sai/không mong đợi, MIME/signature không hợp lệ, vượt số file;
  - `401 UNAUTHORIZED`, `403 FORBIDDEN`: middleware hiện tại;
  - `404 ROOM_NOT_FOUND`: UUID hợp lệ nhưng không có phòng;
  - `413 FILE_TOO_LARGE`: vượt giới hạn byte/file;
  - `502 IMAGE_UPLOAD_FAILED`: Cloudinary từ chối/timeout sau khi đã cleanup phần thành công;
  - `500 INTERNAL_SERVER_ERROR`: lỗi persistence bất ngờ sau cleanup.

### Validation and upload safety

- Multer dùng `memoryStorage`; không ghi tên file từ client xuống filesystem.
- Allowlist ban đầu: `image/jpeg`, `image/png`, `image/webp`; kiểm tra cả MIME khai báo và magic bytes. Mismatch bị từ chối trước Cloudinary.
- Dùng constants tập trung cho max count và max bytes/file để middleware, frontend helper text và tests cùng một policy. Giá trị kế hoạch mặc định được ghi ở Assumptions.
- Folder Cloudinary cố định phía server: `co-space/rooms/<roomId>`. SDK dùng `resource_type: 'image'`, `secure_url`, generated public ID; không cho client override transformation/folder/public ID.
- Upload theo worker pool nhỏ hoặc tuần tự; không `Promise.all` không giới hạn. Theo dõi chính xác các upload đã thành công để cleanup khi batch fail.

### Controller / service / repository flow

- Controller chỉ lấy `req.params.id`, chuẩn hóa `req.files`, gọi room-image service và gửi response.
- Room-image service:
  1. từ chối mảng file rỗng;
  2. gọi repository xác minh room;
  3. kiểm tra signature từng buffer;
  4. upload tất cả file với bounded concurrency;
  5. map kết quả SDK thành internal input `{ imageUrl: secure_url, publicId, isPrimary }`;
  6. gọi transaction append;
  7. nếu bước 4 hoặc 6 lỗi, destroy các `publicId` đã tạo theo best effort rồi throw `AppError` phù hợp;
  8. map record sang `RoomDetail` bằng mapper hiện có.
- Repository append transaction:
  1. lock row `rooms` bằng parameterized Prisma tagged raw query `SELECT ... FOR UPDATE`;
  2. nếu không có row, throw `ROOM_NOT_FOUND`;
  3. kiểm tra có primary hiện hữu hay chưa;
  4. `createMany` toàn batch với URL/publicId từ server và primary deterministic;
  5. đọc lại theo `roomDetailSelect` và return.
- `updateWithRelations` phải preserve row/publicId của URL không đổi, thay vì blanket delete/recreate. Nếu interface cần trả cả record và removed IDs, dùng một internal result type; controller/DTO không thay đổi.

### Transaction / concurrency / integrity

- Cloudinary không thể tham gia MySQL transaction, nên dùng saga nhỏ: upload ngoài DB -> transaction insert -> compensating delete nếu transaction fail.
- Không giữ transaction DB mở trong khi chờ network Cloudinary.
- Lock room row chỉ diễn ra trong transaction insert ngắn để serialize quyết định primary của các batch đồng thời.
- Một batch DB insert là all-or-nothing. Không để một phần rows của batch tồn tại.
- URL/publicId luôn lấy từ SDK response, không lấy từ body; publicId chỉ tồn tại ở internal record/repository/adapter.

## 6. Frontend

### Page / component and state

- Mở rộng image section trong `AdminPage.tsx` thay vì tạo page/architecture mới.
- Giữ `formData.images` cho các URL đã lưu/manual theo flow CWB-16; thêm state riêng:
  - `pendingImageFiles: File[]`;
  - `isUploadingImages: boolean`;
  - `imageUploadError: string | null`;
  - `persistedRoomId: string | null` để retry sau create thành công;
  - upload `AbortController`/request identity ref để bỏ qua stale response khi unmount.
- File input có `multiple`, `accept="image/jpeg,image/png,image/webp"`, label nhìn thấy được và helper text về type/count/size. Hiển thị tên/kích thước hoặc số file đã chọn; cho xóa file pending trước khi submit.

### API integration

- Thêm `adminRoomApi.uploadRoomImages(roomId, files, signal?)`:
  - tạo `FormData`, append mỗi file với key `images`;
  - xóa/override JSON content type của Axios instance để browser/Axios tạo multipart boundary đúng;
  - tiếp tục dùng interceptor Authorization hiện có;
  - return `ApiResponse<RoomDetail>`.
- Không gửi `publicId`, URL Cloudinary hoặc room ownership data từ client.

### Submit orchestration and states

- Chạy client validation cho metadata và file count/size/type trước request; server vẫn authoritative.
- Create:
  1. POST JSON tạo phòng;
  2. lưu ID trả về vào `persistedRoomId`/`editingRoomId` trước khi upload;
  3. nếu có pending files, chuyển text/loading sang upload và gọi endpoint mới;
  4. nếu upload lỗi, giữ form mở, báo rõ phòng đã được tạo nhưng ảnh chưa upload; retry dùng ID đã lưu, không tạo phòng mới.
- Edit:
  1. PATCH metadata/URL nếu có thay đổi;
  2. upload pending files vào room hiện có;
  3. nếu upload lỗi, giữ form và pending files để retry, không rollback metadata đã commit và không nói toàn bộ thao tác thất bại.
- Success cuối cùng: clear pending files/errors, reset persisted ID, close form, show success banner và refresh đúng page (create về page 1, edit giữ page hiện tại như behavior hiện có).
- Trong `isSubmitting || isUploadingImages`: disable close/cancel/submit/file modifications; form dùng `aria-busy=true`; trạng thái upload nằm trong vùng `aria-live="polite"`. Error là `role="alert"` và liên kết qua `aria-describedby` với input file.

### Stale request / race prevention

- Chỉ cho một upload request của form chạy tại một thời điểm.
- Abort request phía client khi page unmount; kiểm tra request identity trước khi set state. Không cho đóng/chuyển create-edit trong lúc request đang chạy.
- Network timeout sau khi server đã commit có thể làm client không biết kết quả; trước retry ở edit có thể refetch room detail để đồng bộ UI. Idempotency key bền vững cần schema/store mới nên không nằm trong task này.

## 7. Data Model

- Dùng nguyên model `RoomImage`/bảng `room_images` hiện có:
  - `roomId` lấy từ URL và kiểm tra room tồn tại;
  - `imageUrl` nhận từ Cloudinary `secure_url`;
  - `publicId` nhận từ Cloudinary `public_id` để cleanup;
  - `isPrimary` được server quyết định;
  - `createdAt` dùng default DB.
- Expected write: append một row cho mỗi file sau khi toàn batch Cloudinary thành công. Existing read qua `roomDetailSelect`, `mapImages`, room list cover image tiếp tục hoạt động.
- Transaction required: **YES**, cho batch insert/primary decision và cho reconcile ảnh ở PATCH.
- Migration required: **NO**. Schema/migration hiện tại đã đủ; không sửa hay tạo migration.

## 8. Authorization & Security

- Endpoint mới phải nằm trong admin router hiện được bảo vệ server-side. Test đủ no token `401`, CUSTOMER `403`, ADMIN success.
- Không tin `roomId`, `publicId`, URL, MIME hoặc filename do client cung cấp. Room ID chỉ lấy từ validated path; role chỉ lấy từ JWT đã verify.
- `.strict()` JSON validators hiện tại vẫn ngăn mass assignment; multipart endpoint chỉ đọc files và path param, không map tùy ý `req.body` sang Prisma.
- Credentials chỉ đọc từ `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`; thêm placeholder vào `.env.example`, không log/return giá trị.
- Memory upload phải có hard limit count/size để chống memory exhaustion. File signature phải khớp allowlist trước upload.
- Folder/public ID do server xác định; không dùng original filename để tránh path/key injection.
- Error response không trả raw SDK error, stack, credentials hoặc public IDs. Log chỉ gồm error code/context tối thiểu như room ID và số lượng file.
- API response công khai tiếp tục loại `publicId`; thêm regression assertion.

## 9. Files Expected To Change

### Expected modified files

| File | Planned change | Reason |
|---|---|---|
| `apps/server/package.json` | Thêm `cloudinary`, `multer`, `@types/multer`. | Dependency trực tiếp do Jira yêu cầu. |
| `package-lock.json` | Lock dependency mới bằng npm workspace. | Repo/README xác định npm là package manager hiện hành. |
| `apps/server/.env.example` | Document ba Cloudinary variables bằng placeholder. | Setup reproducible, không chứa secret. |
| `apps/server/src/config/env.config.ts` | Đọc/validate Cloudinary configuration. | Fail fast cho cấu hình bắt buộc. |
| `apps/server/src/routes/admin.route.ts` | Đăng ký multipart upload endpoint với params validation và upload middleware. | HTTP entry point admin. |
| `apps/server/src/repositories/room.repository.ts` | Internal `publicId` select/input, append transaction + row lock; reconcile ảnh khi PATCH để preserve publicId và báo removed IDs nội bộ. | Persistence, atomicity và tránh mất metadata/orphan. |
| `apps/server/src/services/admin-room.service.ts` | Thích nghi result của update/reconcile và cleanup managed assets bị bỏ sau commit. | Giữ CRUD URL hiện tại tương thích với ảnh Cloudinary. |
| `apps/server/src/middlewares/error.middleware.ts` | Map Multer/file limit errors sang error envelope/status ổn định. | Không để validation upload rơi thành generic 500. |
| `apps/server/src/__tests__/support/setup.ts` | Set Cloudinary dummy env cho unit/API tests. | Env validation không phụ thuộc credential thật. |
| `apps/server/src/__tests__/support/integration-setup.ts` | Set Cloudinary dummy env cho integration tests dùng adapter fake. | Không gọi network thật trong automated suite. |
| `apps/server/src/__tests__/admin-room.test.ts` | Regression cho update ảnh preserve metadata/CRUD contract nếu phù hợp với cách tách test. | Bảo vệ flow CWB-16. |
| `apps/server/src/__tests__/admin-room.integration.test.ts` | Regression transaction/reconcile hiện có hoặc chuyển case liên quan sang file image integration mới. | Xác minh persistence thật. |
| `apps/client/src/services/admin-room.api.ts` | Thêm multipart upload method. | API integration. |
| `apps/client/src/types/admin-room.ts` | Thêm types/state/error cho file upload; không đưa publicId vào client contract. | Type-safe form/API. |
| `apps/client/src/pages/AdminPage.tsx` | File selection, create/edit orchestration, upload loading/error/retry/stale request handling. | AC3 và end-to-end admin flow. |
| `apps/client/src/index.css` | Style vùng chọn file, selected files, loading/error, responsive layout. | UX và mobile không overflow. |
| `apps/client/src/__tests__/AdminPage.test.tsx` | Mock upload API; test multipart-triggering flow, loading, failure/retry, no duplicate create. | Frontend behavior evidence. |
| `README.md` | Document env, endpoint, limits, response/error behavior và smoke test. | Setup/API behavior thay đổi. |

### Expected new files

| File | Planned change | Reason |
|---|---|---|
| `apps/server/src/config/cloudinary.config.ts` | Khởi tạo/configure SDK từ validated ENV. | Tách infrastructure config khỏi controller/business logic. |
| `apps/server/src/middlewares/room-image-upload.middleware.ts` | Multer memory storage, field/count/size/MIME policy. | Reusable HTTP upload boundary. |
| `apps/server/src/utils/image-signature.util.ts` | Pure magic-byte validation cho JPEG/PNG/WebP. | Không tin MIME client và dễ unit test, không cần dependency thứ ba. |
| `apps/server/src/services/cloudinary-media.service.ts` | Adapter/interface upload buffer và destroy asset, hỗ trợ dependency injection. | Cô lập SDK/network và cleanup. |
| `apps/server/src/services/room-image.service.ts` | Orchestrate validation, Cloudinary batch, DB append và compensation. | Business/use-case boundary rõ ràng. |
| `apps/server/src/controllers/admin-room-image.controller.ts` | HTTP adapter cho endpoint ảnh. | Controller chỉ xử lý request/response. |
| `apps/server/src/__tests__/admin-room-image.test.ts` | API/service unit tests với Cloudinary/repository mock. | AC1, auth, validation, compensation. |
| `apps/server/src/__tests__/admin-room-image.integration.test.ts` | MySQL test ghi URL/publicId và concurrent primary với fake media adapter. | AC2 và transaction semantics thực. |
| `apps/server/src/__tests__/image-signature.test.ts` | Test magic-byte allowlist/mismatch/truncated buffers. | Security regression hẹp. |

Tên test có thể gộp vào test hiện tại nếu convention khi implement cho thấy ít duplication hơn, nhưng coverage/behavior ở trên là bắt buộc.

## 10. Files Explicitly Not Expected To Change

- `apps/server/prisma/schema.prisma` và `apps/server/prisma/migrations/**`: model hiện tại đã đủ; không migration.
- Booking/payment/check-in/notification/reporting modules: không liên quan CWB-17.
- Auth JWT/RBAC middleware và token storage strategy: endpoint chỉ tái sử dụng guard hiện có.
- Public room list/detail response shape ngoài việc tự hiển thị URL ảnh mới; không expose `publicId`.
- Room status/maintenance behavior.
- `apps/server/.env`: tuyệt đối không ghi/chỉnh secret thật.
- `pnpm-lock.yaml`: README và scripts xác định npm; không cập nhật lockfile của package manager không dùng cho task này.
- Cloudinary dashboard/account settings: chỉ document prerequisite, không thay đổi bằng code.

## 11. Edge Cases

- Request không có `images`, dùng sai field name, hoặc vượt max file count.
- File khai báo `image/jpeg` nhưng magic bytes là text/PDF/executable; buffer rỗng hoặc header bị truncate.
- File hợp lệ về loại nhưng vượt max bytes; nhiều file gần giới hạn không được làm process mất kiểm soát bộ nhớ.
- UUID path sai (`400`) và UUID đúng nhưng room không tồn tại (`404`); không gọi Cloudinary trong cả hai trường hợp.
- Cloudinary fail ở file thứ N sau khi N-1 file đã thành công: destroy N-1 asset, không insert DB.
- Tất cả Cloudinary upload thành công nhưng transaction insert fail: destroy toàn bộ asset của batch, không có row bán phần.
- Cleanup Cloudinary cũng fail: không che mất lỗi gốc; log sanitized để vận hành xử lý orphan, không trả publicId/credential.
- Room chưa có ảnh: đúng ảnh đầu batch là primary. Room đã có primary: primary cũ giữ nguyên, ảnh mới là secondary.
- Hai batch đồng thời upload vào room chưa có ảnh: row lock khiến cuối cùng chỉ một ảnh mới được chọn primary.
- PATCH scalar sau khi room có ảnh Cloudinary: bỏ qua `images` hoặc reconcile URL không đổi, không biến `publicId` thành null.
- Admin xóa một URL managed trong flow edit hiện có: DB commit trước, sau đó destroy đúng `publicId`; lỗi destroy không rollback giả một DB transaction đã commit.
- Create room thành công nhưng upload fail: UI không POST create lần nữa khi retry; room tồn tại hợp lệ không ảnh cho tới khi retry thành công.
- Component unmount hoặc user điều hướng trong lúc upload: abort/ignore stale response; không set state sau unmount.
- Response upload success nhưng refresh room list fail: vẫn báo upload thành công riêng, sau đó cho retry refresh; không upload lại asset.
- `secure_url` hoặc `public_id` không phù hợp giới hạn DB: adapter/service kiểm tra trước insert và cleanup thay vì để orphan.

## 12. Regression Risks

| Risk | Why | Mitigation / Test |
|---|---|---|
| Mất `publicId` khi admin lưu form edit | Update hiện tại delete/recreate ảnh với `publicId = null`. | Reconcile theo URL và test PATCH scalar/URL unchanged giữ row/publicId. |
| Asset Cloudinary mồ côi | External upload và DB không cùng transaction; xóa ảnh sau DB commit cũng có thể fail. | Compensation tests cho upload/DB failure, bounded cleanup retry, sanitized operational log; ghi residual risk trong docs. |
| Hai primary do upload đồng thời | Không có unique DB constraint cho `isPrimary`. | Lock room row trong transaction; integration concurrency test. |
| Multipart bị trả 500 không nhất quán | Error middleware chưa biết `MulterError`. | Explicit mapping + API tests cho count/size/type. |
| Auth bypass trước upload | Middleware order sai có thể parse/upload request của CUSTOMER. | Giữ endpoint dưới `/admin` guard; assert adapter không được gọi ở 401/403 tests. |
| Memory exhaustion | `memoryStorage` giữ buffer trong process. | Hard count/size limits, allowlist, bounded concurrency; test limits. |
| Multipart boundary sai | Axios instance mặc định JSON. | Request-specific header handling; frontend/API test kiểm tra payload là `FormData`, manual smoke. |
| Tạo phòng trùng khi upload retry | Flow create có hai request tuần tự. | Persist returned room ID before upload; retry path only calls upload; RTL assertion create called once. |
| Existing URL image CRUD bị hỏng | Thêm file upload có thể vô tình thay đổi JSON validators/replace semantics. | Giữ endpoint JSON và tests CWB-16; test manual URL + managed URL coexist. |
| Test suite đòi credential/network thật | Env validation và singleton SDK có thể làm CI fail/flaky. | Dummy env trong setup; inject mocked/fake media adapter; live Cloudinary chỉ là controlled smoke test. |

## 13. Tests

### Unit

- `image-signature.util`: nhận JPEG/PNG/WebP hợp lệ; từ chối mismatch, unsupported, empty/truncated buffer.
- Cloudinary adapter: truyền folder/resource type đúng, chỉ map `secure_url`/`public_id`, chuẩn hóa SDK error không lộ raw secret.
- Room-image service:
  - room missing không gọi upload;
  - multiple uploads success gọi repository một lần với URL/publicId đúng;
  - partial upload failure cleanup các public IDs đã thành công;
  - repository failure cleanup toàn batch;
  - cleanup failure không che lỗi gốc;
  - mapper response không có `publicId`.
- Repository/service update regression: matching URL giữ existing ID/publicId; manual URL mới có null; removed managed URL được trả cho cleanup.
- Env config: thiếu/blank Cloudinary variables fail fast; dummy valid config import được trong test.

### Integration/API

- `POST /api/v1/admin/rooms/:id/images` trả `401` không token, `403` cho CUSTOMER; media adapter/repository không chạy.
- Invalid UUID `400`, missing room `404`, no file/field sai/type sai/too many/oversize có code/status xác định.
- ADMIN multipart nhiều file success trả `201` và `RoomDetail`, không có `publicId` trong JSON.
- Với MySQL test DB và fake media adapter, query `room_images` xác minh `room_id`, secure URL, non-null public IDs, primary đúng và số row đúng.
- Simulated DB failure không để row bán phần và gọi destroy fake cho toàn batch.
- JSON create/PATCH room hiện có vẫn pass để chứng minh backward compatibility.

### Frontend

- Chọn nhiều file hiển thị danh sách/count và có thể loại file pending; client reject count/size/type trước API.
- `adminRoomApi.uploadRoomImages` tạo `FormData` với repeated key `images`, dùng đúng room ID và giữ Authorization qua interceptor.
- Deferred upload promise: hiện “Đang tải ảnh...”, `aria-busy=true`, disable submit/close/file input; resolve thì reset/refresh.
- Upload reject: `role=alert`, giữ pending files, cho retry, không đóng form.
- Create + upload success: create gọi một lần, upload dùng ID response, về page 1.
- Create success + upload failure + retry: retry không gọi create lần hai.
- Edit upload success giữ page hiện tại; không có pending file thì không gọi upload endpoint.
- Unmount/stale request không cập nhật UI.
- Existing tests cho URL validation, primary selection, create/edit payload và amenities tiếp tục pass.

### Regression

- Public room list dùng ảnh primary mới làm `coverImage`; room detail sắp primary trước như hiện tại.
- Response public/admin không leak `publicId`, `roomId`, Cloudinary credentials hoặc raw SDK error.
- PATCH chỉ đổi scalar/amenities không chạm ảnh managed.
- Manual URL (`publicId = null`) và Cloudinary image (`publicId != null`) cùng tồn tại đúng.
- Existing auth/RBAC and admin CRUD suites vẫn xanh.

### Concurrency/transaction

- Hai append transaction đồng thời vào room chưa có ảnh cuối cùng tạo đủ rows nhưng chỉ đúng một `isPrimary=true`.
- Một batch insert lỗi không tạo row bán phần.
- Test concurrency/transaction chạy ở integration config với MySQL thật, không giả lập chỉ bằng unit mock.

### Manual Cloudinary smoke

- Dùng account/test folder và file không nhạy cảm; tạo room test, upload 2 ảnh từ UI.
- Xác minh asset xuất hiện dưới folder room, API/DB có `secure_url` + `public_id`, UI kết thúc loading và gallery/list tải ảnh.
- Xóa room/test asset sau smoke bằng public ID; không chụp/log credentials.
- Nếu môi trường thực thi không có Cloudinary credentials, ghi rõ AC1 live smoke bị chặn; automated adapter/API tests không được tuyên bố thay thế hoàn toàn kiểm chứng dịch vụ thật.

## 14. Verification Commands

Repository xác định npm workspaces và các script dưới đây đã tồn tại. Chạy theo thứ tự:

```bash
# Targeted backend unit/API tests
npm run test --workspace=apps/server -- src/__tests__/admin-room-image.test.ts src/__tests__/image-signature.test.ts

# Targeted frontend tests
npm run test --workspace=apps/client -- src/__tests__/AdminPage.test.tsx src/__tests__/api.interceptor.test.ts

# Targeted MySQL integration test (requires TEST_DATABASE_URL ending in _test)
npm run test:integration --workspace=apps/server -- src/__tests__/admin-room-image.integration.test.ts

# Lint
npm run lint

# Type checks
npm run typecheck --workspace=apps/client
npm run typecheck:tests --workspace=apps/server
npm run typecheck:prisma --workspace=apps/server

# Broader automated tests
npm test

# Production build for both workspaces
npm run build

# Formatting gate
npm run format:check
```

Ngoài các command trên, thực hiện manual Cloudinary/UI smoke theo mục 13 khi có credentials thật. Không chạy integration suite vào development database; setup hiện tại bắt buộc schema test có hậu tố `_test`.

## 15. Assumptions

- npm là package manager canonical vì README yêu cầu npm, root scripts dùng npm workspaces và có `package-lock.json`; `pnpm-lock.yaml` không được dùng/cập nhật trong task.
- Security defaults chưa được Jira nêu con số: tối đa **10 file/request**, tối đa **5 MiB/file**, chỉ JPEG/PNG/WebP. Các giá trị phải là constants tập trung và được document; Human có thể đổi trước khi approve plan nếu policy sản phẩm khác.
- Ảnh đầu của batch chỉ tự thành primary khi room chưa có primary; upload mới không tự thay primary hiện tại. Jira không yêu cầu UI đổi/reorder primary cho file upload.
- Endpoint upload append ảnh, không thay thế toàn bộ gallery. JSON `images` trong create/PATCH giữ contract replace hiện có.
- Cloudinary credentials là prerequisite vận hành đã được technical guide xác nhận; automated tests dùng adapter fake, còn kiểm chứng AC1 thực cần credentials test riêng.
- `secure_url` và server-generated folder/public ID nằm trong giới hạn hiện có (`image_url` 500, `public_id` 191); service vẫn phải guard và cleanup nếu provider trả dữ liệu vượt giới hạn.

## 16. Open Questions / Blockers

- Không có blocker để bắt đầu implementation sau khi Human approve plan.
- Human nên xác nhận/chỉnh policy mặc định 10 file, 5 MiB/file, JPEG/PNG/WebP nếu có quy định sản phẩm khác. Đây là policy kỹ thuật bảo vệ upload, không thay đổi AC.
- Credentials Cloudinary thật có thể không có trong CI/local của implementer. Trường hợp đó code/tests vẫn có thể hoàn tất bằng adapter fake, nhưng live smoke AC1 phải được ghi là blocker xác minh môi trường, không được báo đã pass.

## 17. Non-goals

- Không migration hoặc đổi model/database schema.
- Không xây media library độc lập, drag-and-drop nâng cao, crop/resize editor, image transformations/CDN optimization UI.
- Không cho CUSTOMER upload ảnh và không thay auth/RBAC architecture.
- Không thêm endpoint reorder gallery hoặc business rule mới cho ảnh primary ngoài deterministic append.
- Không đổi room status, booking availability, payment, notification hoặc reporting.
- Không chuyển JWT storage, Axios architecture, React state library hoặc framework.
- Không lưu file local/server disk và không expose signed Cloudinary management operations cho browser.
- Không tạo background job/queue xử lý media; cleanup là synchronous/best-effort trong phạm vi request.
- Không chạy real Cloudinary call trong default automated test suite.

## 18. Implementation Sequence

1. Cài Multer/Cloudinary typings bằng npm workspace; cập nhật package/lockfile.
2. Thêm ENV validation, `.env.example`, Cloudinary config/adapter và unit tests adapter/config.
3. Thêm signature utility + Multer middleware + error mapping và tests validation/limits.
4. Mở rộng repository cho append transaction/row lock và reconcile giữ `publicId`; thêm MySQL integration tests.
5. Thêm room-image service với bounded upload/compensation, controller và protected route; thêm API/service tests cho success/error/RBAC.
6. Thêm frontend multipart API/types.
7. Mở rộng `AdminPage` với file state, create/edit sequencing, loading/error/retry/stale guard và CSS responsive/a11y.
8. Cập nhật/viết frontend tests, giữ toàn bộ URL-image CRUD regression xanh.
9. Cập nhật README/API/env documentation.
10. Chạy targeted tests, lint, type checks, broad tests, build, format check; sau đó chạy MySQL integration và live Cloudinary/UI smoke khi có hạ tầng.

PLAN READY FOR HUMAN APPROVAL
