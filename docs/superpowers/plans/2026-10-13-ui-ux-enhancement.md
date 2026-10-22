# UI/UX & Micro-Interactions Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng cấp toàn diện giao diện người dùng (UI/UX), phân cấp thị giác và micro-interactions cho hệ thống Co-Workspace-Booking, đảm bảo tính chuyên nghiệp, rõ ràng, tinh tế mà không phá vỡ 315 tests tự động và các quy tắc nghiệp vụ cốt lõi.

**Architecture:** Sử dụng kiến trúc CSS Modules (`*.module.css`) kết hợp Design Tokens toàn cục (`index.css`) để giải quyết vấn đề CSS nguyên khối 44KB. Ứng dụng bộ 5 skills chuyên biệt: `Impeccable` (Bố cục & Thẩm mỹ), `emil-design-eng` (Micro-interactions), `review-animations` (Rà soát chuyển động), `web-design-guidelines` (A11y/Usability), và `vercel-react-best-practices` (Tối ưu React 19).

**Tech Stack:** React 19, TypeScript, Vite, React Router 7, Vanilla CSS + CSS Modules, Vitest, Testing Library.

**Spec:** [AGENTS.md](file:///d:/Code/Project/Co-Workspace%20Booking/AGENTS.md), [.ai-workflow/rules/domain-review.md](file:///d:/Code/Project/Co-Workspace%20Booking/.ai-workflow/rules/domain-review.md).

## Global Constraints

- Không thay đổi stack: Giữ nguyên React 19 + TypeScript + Vite + Vanilla CSS / CSS Modules. Không cài thêm Tailwind, shadcn, Framer Motion, GSAP.
- Không sửa đổi bất kỳ backend API, route contract, status code (`409`, `400`, `401`, `403`) hay database schema.
- Giữ nguyên các domain invariants: slot 30 phút, thời lượng 1h–8h, múi giờ Việt Nam (+07:00), server tính giá và double-booking locking.
- Tuyệt đối không giả lập giữ chỗ (fake hold timer/countdown) khi chưa có sự xác nhận từ server.
- Mọi thay đổi code đều phải pass 100% `npm run typecheck` và 315 bài test trong `npm run test` của `apps/client`.

## Review Focus

1. **TimeGrid slot selection:** Thao tác chọn slot không bị giật layout, không làm lag focus, phân biệt rõ các trạng thái (Trống, Đã đặt, Bảo trì, Đang chọn) cả bằng màu sắc lẫn icon/aria-label.
2. **BookingForm state preservation:** Chuyển đổi qua lại giữa bước "Chọn/Chỉnh sửa" và "Xem lại tóm tắt (Review)" phải giữ nguyên 100% dữ liệu đã nhập mà không kích hoạt re-fetch availability không cần thiết.
3. **Concurrency 409 handling:** Khi có lỗi xung đột đặt phòng (đã có người đặt trước), banner thông báo lỗi phải hiển thị nổi bật, giữ nguyên input của người dùng và cập nhật lại trạng thái slot mà không gây crash form.
4. **CSS Specificity isolation:** Việc áp dụng CSS Modules không được phá vỡ style dùng chung của Header, Navigation, Footer hoặc Toast notification.
5. **Reduced motion compliance:** Tất cả micro-interactions phải tôn trọng `prefers-reduced-motion` và có thời lượng ngắn (150ms - 200ms), không làm chậm thao tác người dùng.

---

### Task 0: Thiết lập Design Tokens & Cấu trúc CSS Modules

**Files:**
- Modify: `apps/client/src/index.css` (chuẩn hóa tokens: colors, spacing, typography scale, transitions, radius)
- Create: `apps/client/src/styles/tokens.css` (nếu tách rời) hoặc hoàn thiện `:root` trong `index.css`
- Test: `apps/client/src/__tests__/ResponsiveAndStatePolish.test.tsx`

**Interfaces:**
- Consumes: CSS custom properties hiện có (`--primary`, `--neutral-bg`, v.v.)
- Produces: Hệ thống biến chuẩn xác: `--color-primary-*`, `--color-surface-*`, `--color-text-*`, `--font-size-*`, `--space-*`, `--radius-*`, `--duration-fast`, `--ease-out-smooth`.

- [ ] **Step 1: Rà soát và chuẩn hóa Design Tokens trong `index.css` theo Impeccable guidelines**
- [ ] **Step 2: Kiểm tra khả năng tương thích của các token mới với giao diện hiện tại**
- [ ] **Step 3: Chạy typecheck và vitest để đảm bảo không gãy test giao diện cơ bản**
- [ ] **Step 4: Commit checkpoint**

---

### Task 1: Tinh chỉnh Giao diện Chi tiết Phòng (`RoomDetailPage`)

**Files:**
- Modify: `apps/client/src/pages/RoomDetailPage.tsx`
- Create: `apps/client/src/pages/RoomDetailPage.module.css`
- Test: `apps/client/src/__tests__/RoomDetailPage.test.tsx`

**Interfaces:**
- Consumes: `useParams`, room API, `Room` interface
- Produces: Layout chia cột rõ ràng (Desktop: Cột trái xem ảnh + thông tin phòng + amenities; Cột phải ghim form đặt phòng; Mobile: Luồng cuộn dọc tối ưu).

- [ ] **Step 1: Viết test bổ sung (nếu cần) hoặc kiểm tra test hiện tại `RoomDetailPage.test.tsx`**
- [ ] **Step 2: Tạo `RoomDetailPage.module.css` định hình phân cấp thị giác (visual hierarchy) theo Impeccable**
- [ ] **Step 3: Refactor layout trong `RoomDetailPage.tsx` sang CSS Modules, giữ nguyên các state loading/error/maintenance**
- [ ] **Step 4: Chạy `npm test apps/client/src/__tests__/RoomDetailPage.test.tsx`**
- [ ] **Step 5: Commit checkpoint**

---

### Task 2: Tinh chỉnh Bảng chọn thời gian (`TimeGrid`)

**Files:**
- Modify: `apps/client/src/components/TimeGrid.tsx`
- Create: `apps/client/src/components/TimeGrid.module.css`
- Test: `apps/client/src/__tests__/TimeGrid.test.tsx`

**Interfaces:**
- Consumes: `slots`, `selectedRange`, `onSlotClick`, `disabled`
- Produces: Grid 30-phút trực quan, phân biệt rõ slot khả dụng / đã đặt / quá khứ / đang chọn. Hỗ trợ keyboard navigation (Enter/Space), aria-pressed.

- [ ] **Step 1: Kiểm tra test `TimeGrid.test.tsx` để khóa các hành vi click và sync**
- [ ] **Step 2: Tạo `TimeGrid.module.css` với micro-interactions phản hồi click nhẹ nhàng (< 150ms) theo `emil-design-eng`**
- [ ] **Step 3: Bổ sung chỉ báo trực quan (icon/pattern gạch chéo cho slot đã đặt) để đảm bảo WCAG A11y theo `web-design-guidelines`**
- [ ] **Step 4: Chạy `npm test apps/client/src/__tests__/TimeGrid.test.tsx`**
- [ ] **Step 5: Commit checkpoint**

---

### Task 3: Tinh chỉnh Form Đặt chỗ & Bước Xem lại (`BookingForm` & `BookingSummary`)

**Files:**
- Modify: `apps/client/src/components/BookingForm.tsx`
- Modify: `apps/client/src/components/BookingSummary.tsx`
- Create: `apps/client/src/components/BookingForm.module.css`
- Test: `apps/client/src/__tests__/BookingForm.test.tsx`

**Interfaces:**
- Consumes: `roomId`, `pricePerHour`, `useRoomAvailability`
- Produces: Form đặt phòng gồm 2 bước: Chọn giờ & Xem lại (Review Phase). Xử lý mượt mà khi loading, lỗi 409, và thông báo thành công.

- [ ] **Step 1: Chạy test `BookingForm.test.tsx` (35 tests) để xác định baseline**
- [ ] **Step 2: Tạo `BookingForm.module.css` hỗ trợ transition nhẹ giữa Edit mode và Review mode**
- [ ] **Step 3: Tối ưu typography, thẻ tính giá tạm tính (Estimated Price), nút bấm CTA to rõ ràng và trạng thái disable**
- [ ] **Step 4: Rà soát chuyển động với `review-animations` để đảm bảo nút bấm không bị delay phản hồi**
- [ ] **Step 5: Chạy lại toàn bộ 35 tests của `BookingForm.test.tsx`**
- [ ] **Step 6: Commit checkpoint**

---

### Task 4: Tinh chỉnh Trang Chủ & Tìm kiếm Phòng (`HomePage` & `RoomOverviewGrid`)

**Files:**
- Modify: `apps/client/src/pages/HomePage.tsx`
- Modify: `apps/client/src/components/RoomOverviewGrid.tsx`
- Create: `apps/client/src/pages/HomePage.module.css`
- Create: `apps/client/src/components/RoomOverviewGrid.module.css`
- Test: `apps/client/src/__tests__/RoomDiscovery.test.tsx`

**Interfaces:**
- Consumes: filter states, room list query, pagination
- Produces: Bộ lọc sức chứa/giá/tiện ích dễ thao tác; Room Card có ảnh tỉ lệ đẹp, badges nổi bật, giá/giờ rõ nét, loading skeleton thanh thoát.

- [ ] **Step 1: Kiểm tra baseline với `RoomDiscovery.test.tsx`**
- [ ] **Step 2: Triển khai layout lọc và card phòng với CSS Modules**
- [ ] **Step 3: Thêm hiệu ứng hover card tinh tế (subtle lift + shadow transition 180ms)**
- [ ] **Step 4: Chạy `npm test apps/client/src/__tests__/RoomDiscovery.test.tsx`**
- [ ] **Step 5: Commit checkpoint**

---

### Task 5: Tinh chỉnh Quản trị & Lịch sử Đặt phòng (Admin & Customer History)

**Files:**
- Modify: `apps/client/src/pages/BookingHistoryPage.tsx`
- Modify: `apps/client/src/pages/BookingDetailPage.tsx`
- Modify: `apps/client/src/pages/AdminDashboardPage.tsx`
- Modify: `apps/client/src/pages/AdminBookingsPage.tsx`
- Modify: `apps/client/src/components/AdminGuestBookingForm.tsx`
- Test: `apps/client/src/__tests__/AdminBookingsPage.test.tsx`, `apps/client/src/__tests__/BookingHistoryPage.test.tsx`

**Interfaces:**
- Consumes: Admin metrics, booking list filters, cancellation APIs
- Produces: Giao diện bảng mật độ cao, badge trạng thái màu sắc chuẩn (`CONFIRMED`: xanh, `COMPLETED`: xám, `CANCELLED`: đỏ, `NO_SHOW`: cam), modal xác nhận hủy an toàn.

- [ ] **Step 1: Chạy test các trang Admin và History**
- [ ] **Step 2: Áp dụng bảng dữ liệu chuẩn Impeccable (căn lề số tiền sang phải, căn lề chữ sang trái, khoảng cách hàng thoáng đãng)**
- [ ] **Step 3: Đảm bảo nút "Hủy đặt phòng" hiển thị rõ ràng điều kiện (chỉ hủy trước 1h)**
- [ ] **Step 4: Chạy lại toàn bộ test suite của Admin và History**
- [ ] **Step 5: Commit checkpoint**

---

### Task 6: Toàn diện Kiểm thử, A11y Audit & Build Verification

**Files:**
- Run: Audit commands với `web-design-guidelines`
- Run: Full vitest test suite
- Run: TypeScript build check

- [ ] **Step 1: Chạy toàn bộ 315 tests: `npm --prefix apps/client run test`**
- [ ] **Step 2: Chạy typecheck: `npm --prefix apps/client run typecheck`**
- [ ] **Step 3: Chạy build: `npm --prefix apps/client run build`**
- [ ] **Step 4: Rà soát `prefers-reduced-motion` và keyboard navigation trên toàn bộ ứng dụng**
