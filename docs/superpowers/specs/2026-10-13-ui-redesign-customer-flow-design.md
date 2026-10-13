# Architectural Design Spec: Co-Space Working UI/UX Redesign (Phase 1: Foundation & Customer Booking Flow)

**Date:** 2026-10-13  
**Status:** Approved by User  
**Phase:** 1 of 3 (Foundation Tokens & Customer Discovery + Booking Flow)  
**Target Applications:** `apps/client`  
**Reference Standards:** [AGENTS.md](file:///d:/Code/Project/Co-Workspace%20Booking/AGENTS.md), WCAG 2.1 AA, Linear/Vercel Minimalist Design System  

---

## 1. Executive Summary & Intent

### 1.1 Objective
Đại tu toàn diện giao diện người dùng (UI/UX) cho hệ thống **Co-Space Working**, nâng cấp từ giao diện thử nghiệm với CSS nguyên khối và emoji cơ bản thành một ứng dụng web mang phong cách **Modern Tech & Premium Minimalist** (chuẩn mực tương tự Linear và Vercel). Giao diện mới tập trung vào sự tinh giản, thanh lịch, phản hồi xúc giác nhanh dưới 150ms, độ tương phản cao, typography sắc nét và phân cấp thị giác rõ ràng.

### 1.2 Phased Roadmap
Nhằm đảm bảo an toàn tuyệt đối, không gây quá tải và giữ vững chất lượng cho toàn bộ hệ thống, dự án tái thiết kế được chia thành 3 giai đoạn:
* **Giai đoạn 1 (Đặc tả trong tài liệu này):** Nền tảng Design Tokens toàn cục, App Shell (Header/Footer dùng chung) và toàn bộ Luồng Khách hàng (Trang chủ, Bộ lọc, Chi tiết phòng, Bảng chọn giờ 30 phút, Form đặt phòng & Xem lại, Xác nhận vé điện tử, Lịch sử đặt phòng & Luồng hủy đơn).
* **Giai đoạn 2:** Luồng Xác thực người dùng (Trang Đăng nhập, Trang Đăng ký).
* **Giai đoạn 3:** Khu vực Quản trị Admin (Báo cáo KPI Doanh thu, Quản lý phòng & Tiện ích, Quản lý danh sách đặt phòng, Đặt phòng cho khách vãng lai).

---

## 2. Global Design Tokens & Architectural Foundation

### 2.1 Token System (`apps/client/src/index.css`)
Hệ thống biến CSS toàn cục chuẩn mực cung cấp nền móng cho toàn bộ ứng dụng:

```css
:root {
  /* Neutral Color Palette (Slate/Zinc Clean Hierarchy) */
  --bg-canvas: #fafafa;
  --bg-surface: #ffffff;
  --bg-subtle: #f4f4f5;
  --bg-muted: #e4e4e7;

  /* Hairline Borders */
  --border-subtle: #e4e4e7;
  --border-default: #d4d4d8;
  --border-active: #4f46e5;

  /* Typography Colors */
  --text-main: #09090b;
  --text-muted: #71717a;
  --text-subtle: #a1a1aa;
  --text-inverse: #ffffff;

  /* Brand & Accent (Indigo-600) */
  --color-primary: #4f46e5;
  --color-primary-hover: #4338ca;
  --color-primary-light: #eef2ff;
  --color-primary-ring: rgba(79, 70, 229, 0.25);

  /* Semantic State Colors */
  --color-success: #10b981;
  --color-success-bg: #ecfdf5;
  --color-warning: #f59e0b;
  --color-warning-bg: #fffbeb;
  --color-danger: #f43f5e;
  --color-danger-bg: #fff1f2;
  --color-maintenance: #64748b;
  --color-maintenance-bg: #f8fafc;

  /* Radii */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* Micro-shadows (Layered, Subtle) */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05);

  /* Micro-interactions & Timing */
  --ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 150ms;
  --duration-normal: 200ms;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0ms;
    --duration-normal: 0ms;
  }
}
```

### 2.2 Shared App Shell (`AppHeader` & `AppFooter`)
* **Header (`AppHeader.tsx`)**:
  * Cố định phía trên (`position: sticky; top: 0; z-index: 50`), chiều cao 64px.
  * Hiệu ứng kính mờ cao cấp: `backdrop-filter: blur(12px); background: rgba(255, 255, 255, 0.85); border-bottom: 1px solid var(--border-subtle);`.
  * **Brand Identity:** Biểu tượng `Boxes` hoặc `Building2` từ `lucide-react` kết hợp chữ "Co-Space Working" phong cách hiện đại.
  * **Trạng thái Khách vãng lai:** Nút "Đăng nhập" dạng Ghost và nút "Đăng ký" dạng Primary Button bo góc 8px.
  * **Trạng thái Người dùng đã xác thực:**
    * Avatar tròn hiển thị ký tự đầu của tên hoặc icon `User`.
    * Tên hiển thị + Role badge: `CUSTOMER` (tag xanh Indigo) hoặc `ADMIN` (tag tím sang trọng).
    * Link điều hướng nhanh: "Lịch sử đặt phòng" (icon `Clock`), "Quản trị" (dành riêng cho Admin).
    * Nút "Đăng xuất" dạng outline mảnh với icon `LogOut`.
* **Footer (`AppFooter.tsx`)**:
  * Tối giản ở chân trang, hiển thị bản quyền, múi giờ hệ thống (UTC+7 / Vietnam) và cam kết dịch vụ.

---

## 3. Screen & Component Specifications (Customer Flow)

### 3.1 Trang Chủ & Khám phá Phòng (`HomePage` & `RoomDiscovery`)
* **Hero Banner**:
  * Tiêu đề: *"Không gian làm việc linh hoạt & chuyên nghiệp."*
  * Nền gradient nhẹ thanh lịch, không dùng hình nền rối mắt.
* **Cột Bộ lọc (`FilterSidebar.tsx` / `HomePage.module.css`)**:
  * Sticky trên Desktop, chuyển sang giao diện gập mở trên Mobile.
  * Icon `SlidersHorizontal` ở tiêu đề, nút "Xóa tất cả" (`RotateCcw`) xuất hiện khi có bộ lọc hoạt động.
  * Ô nhập sức chứa tối thiểu với icon `Users` và validation lỗi tức thì.
  * Khoảng giá (VND/giờ) 2 ô "Từ" – "Đến" ngăn cách bởi vạch nối mảnh.
  * Lưới tiện ích (Amenities) với checkbox custom và icon kiểm tra sắc nét.
  * Tích hợp debounce 300ms tự động cập nhật URL mà không giật màn hình.
* **Lưới danh sách phòng (`RoomOverviewGrid` & `RoomCard`)**:
  * Header thống kê số lượng phòng và các tag lọc đang áp dụng.
  * **Room Card:**
    * Tỉ lệ ảnh 16:10, bo góc `10px`, hiệu ứng hover ảnh phóng nhẹ (`transform: scale(1.02); transition: 180ms`).
    * Badge trạng thái góc ảnh: `Khả dụng` (xanh Emerald) hoặc `Bảo trì` (xám Slate).
    * Sức chứa phòng với icon `Users`.
    * Danh sách tiện ích hiển thị dạng pill tags nhỏ gọn.
    * Giá niêm yết to rõ: `xxx.xxx đ / giờ`.
    * Nút CTA: *"Xem chi tiết & Đặt phòng"* kèm icon `ArrowRight`.
  * **Skeleton Loading & Empty State:**
    * Shimmer loading skeleton duy trì layout nguyên vẹn khi tải dữ liệu.
    * Empty state trang nhã với icon `SearchX` khi không tìm thấy phòng phù hợp.

### 3.2 Trang Chi tiết Phòng (`RoomDetailPage`)
* **Bố cục 2 cột bất đối xứng (Desktop 60% / 40%)**:
  * **Cột trái:** Breadcrumbs điều hướng, Gallery hình ảnh tỉ lệ vàng, Tên phòng & Badge trạng thái, Thẻ thông số sức chứa/giá, Lưới tiện ích (Amenities Grid) kèm icon chuyên dụng từ `lucide-react` (Wifi, Monitor, Coffee, AirVent...), Mô tả chi tiết không gian.
  * **Cột phải:** Sticky Widget chứa bộ chọn ngày, bảng chọn giờ tương tác `TimeGrid` và form đặt chỗ `BookingForm`.

### 3.3 Bảng Chọn Khung Giờ & Form Đặt Phòng (`TimeGrid` & `BookingForm`)
* **Bảng chọn giờ 30 phút (`TimeGrid.tsx`)**:
  * Các khung giờ từ 07:00 đến 22:00.
  * 4 trạng thái slot chuẩn A11y & Contrast:
    * `Available`: Nền trắng viền mảnh, hover phản hồi `< 150ms`.
    * `Selected`: Nền Indigo-600, chữ trắng, viền sáng nhẹ.
    * `Booked`: Nền xám nhạt hoa văn gạch chéo mờ kèm icon khóa, con trỏ `not-allowed`.
    * `Past`: Nền xám mờ không thể chọn.
  * Hỗ trợ đồng bộ hai chiều (Two-Way Sync): Click slot tự động cập nhật form, gõ giờ trong form tự động highlight dải slot.
* **Form Đặt phòng 2 bước (`BookingForm.tsx` & `BookingSummary.tsx`)**:
  * **Bước 1 (Chọn thời gian & Ước tính giá):**
    * Chọn ngày xem lịch (`CalendarPicker`), chọn giờ bắt đầu & kết thúc (`Clock`).
    * Tự động kiểm tra các bất biến nghiệp vụ: bước 30 phút, tối thiểu 1h, tối đa 8h, đặt trước tối thiểu 30 phút.
    * Thẻ tạm tính giá (Live Pricing Estimate Card) hiển thị công thức rõ ràng: `Thời lượng x Đơn giá = Tổng tiền`.
    * Nút *"Xem lại thông tin đặt phòng"* chuyển sang Bước 2.
  * **Bước 2 (Xem lại & Xác nhận):**
    * Thẻ tóm tắt `BookingSummary` đầy đủ thông tin phòng, thời gian và tổng thanh toán.
    * Nút *"Quay lại chỉnh sửa"* giữ nguyên 100% input đã nhập.
    * Nút *"Xác nhận & Đặt phòng"* (Primary CTA) có spinner khi gửi dữ liệu lên máy chủ.
  * **Xử lý xung đột (409 Conflict):**
    * Khi bị đặt trùng giờ: Hiển thị banner cảnh báo Rose/Red nổi bật: *"Khung giờ này vừa có người đặt trước. Vui lòng chọn khung giờ khác."*
    * Giữ nguyên form data của khách, tự động re-fetch lại dữ liệu TimeGrid để chọn ngay khung giờ mới.
  * **Cảnh báo Bảo trì:**
    * Hiển thị banner trạng thái bảo trì màu vàng cam/xám nếu phòng đang trong diện bảo trì.

### 3.4 Trang Xác Nhận Đặt Chỗ (`BookingConfirmationPage`)
* **Thiết kế Thẻ Vé Điện Tử (Boarding Pass Receipt)**:
  * Biểu tượng `CheckCircle2` màu xanh Emerald nổi bật với lời chúc mừng đặt phòng thành công.
  * Khối mã đặt phòng duy nhất: Mã `CS-YYYYMMDD-XXXX` định dạng font Monospace lớn, đi kèm nút **"Sao chép mã"** (`Copy` icon) có phản hồi tooltip *"Đã sao chép"*.
  * Thông tin chi tiết vé: Tên phòng, Thời gian sử dụng, Tổng giờ, Tổng thanh toán, Trạng thái thanh toán (`UNPAID` / `PAID`).
  * Hai nút hành động: Nút chính *"Xem trong Lịch sử đặt phòng"* (`/bookings`) và nút phụ *"Về Trang chủ"* (`/`).

### 3.5 Trang Lịch Sử & Chi Tiết Đơn (`BookingHistoryPage` & `BookingDetailPage`)
* **Bộ lọc trạng thái Tab**: `Tất cả`, `Đã xác nhận (CONFIRMED)`, `Hoàn thành (COMPLETED)`, `Đã hủy (CANCELLED)`, `Vắng mặt (NO_SHOW)`.
* **Thẻ đơn đặt phòng (Booking Card Rows)**:
  * Mã booking, Tên phòng, Ngày giờ bắt đầu – kết thúc, Tổng tiền căn lề phải.
  * Hệ thống badge trạng thái:
    * `CONFIRMED`: Xanh Indigo/Emerald dịu viền mảnh.
    * `COMPLETED`: Xám Slate thanh nhã.
    * `CANCELLED`: Đỏ Rose viền mảnh.
    * `NO_SHOW`: Vàng Amber cảnh báo.
* **Quy tắc Hủy đơn an toàn (1-Hour Cancellation Rule)**:
  * Nút "Hủy đặt phòng" (`Trash2` / `XCircle`):
    * Thời gian bắt đầu $\ge 1$ giờ: Nút kích hoạt bình thường. Khi bấm mở Modal xác nhận an toàn để xác thực hành động.
    * Thời gian bắt đầu $< 1$ giờ: Nút bị vô hiệu hóa (disabled) kèm chú thích rõ ràng: *"Chỉ được hủy trước giờ bắt đầu tối thiểu 1 tiếng"*.
  * Sau khi hủy thành công: Cập nhật ngay trạng thái thẻ thành `CANCELLED` và kích hoạt toast thông báo.

---

## 4. Technical Non-Breaking Safeguards & Testing Strategy

### 4.1 Bảo toàn Toàn Bộ Test Suite (315/315 Tests Pass)
* Mọi thay đổi HTML/JSX phải giữ nguyên tuyệt đối:
  * Toàn bộ `data-testid` hiện có.
  * Mọi thuộc tính form `id`, `name`, `htmlFor` và `aria-*` (`aria-describedby`, `aria-pressed`, `aria-label`, `role="alert"`).
  * Chuỗi văn bản nghiệp vụ phục vụ assert trong các file test (`RoomDetailPage.test.tsx`, `BookingForm.test.tsx`, `TimeGrid.test.tsx`, `RoomDiscovery.test.tsx`, `BookingHistoryPage.test.tsx`, v.v.).
* Tuyệt đối không thay đổi contract API, mã trạng thái HTTP hoặc schema cơ sở dữ liệu.

### 4.2 Thư viện & Phụ thuộc
* Cài đặt duy nhất: `lucide-react` trong `apps/client`.
* Kiến trúc CSS: Kết hợp Design Tokens toàn cục (`apps/client/src/index.css`) và CSS Modules cho từng thành phần (`*.module.css`).

---

## 5. Verification Checklist

Trước khi hoàn tất Giai đoạn 1, hệ thống phải vượt qua đầy đủ:
1. `npm --prefix apps/client run test` $\to$ Đạt **315/315 tests pass**.
2. `npm --prefix apps/client run typecheck` $\to$ **Zero lỗi TypeScript**.
3. `npm --prefix apps/client run build` $\to$ **Build Vite thành công** mà không có lỗi cảnh báo nghiêm trọng.
4. Kiểm tra thủ công tính responsive và trợ năng bàn phím trên các thiết bị.
