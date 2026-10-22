# UI Redesign Phase 1: Foundation & Customer Booking Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai đại tu toàn diện giao diện người dùng (UI/UX) cho hệ thống Co-Space Working theo phong cách Modern Tech & Premium Minimalist (Linear/Vercel) cho toàn bộ luồng Khách hàng và nền tảng Design Tokens mà không phá vỡ 315 bài tests tự động hiện có.

**Architecture:** Sử dụng Design Tokens toàn cục (`index.css`) kết hợp CSS Modules (`*.module.css`) cho từng màn hình và component. Bổ sung thư viện icon vector chuẩn `lucide-react`. Đảm bảo phân tách trách nhiệm rõ ràng giữa App Shell (Header/Footer), Discovery (Trang chủ & Lọc), Booking Engine (TimeGrid & BookingForm) và History/Confirmation.

**Tech Stack:** React 19, TypeScript, Vite, React Router 7, Vanilla CSS + CSS Modules, lucide-react, Vitest, Testing Library.

**Spec:** [docs/superpowers/specs/2026-10-13-ui-redesign-customer-flow-design.md](file:///d:/Code/Project/Co-Workspace%20Booking/docs/superpowers/specs/2026-10-13-ui-redesign-customer-flow-design.md)

## Global Constraints

- Không thay đổi backend API, status codes (`409`, `400`, `401`, `403`), route contracts hoặc database schema.
- Giữ nguyên các domain invariants: slot 30 phút, thời lượng 1h–8h, đặt trước tối thiểu 30 phút, hủy trước tối thiểu 1h, server tính giá và locking chống trùng lịch.
- Giữ nguyên 100% `data-testid`, tên trường input, label associations, accessibility roles (`role="alert"`, `aria-describedby`, `aria-pressed`, `aria-label`).
- Tất cả micro-interactions phải dưới 180ms và tôn trọng `@media (prefers-reduced-motion: reduce)`.
- Mọi thay đổi code đều phải pass 100% `npm --prefix apps/client run test` (315 tests), `npm --prefix apps/client run typecheck` và `npm --prefix apps/client run build`.

## Review Focus

- Xung đột đặt lịch 409: Banner báo lỗi phải xuất hiện nổi bật, giữ nguyên input và làm mới trạng thái slot trên TimeGrid mà không crash form.
- Form review mode: Chuyển đổi giữa Bước 1 và Bước 2 không làm mất dữ liệu đã nhập và không re-fetch lặp vô tận.
- Trạng thái slot TimeGrid: Phân biệt rõ rệt giữa Available, Selected, Booked (hoa văn/icon khóa) và Past cả bằng độ tương phản màu sắc lẫn chỉ báo trực quan.
- Quy tắc hủy đơn 1 giờ: Nút hủy bị vô hiệu hóa khi đơn còn dưới 1 giờ tới lúc bắt đầu, có modal xác nhận khi bấm hủy.
- Sao chép mã booking: Nút copy hoạt động mượt mà trên BookingConfirmationPage kèm tooltip phản hồi tức thì.

---

### Task 0: Cài đặt `lucide-react` & Chuẩn hóa Hệ thống Design Tokens

**Files:**
- Modify: `apps/client/package.json`
- Modify: `apps/client/src/index.css`
- Test: `apps/client/src/__tests__/ResponsiveAndStatePolish.test.tsx`

**Interfaces:**
- Consumes: Bảng màu và tokens hiện tại
- Produces: CSS custom properties chuẩn: `--bg-canvas`, `--bg-surface`, `--bg-subtle`, `--border-subtle`, `--border-default`, `--text-main`, `--text-muted`, `--color-primary`, `--color-success`, `--color-danger`, `--color-warning`, `--radius-*`, `--shadow-*`, `--ease-spring`, `--duration-fast`.

- [ ] **Step 1: Cài đặt `lucide-react` trong `apps/client`**
  Chạy lệnh: `npm --prefix apps/client install lucide-react`
  Kiểm tra: `apps/client/package.json` có dependency `"lucide-react"`.

- [ ] **Step 2: Viết/Cập nhật Design Tokens trong `apps/client/src/index.css`**
  Đưa vào `:root` các biến màu slate/zinc, primary indigo `#4f46e5`, hairline borders, typography font stack, layered shadows, và reduced-motion media query theo đúng Spec.

- [ ] **Step 3: Kiểm tra baseline tests và typecheck**
  Run: `npm --prefix apps/client run test`
  Expected: PASS 315 tests.
  Run: `npm --prefix apps/client run typecheck`
  Expected: PASS zero errors.

- [ ] **Step 4: Commit checkpoint**
  `git add apps/client/package.json apps/client/package-lock.json apps/client/src/index.css`
  `git commit -m "feat(ui): install lucide-react and configure modern design tokens"`

---

### Task 1: Xây dựng App Shell Dùng Chung (`AppHeader` & `AppFooter`)

**Files:**
- Create: `apps/client/src/layouts/AppHeader.tsx`
- Create: `apps/client/src/layouts/AppHeader.module.css`
- Create: `apps/client/src/layouts/AppFooter.tsx`
- Create: `apps/client/src/layouts/AppFooter.module.css`
- Modify: `apps/client/src/App.tsx` (hoặc tích hợp vào các trang hiện tại)
- Test: `apps/client/src/__tests__/RouteGuard.test.tsx`, `apps/client/src/__tests__/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth` hook (`isAuthenticated`, `principal`, `logout`), `Link`, `useNavigate`
- Produces: Header sticky kính mờ `backdrop-filter: blur(12px)`, logo brand với icon `Boxes`, navigation menu cho guest & customer & admin, footer chân trang.

- [ ] **Step 1: Viết test cho `AppHeader` xác nhận hiển thị đúng trạng thái đăng nhập**
  Tạo test xác thực hiển thị avatar/tên khi đã đăng nhập, link "Lịch sử đặt phòng" cho CUSTOMER, "Khu vực Quản trị" cho ADMIN, nút Đăng nhập/Đăng ký khi chưa xác thực.

- [ ] **Step 2: Tạo `AppHeader.tsx` & `AppHeader.module.css`**
  Triển khai Header 64px với CSS Modules: Logo `Boxes`, user profile chip, role badge, nút Đăng xuất với icon `LogOut`. Giữ các `role`, text và class link tương thích với assertion của test.

- [ ] **Step 3: Tạo `AppFooter.tsx` & `AppFooter.module.css`**
  Hiển thị footer tối giản với bản quyền Co-Space Working và múi giờ Việt Nam (+07:00).

- [ ] **Step 4: Chạy test kiểm tra Header**
  Run: `npm --prefix apps/client run test`
  Expected: PASS.

- [ ] **Step 5: Commit checkpoint**
  `git add apps/client/src/layouts/`
  `git commit -m "feat(ui): create shared AppHeader and AppFooter components"`

---

### Task 2: Đại tu Trang Chủ & Bộ Lọc Khám Phá Phòng (`HomePage` & `RoomDiscovery`)

**Files:**
- Modify: `apps/client/src/pages/HomePage.tsx`
- Create: `apps/client/src/pages/HomePage.module.css`
- Modify: `apps/client/src/components/RoomOverviewGrid.tsx`
- Create: `apps/client/src/components/RoomOverviewGrid.module.css`
- Test: `apps/client/src/__tests__/RoomDiscovery.test.tsx`

**Interfaces:**
- Consumes: `normalizeRoomSearchParams`, `validateRoomFilterInputs`, `roomApi`, `AppHeader`, `AppFooter`
- Produces: Sidebar bộ lọc sticky với icon `SlidersHorizontal`, ô tìm kiếm sức chứa/giá/tiện ích, Room Card với tỉ lệ ảnh 16:10, hover scale, badge trạng thái, skeleton shimmer loading.

- [ ] **Step 1: Kiểm tra baseline `RoomDiscovery.test.tsx`**
  Run: `npx vitest run apps/client/src/__tests__/RoomDiscovery.test.tsx`
  Expected: PASS.

- [ ] **Step 2: Tạo `HomePage.module.css` và `RoomOverviewGrid.module.css`**
  Định hình layout 2 cột hiện đại: Sidebar bộ lọc viền mảnh bên trái, lưới phòng thoáng đãng bên phải. Thêm hiệu ứng Shimmer skeleton cho loading, empty state card cho kết quả rỗng.

- [ ] **Step 3: Tái cấu trúc `HomePage.tsx` và `RoomOverviewGrid.tsx`**
  - Thay thế emoji bằng `lucide-react` (`SlidersHorizontal`, `RotateCcw`, `Users`, `Coins`, `ArrowRight`, `SearchX`, `ChevronLeft`, `ChevronRight`).
  - Tích hợp `AppHeader` và `AppFooter`.
  - Giữ nguyên các `id` (`capacity-filter`, `min-price-filter`, `max-price-filter`), `aria-describedby`, error alerts và format giá tiền.

- [ ] **Step 4: Chạy test xác nhận không phá vỡ hành vi lọc và phân trang**
  Run: `npx vitest run apps/client/src/__tests__/RoomDiscovery.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit checkpoint**
  `git add apps/client/src/pages/HomePage.* apps/client/src/components/RoomOverviewGrid.*`
  `git commit -m "feat(ui): redesign HomePage and RoomOverviewGrid with modern minimal aesthetics"`

---

### Task 3: Đại tu Trang Chi Tiết Phòng (`RoomDetailPage`)

**Files:**
- Modify: `apps/client/src/pages/RoomDetailPage.tsx`
- Modify: `apps/client/src/pages/RoomDetailPage.module.css`
- Test: `apps/client/src/__tests__/RoomDetailPage.test.tsx`

**Interfaces:**
- Consumes: `useParams`, `roomApi.getById`, `BookingForm`
- Produces: Layout 2 cột bất đối xứng (60% Trái: Breadcrumbs, Gallery, Thông số, Tiện ích, Mô tả; 40% Phải: Sticky Booking Widget).

- [ ] **Step 1: Kiểm tra baseline `RoomDetailPage.test.tsx`**
  Run: `npx vitest run apps/client/src/__tests__/RoomDetailPage.test.tsx`
  Expected: PASS.

- [ ] **Step 2: Hoàn thiện `RoomDetailPage.module.css`**
  Định hình phân cấp thị giác theo Spec: Cột trái rộng rãi với ảnh lớn bo góc 12px, lưới amenities có viền mảnh và icon vector; Cột phải ghim widget đặt phòng tự động bám theo khi cuộn.

- [ ] **Step 3: Cập nhật `RoomDetailPage.tsx`**
  - Tích hợp icon `lucide-react` (`Users`, `Sparkles`, `Clock`, `ArrowLeft`, `AlertTriangle`).
  - Giữ nguyên các badge `Khả dụng` và `Bảo trì`, các text assert và thông báo lỗi.

- [ ] **Step 4: Chạy test xác nhận `RoomDetailPage.test.tsx`**
  Run: `npx vitest run apps/client/src/__tests__/RoomDetailPage.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit checkpoint**
  `git add apps/client/src/pages/RoomDetailPage.*`
  `git commit -m "feat(ui): polish RoomDetailPage with asymmetric sticky layout and amenity icons"`

---

### Task 4: Nâng cấp Bảng Chọn Khung Giờ 30 Phút (`TimeGrid`)

**Files:**
- Modify: `apps/client/src/components/TimeGrid.tsx`
- Modify: `apps/client/src/components/TimeGrid.module.css`
- Test: `apps/client/src/__tests__/TimeGrid.test.tsx`

**Interfaces:**
- Consumes: `slots`, `selectedRange`, `onSlotClick`, `disabled`
- Produces: Lưới slot 30 phút sắc nét, 4 trạng thái chuẩn A11y & Contrast: Available, Selected (Indigo-600), Booked (gạch chéo + icon khóa), Past. Hỗ trợ bàn phím (Tab, Enter, Space).

- [ ] **Step 1: Kiểm tra baseline `TimeGrid.test.tsx`**
  Run: `npx vitest run apps/client/src/__tests__/TimeGrid.test.tsx`
  Expected: PASS.

- [ ] **Step 2: Cập nhật `TimeGrid.module.css`**
  Áp dụng micro-interaction phản hồi nhanh `< 150ms`, viền phân cách mỏng, hiệu ứng hover nhẹ, pattern gạch chéo cho slot đã đặt (`Booked`).

- [ ] **Step 3: Tinh chỉnh `TimeGrid.tsx`**
  Tích hợp icon khóa nhỏ cho slot đã đặt, bổ sung `focus-visible` ring sắc sảo cho keyboard navigation, giữ nguyên `aria-pressed`, `aria-label` và các click handler.

- [ ] **Step 4: Chạy test xác nhận `TimeGrid.test.tsx`**
  Run: `npx vitest run apps/client/src/__tests__/TimeGrid.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit checkpoint**
  `git add apps/client/src/components/TimeGrid.*`
  `git commit -m "feat(ui): polish TimeGrid slot states and keyboard accessibility"`

---

### Task 5: Nâng cấp Form Đặt Phòng & Bước Xem Lại (`BookingForm` & `BookingSummary`)

**Files:**
- Modify: `apps/client/src/components/BookingForm.tsx`
- Modify: `apps/client/src/components/BookingSummary.tsx`
- Modify: `apps/client/src/components/BookingForm.module.css`
- Test: `apps/client/src/__tests__/BookingForm.test.tsx`

**Interfaces:**
- Consumes: `roomId`, `pricePerHour`, `TimeGrid`, `useRoomAvailability`
- Produces: Quy trình đặt phòng 2 bước mượt mà: (1) Chọn giờ & Live Pricing Card, (2) Review BookingSummary. Xử lý lỗi 409 xung đột bằng Rose banner và cảnh báo bảo trì.

- [ ] **Step 1: Kiểm tra baseline `BookingForm.test.tsx` (35 tests)**
  Run: `npx vitest run apps/client/src/__tests__/BookingForm.test.tsx`
  Expected: PASS 35 tests.

- [ ] **Step 2: Cập nhật `BookingForm.module.css`**
  Thiết kế Live Pricing Estimate Card như hóa đơn mini sắc sảo. Định dạng banner lỗi 409 xung đột nổi bật. Nút CTA to rõ với micro-interaction tinh tế.

- [ ] **Step 3: Cập nhật `BookingForm.tsx` và `BookingSummary.tsx`**
  - Tích hợp icon `lucide-react` (`Calendar`, `Clock`, `CreditCard`, `AlertCircle`, `CheckCircle2`, `ArrowRight`, `Edit3`).
  - Giữ nguyên 100% dữ liệu form khi chuyển đổi qua lại giữa Edit và Review mode.
  - Bảo toàn toàn bộ các assert test cho lỗi 409 `BOOKING_CONFLICT` và `ROOM_NOT_AVAILABLE`.

- [ ] **Step 4: Chạy lại toàn bộ 35 tests của `BookingForm.test.tsx`**
  Run: `npx vitest run apps/client/src/__tests__/BookingForm.test.tsx`
  Expected: PASS 35 tests.

- [ ] **Step 5: Commit checkpoint**
  `git add apps/client/src/components/BookingForm.* apps/client/src/components/BookingSummary.*`
  `git commit -m "feat(ui): modernize BookingForm 2-step checkout and live pricing estimate card"`

---

### Task 6: Nâng cấp Màn Hình Xác Nhận Đặt Chỗ (`BookingConfirmationPage`)

**Files:**
- Modify: `apps/client/src/pages/BookingConfirmationPage.tsx`
- Create: `apps/client/src/pages/BookingConfirmationPage.module.css`
- Test: `apps/client/src/__tests__/BookingConfirmationPage.test.tsx` (hoặc test tương ứng)

**Interfaces:**
- Consumes: `useLocation` state (booking info, booking code)
- Produces: Thẻ vé điện tử (Digital Ticket Card) cao cấp: Icon `CheckCircle2`, mã code `CS-YYYYMMDD-XXXX` font monospace có nút Sao chép mã (`Copy`), tóm tắt chi phí và các nút điều hướng.

- [ ] **Step 1: Tạo `BookingConfirmationPage.module.css`**
  Định hình giao diện Boarding Pass / Receipt card thanh lịch với viền nét đứt (dashed divider) giữa phần mã vé và phần thông tin chi tiết.

- [ ] **Step 2: Cập nhật `BookingConfirmationPage.tsx`**
  - Tích hợp tính năng Sao chép mã đặt phòng vào clipboard với tooltip phản hồi *"Đã sao chép"*.
  - Thay thế icon vector: `CheckCircle2`, `Copy`, `Check`, `Calendar`, `Clock`, `ArrowRight`.
  - Tích hợp `AppHeader` và `AppFooter`.

- [ ] **Step 3: Chạy test xác nhận**
  Run: `npm --prefix apps/client run test`
  Expected: PASS.

- [ ] **Step 4: Commit checkpoint**
  `git add apps/client/src/pages/BookingConfirmationPage.*`
  `git commit -m "feat(ui): transform BookingConfirmationPage into a digital ticket receipt"`

---

### Task 7: Nâng cấp Lịch Sử Đặt Phòng & Chi Tiết Đơn (`BookingHistoryPage` & `BookingDetailPage`)

**Files:**
- Modify: `apps/client/src/pages/BookingHistoryPage.tsx`
- Create: `apps/client/src/pages/BookingHistoryPage.module.css`
- Modify: `apps/client/src/pages/BookingDetailPage.tsx`
- Create: `apps/client/src/pages/BookingDetailPage.module.css`
- Test: `apps/client/src/__tests__/BookingHistoryPage.test.tsx`

**Interfaces:**
- Consumes: `bookingApi.getMyBookings`, `bookingApi.cancelBooking`, `bookingApi.getById`
- Produces: Bộ lọc tabs trạng thái đơn, danh sách đơn dạng hàng thẻ sắc sảo, hệ thống badge màu chuẩn, modal xác nhận hủy an toàn và áp dụng quy tắc 1 giờ.

- [ ] **Step 1: Kiểm tra baseline `BookingHistoryPage.test.tsx`**
  Run: `npx vitest run apps/client/src/__tests__/BookingHistoryPage.test.tsx`
  Expected: PASS.

- [ ] **Step 2: Tạo CSS Modules cho History & Detail pages**
  Định hình cấu trúc bảng/thẻ dữ liệu căn lề số tiền sang phải chuẩn tài chính, hệ badge trạng thái (`CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`), modal popup xác nhận hủy.

- [ ] **Step 3: Cập nhật `BookingHistoryPage.tsx` và `BookingDetailPage.tsx`**
  - Bổ sung nút Hủy đơn có kiểm tra quy tắc 1 giờ: disable khi còn dưới 1 tiếng kèm tooltip giải thích.
  - Modal xác nhận hủy an toàn tránh thao tác nhầm.
  - Tích hợp `AppHeader` và `AppFooter`.

- [ ] **Step 4: Chạy test xác nhận `BookingHistoryPage.test.tsx`**
  Run: `npx vitest run apps/client/src/__tests__/BookingHistoryPage.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit checkpoint**
  `git add apps/client/src/pages/BookingHistoryPage.* apps/client/src/pages/BookingDetailPage.*`
  `git commit -m "feat(ui): modernize BookingHistoryPage and BookingDetailPage with status tabs and safe cancel flow"`

---

### Task 8: Toàn Diện Kiểm Thử, A11y Audit & Build Verification

**Files:**
- Run: Vitest suite (315 tests)
- Run: TypeScript check
- Run: Vite build

- [ ] **Step 1: Chạy toàn bộ 315 tests trong client**
  Run: `npm --prefix apps/client run test`
  Expected: **315 passed (22 test files)**.

- [ ] **Step 2: Kiểm tra TypeScript Typecheck**
  Run: `npm --prefix apps/client run typecheck`
  Expected: **Zero errors**.

- [ ] **Step 3: Chạy Production Build**
  Run: `npm --prefix apps/client run build`
  Expected: **Build thành công** không có lỗi cú pháp hay import gãy.

- [ ] **Step 4: Commit checkpoint hoàn tất Giai đoạn 1**
  `git commit -am "chore(release): complete Phase 1 UI redesign with 100% passing tests and build"`
