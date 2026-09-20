# Independent Review: CWB-17

## 1. Acceptance Criteria

| AC | Result | Evidence |
|---|---|---|
| AC1: Upload ảnh thành công lên Cloudinary | PARTIAL | Endpoint multipart, validation và adapter Cloudinary đã được nối tại `apps/server/src/routes/admin.route.ts`, `apps/server/src/services/room-image.service.ts` và `apps/server/src/services/cloudinary-media.service.ts`. Tuy nhiên các test HTTP/service hiện spy trực tiếp `cloudinaryMediaService.uploadImage`; không có test adapter `upload_stream` và review này không có credentials để chạy live Cloudinary smoke test. |
| AC2: URL ảnh được lưu vào `room_images` | PARTIAL | `RoomRepository.appendImages` ghi `imageUrl`/`publicId` bằng `createMany` trong transaction (`apps/server/src/repositories/room.repository.ts:328-369`). Có integration test cho persistence và append-vs-append, nhưng suite MySQL không chạy được trong review vì thiếu `TEST_DATABASE_URL`; đồng thời finding HIGH bên dưới cho thấy image PATCH-vs-append chưa được serialize. |
| AC3: Có loading state khi upload | PASS | Form đặt `aria-busy`, hiển thị “Đang tải ảnh...” và disable các controls tại `apps/client/src/pages/AdminPage.tsx:767` và `apps/client/src/pages/AdminPage.tsx:1033-1120`. Targeted UI test pass, bao gồm deferred upload/loading state. |

## 2. Findings

### [HIGH] Image-only PATCH không dùng cùng room lock nên có thể tạo nhiều ảnh primary

**Severity:** High

**Location:** `apps/server/src/repositories/room.repository.ts:213-314`, đặc biệt `updateWithRelations`; đối chiếu `appendImages` tại `apps/server/src/repositories/room.repository.ts:337-360`

**Problem:**

`appendImages` khóa row `rooms` bằng `SELECT ... FOR UPDATE` trước khi đọc primary hiện tại, nhưng `updateWithRelations` không lấy cùng lock trước khi đọc/reconcile ảnh. Với PATCH chỉ chứa `images`, `scalarUpdate` rỗng nên nhánh `tx.room.update` tại dòng 245-250 cũng không tạo row lock gián tiếp. Schema không có constraint bảo đảm chỉ một `is_primary` cho mỗi phòng.

**Evidence:**

- `updateRoomSchema` cho phép request chỉ có `images`, nên đây là public API path hợp lệ.
- `updateWithRelations` đọc `existingImages` tại dòng 268-271 rồi quyết định delete/update/insert từ snapshot đó, không có locking read trên room.
- `appendImages` chỉ serialize với request khác cũng đi qua `appendImages`; integration test hiện tại chỉ chạy append-vs-append.
- `RoomImage` chỉ có index `roomId`, không có database invariant ngăn hai row primary.

**Why it matters:**

Hai admin request hợp lệ có thể làm hỏng invariant primary-image. Kết quả cover image trở nên phụ thuộc ordering fallback thay vì trạng thái quản trị đã chọn, và các lần PATCH/upload sau tiếp tục làm việc trên dữ liệu đã không nhất quán.

**Reproduction / Scenario:**

1. Bắt đầu với room chưa có ảnh.
2. Transaction PATCH `{ images: [{ imageUrl: manualUrl, isPrimary: true }] }` đọc `existingImages = []` nhưng chưa insert.
3. Request upload chạy `appendImages`, lấy room lock, thấy chưa có primary, insert ảnh Cloudinary với `isPrimary = true`, rồi commit.
4. PATCH tiếp tục insert `manualUrl` từ quyết định dựa trên snapshot cũ với `isPrimary = true`.
5. Room có hai primary images.

**Recommended Fix:**

Mọi transaction mutate `room_images` của một room phải lấy cùng row lock trước khi đọc state ảnh. Với `updateWithRelations`, lấy `SELECT id FROM rooms WHERE id = ? FOR UPDATE` trước bước reconcile (ít nhất khi `data.images !== undefined`), sau đó mới đọc `existingImages` và ghi thay đổi. Giữ lock order nhất quán giữa PATCH và append để tránh deadlock.

**Regression Test Needed:** YES — thêm MySQL integration test có synchronization/barrier để ép interleaving image-only PATCH-vs-append trên room rỗng, rồi assert đúng một primary và state cuối nhất quán. Chỉ dùng `Promise.all` không bảo đảm tái hiện race một cách deterministic.

