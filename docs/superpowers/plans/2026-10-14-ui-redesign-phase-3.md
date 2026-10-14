# UI Redesign Phase 3 Implementation Plan — Admin Portal

> **Goal:** Hiện đại hóa toàn diện giao diện Khu vực Quản trị (Admin Portal) gồm: `AdminDashboardPage.tsx`, `AdminPage.tsx`, `AdminBookingsPage.tsx`, và `AdminGuestBookingForm.tsx` theo phong cách Modern Tech & Premium Minimalist (Linear / Vercel style). Giữ vững 100% 54 tests hiện tại của Admin, bảo đảm 0 breaking changes về API contracts, phân quyền RBAC và database schema.

---

## 1. Kiến Trúc & Thiết Kế

### Nguyên Tắc Thiết Kế
- **Nhất quán App Shell:** Đồng bộ sử dụng `AppHeader` và `AppFooter` đã hoàn thiện ở Phase 1. Header hiển thị `ADMIN` badge màu Indigo sang trọng và menu điều hướng quản trị.
- **Bảng Dữ Liệu (Modern Data Tables):** Viền hairline `1px solid var(--border-subtle)`, sticky table header với nền subtle gray `#f8fafc`, hàng table hover nhẹ nhàng (`#f1f5f9`), padding chuẩn 12px-16px, text căn chuẩn (số tiền và thao tác căn phải).
- **KPI Metrics Cards:** Bố cục CSS Grid linh hoạt, đường viền accent màu theo chủ đề (Blue cho Đặt phòng, Emerald cho Tỷ lệ lấp đầy, Amber cho Doanh thu, Violet cho Tình trạng phòng), số to đậm sắc sảo, thanh progress bar bo tròn mượt mà.
- **Modal & Warning Dialogs:** Backdrop blur `rgba(0, 0, 0, 0.45)`, modal card nổi bật bo góc `16px`, các nút bấm nguy hiểm (`btn-danger`) và cảnh báo hủy đơn / phòng bảo trì có icon `AlertTriangle` rõ ràng.
- **Bảo toàn Test Contracts:** Giữ nguyên 100% các `data-testid`, `role`, classnames legacy song song với CSS Module (`Admin.module.css`).

---

## 2. Các Task Triển Khai

### Task 1: Xây dựng `Admin.module.css` dùng chung
- **File:** `apps/client/src/pages/Admin.module.css`
- **Mục tiêu:** Cung cấp đầy đủ class styles hiện đại cho cả 4 component quản trị:
  - Layout container (`.adminPageWrapper`, `.adminContainer`)
  - Sub-navigation pills / toolbar (`.adminSubNav`, `.navPill`, `.navPillActive`)
  - KPI Cards Grid (`.kpiGrid`, `.kpiCard`, `.kpiTitle`, `.kpiValue`, `.kpiSub`, `.progressBar`)
  - Data Table Card (`.tableCard`, `.tableWrapper`, `.dataTable`, `.tableHeader`, `.tableRow`, `.tableCell`)
  - Filter / Search Bar (`.filterCard`, `.searchGroup`, `.filterInputs`)
  - Modal Overlays (`.modalOverlay`, `.modalCard`, `.modalHeader`, `.modalBody`, `.modalActions`)

### Task 2: Hiện đại hóa `AdminDashboardPage.tsx`
- **File:** `apps/client/src/pages/AdminDashboardPage.tsx`
- **Thực hiện:**
  - Tích hợp `AppHeader`, `AppFooter` và `Admin.module.css`.
  - Cải tiến giao diện 4 thẻ KPI với font số to đậm, biểu tượng và thanh tỷ lệ lấp đầy.
  - Thanh chọn lọc Hôm nay / Tuần này và Date picker dạng pill buttons tối giản.
  - Giữ nguyên 100% `data-testid` cho KPI, filter buttons và skeleton loaders.
  - Chạy `npm --prefix apps/client run test -- AdminDashboard.test.tsx` (3/3 tests pass).

### Task 3: Hiện đại hóa `AdminPage.tsx` (Room Management & Form)
- **File:** `apps/client/src/pages/AdminPage.tsx`
- **Thực hiện:**
  - Tích hợp `AppHeader`, `AppFooter` và `Admin.module.css`.
  - Bảng quản lý phòng sắc sảo: ảnh thumbnail bo góc, tags tiện ích gọn gàng, nút bấm Sửa / Đổi trạng thái tinh tế.
  - Form Thêm / Sửa phòng: chia cột rõ ràng, checklist tiện ích dạng chip cards, khu vực tải ảnh Cloudinary có preview và radio chọn ảnh đại diện.
  - Modal cảnh báo phòng có lịch đặt tương lai khi chuyển sang `MAINTENANCE` (bảo toàn flow xác nhận cảnh báo).
  - Chạy `npm --prefix apps/client run test -- AdminPage.test.tsx` (25/25 tests pass).

### Task 4: Hiện đại hóa `AdminBookingsPage.tsx` & `AdminGuestBookingForm.tsx`
- **Files:**
  - `apps/client/src/pages/AdminBookingsPage.tsx`
  - `apps/client/src/components/AdminGuestBookingForm.tsx`
- **Thực hiện:**
  - Tích hợp `AppHeader`, `AppFooter` và `Admin.module.css`.
  - Thanh tìm kiếm mã đơn, lọc theo ngày và trạng thái.
  - Bảng danh sách đơn đặt phòng với badge phân loại khách (`Khách vãng lai` vs `Khách hàng`), số tiền format chuẩn, các nút thao tác `Xác nhận TT` và `Hủy đơn`.
  - Modal xác nhận thanh toán (chọn Tiền mặt / Chuyển khoản QR).
  - Modal hủy đơn quản trị bắt buộc nhập lý do hủy.
  - Form đặt phòng cho khách vãng lai dạng collapsible card với `TimeGrid` và live pricing card.
  - Chạy `npm --prefix apps/client run test -- AdminBookingsPage.test.tsx AdminGuestBookingForm.test.tsx` (26/26 tests pass).

### Task 5: Kiểm Thử Toàn Diện, Typecheck & Build Verification
- **Thực hiện:**
  - Chạy toàn bộ 318 tests của client: `npm --prefix apps/client run test -- --maxWorkers=2`.
  - Typecheck: `npm --prefix apps/client run typecheck`.
  - Production build: `npm --prefix apps/client run build`.
  - Commit checkpoint hoàn tất Giai đoạn 3 và toàn bộ UI Redesign.
