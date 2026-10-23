# CWB-42 — Kế hoạch sửa tỷ lệ sử dụng phòng

Ticket: https://nguyentien191004.atlassian.net/browse/CWB-42

## Mục tiêu và định nghĩa

Số phòng AVAILABLE hiện tại không đại diện cho inventory của cả kỳ báo cáo.
Sửa bằng lịch sử trạng thái từng phòng; cả tử và mẫu dùng cùng tập phòng và thời gian.

- Kỳ ngày/tuần, timezone và response API giữ nguyên.
- Inventory là thời gian AVAILABLE trong kỳ, từ lúc tạo phòng; giữ cơ sở 24 giờ/ngày hiện hành.
- Thời gian sử dụng chỉ tính CONFIRMED/COMPLETED giao với inventory đó.
- Bảo trì còn booking: loại phần bảo trì khỏi cả hai vế; không xóa/hủy booking, không thay đổi revenue.
- Biên `[start, end)`, không làm tròn từng khoảng; tỷ lệ làm tròn 1 chữ số. Không có inventory trả 0.
- Trạng thái cuối cùng tiếp tục hiệu lực đến khi có lần chuyển tiếp theo, kể cả trong kỳ tương lai.

## Các bước thực hiện

1. Tái hiện bằng test repository: bảo trì có booking, lịch sử bị đổi khi trạng thái hiện tại đổi,
   phòng thêm giữa kỳ và booking giao thời gian bảo trì.
2. Thêm RoomStatusHistory bằng migration additive, khóa ngoại cascade và unique index room/time.
   Backfill mỗi phòng bằng trạng thái hiện tại hiệu lực từ createdAt.
3. Ghi sự kiện đầu tiên cùng giao dịch tạo phòng. Khi cập nhật, khóa dòng phòng trước,
   chỉ ghi khi trạng thái đổi; giữ cảnh báo booking tương lai. Seed tuân thủ cùng quy tắc.
4. Đọc inventory/booking trong một giao dịch Repeatable Read. Tạo các khoảng AVAILABLE,
   clip với ngày tạo và kỳ báo cáo; dùng chung các khoảng khi tính phút đặt và phút khả dụng.
5. Unit/API tests kiểm tra phép tính, zero inventory, booking ngoài kỳ, CANCELLED/NO_SHOW,
   phân quyền và response. MySQL integration kiểm tra dữ liệu thật, phòng mới, lịch sử
   ổn định, tạo phòng có lịch sử và chuyển trạng thái không trùng sự kiện.
6. Chạy targeted tests → lint → type checks → bộ test rộng hơn → build → Prisma validation;
   kiểm tra migration trên database test riêng. Ghi rõ kết quả và blocker khi bàn giao.
7. Cập nhật tài liệu định nghĩa, backfill và rollout.

## Backfill và triển khai

Không có dữ liệu chứng minh các lần chuyển trạng thái trước nâng cấp. Giả định trạng thái
hiện tại đã tồn tại từ createdAt là một lựa chọn rõ ràng, không phải lịch sử được khôi phục.
Báo cáo trước nâng cấp có thể đổi một lần; nếu có dữ liệu bảo trì bên ngoài cần đối soát riêng.
Sau nâng cấp, thay đổi trạng thái không được sửa sự kiện quá khứ.

Sao lưu DB theo quy trình triển khai. Dừng writer cũ (backend/seed), migrate deploy,
generate Prisma client, khởi động bản mới. Kiểm tra tạo phòng, bảo trì/mở lại và KPI trước/sau.
Không chạy writer cũ song song hoặc rollback về writer không ghi lịch sử khi tiếp tục có thay đổi phòng.
Không áp dụng migration production tự động trong phạm vi task; chỉ kiểm tra trên DB test đã cấu hình.

## Phạm vi và rủi ro

Giữ React/Express/MySQL/Prisma, RBAC, giá Decimal và khóa booking. Không đổi giờ mở cửa,
luồng booking, payment, lifecycle hay API công khai. Tài liệu application-reference đã có
thay đổi của công việc khác: chỉ bổ sung mục CWB-42, giữ nguyên phần đang được sửa.

Lịch sử được đọc tới cuối kỳ để dựng khoảng; index room/time hỗ trợ truy vấn. Nếu lịch sử
tăng rất lớn, có thể tối ưu lấy trạng thái cuối trước đầu kỳ cộng sự kiện trong kỳ sau khi đo thực tế.

## Kết quả thực hiện và kiểm chứng (23/10/2026)

- Đã triển khai các bước 1–7 trong phạm vi CWB-42; một builder phụ trách persistence,
  main agent tích hợp phép tính dashboard, tài liệu và kiểm chứng cuối.
- Test tái hiện trước sửa: 4 thất bại/6, đúng các lỗi bảo trì, lịch sử và phòng mới giữa kỳ.
- `npm run test --workspace=apps/server -- --silent`: 28 file, 510/510 test đạt sau sửa.
- `npm run lint --workspace=apps/server`, `typecheck:tests`, `typecheck:prisma`: đạt.
- Prisma generate/validate đạt; migration deploy đã chạy thành công chỉ trên database test riêng.
  Integration test chạy câu backfill thật trên temporary tables và kiểm tra trạng thái/ngày tạo.
- MySQL integration: 14 file, 133/133 test đạt khi loại hai file blocker bên dưới,
  bao gồm overlap, boundary touching, concurrent booking, room management, dashboard và revenue.
  Lệnh: `npm run test:integration --workspace=apps/server -- --silent --exclude src/__tests__/booking-cancellation.integration.test.ts --exclude src/__tests__/booking-lifecycle.integration.test.ts`.
- Build TypeScript phát sinh JavaScript thành công qua `npm run build --workspace=apps/server -- --outDir <temporary-directory>`.
  Build mặc định gặp EPERM khi ghi đè `apps/server/dist/*.js` đã tồn tại.
- `git diff --check`: đạt. Giữ nguyên các thay đổi booking/client đã có trước task.

Bộ integration toàn repo chưa xanh: 7 test tại `booking-cancellation.integration.test.ts`
(1 test) và `booking-lifecycle.integration.test.ts` (6 test) dùng `Date.now() + 5h/74h`
nên tạo giờ ngoài 07:00–22:00 tại thời điểm kiểm tra. API trả 400 trước khi đến assertion
201/409. Quy tắc giờ mở cửa đang nằm trong thay đổi booking có sẵn trước CWB-42;
không sửa logic/fixture ngoài phạm vi này. Các fixture revenue bị ảnh hưởng trực tiếp bởi
schema mới đã được bổ sung lịch sử phòng và chạy đạt.

Không triển khai production hoặc đổi trạng thái Jira trong phạm vi thực hiện này.

## Kiểm chứng bản chuẩn bị commit độc lập

Trước khi push/merge, xuất riêng Git index sang thư mục tạm để loại toàn bộ thay đổi booking/client
chưa commit khỏi bản kiểm tra. Bản CWB-42 độc lập chạy đạt:

- Toàn bộ unit tests backend: 28 file, 500/500 test.
- Toàn bộ integration tests MySQL backend: 16 file, 159/159 test, không exclude file nào.
- Server lint, typecheck:tests, typecheck:prisma và production build mặc định: đạt.

Các blocker giờ mở cửa và quyền ghi dist ghi ở trên thuộc workspace có thay đổi khác/bản build cũ;
chúng không xuất hiện trên bản CWB-42 độc lập. Các thay đổi ngoài task được giữ nguyên ở workspace.