### [MEDIUM] Retry sau upload lỗi bỏ qua các chỉnh sửa form và có thể báo sai create success

**Severity:** Medium

**Location:** `apps/client/src/pages/AdminPage.tsx:395-420`, `apps/client/src/pages/AdminPage.tsx:460-472`, `apps/client/src/pages/AdminPage.tsx:496-504`

**Problem:**

Mọi upload failure, kể cả trong edit flow, đều gọi `setPersistedRoomId(targetRoomId)`. Sau khi lỗi, controls được bật lại và người dùng có thể sửa metadata, amenities hoặc URL ảnh. Nhưng lần submit kế tiếp đi vào `if (persistedRoomId)` và bỏ qua cả `createRoom` lẫn `updateRoom`, nên các chỉnh sửa mới bị silently ignored. `isCreateFlow` cũng coi bất kỳ `persistedRoomId` nào là create; nếu người dùng xóa hết pending files rồi submit, form đóng ngay và hiển thị “Tạo phòng mới thành công!” dù đây có thể là edit flow và thay đổi mới chưa được lưu.

**Evidence:**

- Dòng 395 đặt `isCreateFlow = !editingRoomId || Boolean(persistedRoomId)`.
- Dòng 409-411 bỏ qua metadata persistence khi `persistedRoomId` có giá trị.
- Dòng 496-504 đặt `persistedRoomId` sau mọi upload error, không phân biệt create/edit.
- Dòng 460-472 coi không còn pending files là hoàn tất thành công.
- Test retry hiện tại chỉ xác nhận create không bị gọi lần hai; không thay đổi form sau lỗi và không bao phủ edit-upload failure.

**Why it matters:**

UI cho phép nhập thay đổi nhưng không persist, sau đó có thể đóng form với success message. Đây là silent data-loss ở cấp thao tác người dùng và làm trạng thái/list refresh sai cho edit flow.

**Reproduction / Scenario:**

1. Mở edit room, chọn file và submit; PATCH metadata thành công nhưng upload thất bại.
2. Sau khi controls bật lại, đổi tên phòng hoặc chỉnh danh sách URL; có thể đồng thời xóa pending file.
3. Submit lại.
4. `persistedRoomId` làm code bỏ qua `updateRoom`; nếu còn file thì chỉ upload, nếu không còn file thì đóng form ngay. Tên/URL mới không được lưu; trường hợp không còn file còn hiển thị create-success và reset pagination như create flow.

**Recommended Fix:**

Tách rõ `createdRoomIdForUploadRetry` khỏi edit state và giữ loại flow ban đầu độc lập với retry ID. Với edit, nếu form thay đổi sau upload failure thì PATCH lại trước khi retry; hoặc khóa các field metadata và chỉ cho phép retry/cancel cho snapshot đã commit. Với create đã persist, nếu cho phép sửa form thì update room đã tạo trước khi upload lại. Success copy/pagination phải dựa trên original create/edit flow, không dựa vào sự tồn tại của retry ID.

**Regression Test Needed:** YES — test cả create và edit: upload fail, sửa field rồi retry; assert update phù hợp được gọi và giá trị được persist. Thêm case edit fail rồi xóa hết pending files; không được báo create-success hoặc silently discard dirty form.

### [LOW] README mô tả sai folder và error code của endpoint upload

**Severity:** Low

**Location:** `README.md:407`, `README.md:415`

**Problem:**

README ghi folder `cospace/rooms/<roomId>` và error code `413 LIMIT_FILE_SIZE`, trong khi code dùng `co-space/rooms/<roomId>` và response code `FILE_TOO_LARGE`. README cũng mô tả cleanup là luôn xóa “sạch sẽ”, trong khi implementation là best-effort và tự swallow/log lỗi destroy.

**Evidence:**

- Folder thực tế: `apps/server/src/services/cloudinary-media.service.ts:27`.
- Error response thực tế: `apps/server/src/middlewares/error.middleware.ts:13-20`.
- `destroyImage` catch và không rethrow tại `apps/server/src/services/cloudinary-media.service.ts:66-75`.

**Why it matters:**

Tài liệu API/vận hành không khớp behavior thật, gây nhầm khi kiểm tra Media Library hoặc tích hợp client dựa trên error code.

**Reproduction / Scenario:**

Upload file lớn hơn 5 MiB và quan sát JSON trả về `code: "FILE_TOO_LARGE"`; asset hợp lệ được đặt dưới `co-space/rooms/...`, không phải path README ghi.

**Recommended Fix:**

Đồng bộ README với folder `co-space/rooms/<roomId>`, error code `FILE_TOO_LARGE`, và mô tả cleanup là compensating best-effort có logging khi provider delete thất bại.

**Regression Test Needed:** NO — cập nhật tài liệu theo constants/behavior hiện có; API test đã assert `FILE_TOO_LARGE`.

## 3. Tests Missing / Weak

- Thiếu unit test cho `CloudinaryMediaService` thực sự gọi `uploader.upload_stream`, đọc `secure_url`/`public_id`, map provider failure thành `502`, và destroy asset khi provider result vượt giới hạn. Các test hiện tại spy adapter nên không chứng minh AC1 qua SDK boundary.
- Chưa có live Cloudinary smoke test; vì vậy không thể xác nhận credentials/config/folder thực hoạt động end-to-end.
- `admin-room-image.integration.test.ts` bị loại khỏi `npm test` bởi `apps/server/vitest.config.ts:9`; cần chạy riêng bằng `test:integration`. Trong review này command riêng dừng ở setup vì thiếu `TEST_DATABASE_URL`, nên persistence/locking test chưa thực thi.
- Integration concurrency chỉ cover append-vs-append. Thiếu PATCH-images-vs-append và PATCH-vs-PATCH để chứng minh primary invariant trên mọi write path.
- Retry UI test chỉ cover create failure rồi retry nguyên trạng. Thiếu edit failure và dirty-form/remove-file cases mô tả trong finding MEDIUM.
- Test “DB append fails” mock `appendImages` reject trước mọi mutation; nó chứng minh Cloudinary cleanup call nhưng không chứng minh transaction rollback không để lại row bán phần sau một database mutation.

## 4. Out-of-Scope Changes

- `.gitignore:27-30` thêm rule ignore toàn bộ `.ai-workflow/tasks/*`. Thay đổi này không được liệt kê trong implementation report và không cần cho CWB-17; nó cũng khiến chính `review-01.md` cùng task artifacts bị Git ignore. Cần xác nhận đây có phải quyết định workflow có chủ đích hay không trước khi giữ lại.
- Không thấy migration/schema change hoặc thay đổi auth/RBAC ngoài scope. Các dependency Multer/Cloudinary, cấu hình, backend/frontend upload, tests và README còn lại phù hợp approved plan.

## 5. Verification Observations

- Đã inspect `git status`, `git diff --stat`, full tracked diff, toàn bộ file mới untracked liên quan, surrounding repository/service/validator/schema/API code và tests.
- `npm run test --workspace=apps/server -- src/__tests__/admin-room-image.test.ts src/__tests__/image-signature.test.ts`: PASS, 27/27.
- `npm run test --workspace=apps/client -- src/__tests__/AdminPage.test.tsx`: PASS, 19/19.
- `npm test`: PASS, client 81/81 và server 200/200 (281 total). Lưu ý server default suite loại integration tests.
- `npm run lint`: PASS.
- `npm run typecheck --workspace=apps/client`: PASS.
- `npm run typecheck:tests --workspace=apps/server`: PASS.
- `npm run typecheck:prisma --workspace=apps/server`: PASS.
- `npm run build`: PASS. Vite chỉ phát cảnh báo annotation trong dependency Zod; build vẫn thành công.
- `npm run test:integration --workspace=apps/server -- src/__tests__/admin-room-image.integration.test.ts`: NOT RUN TO COMPLETION / environment blocker. Suite fail ở setup trước khi collect tests vì `TEST_DATABASE_URL must point to a separate MySQL database ending in _test`; 0 tests executed.
- Không chạy live Cloudinary smoke test vì không có verified test credentials trong scope/environment.
- `git diff --check` không báo whitespace error; chỉ có cảnh báo Git về LF/CRLF cho một số file.

## 6. Review Conclusion

`CHANGES REQUIRED`

Happy path upload, validation, RBAC, DTO hiding và loading UI có coverage tốt, nhưng cần sửa race primary-image giữa PATCH và append, cùng state retry silently bỏ qua thay đổi form. Sau khi fix, bổ sung regression tests tương ứng và chạy MySQL integration suite với test database riêng trước final verification.
