# UI Redesign Phase 2 Implementation Plan — Authentication Flow

> **Goal:** Hiện đại hóa toàn diện giao diện trang Đăng nhập (`LoginPage.tsx`) và Đăng ký (`RegisterPage.tsx`) theo phong cách Modern Tech & Premium Minimalist (Linear / Vercel style), bảo đảm 100% 27 unit tests hiện tại tiếp tục pass, không phát sinh breaking change về contracts, validation, hay auth state.

---

## 1. Thiết Kế & Nguyên Tắc

### Phong cách thẩm mỹ (Linear / Vercel Minimalist)
- **Background:** Nền trung tính canvas `var(--bg-canvas, #fafafa)` kết hợp hiệu ứng radial gradient nhẹ ở góc nền tạo chiều sâu công nghệ.
- **Card bề mặt:** Thẻ đăng nhập/đăng ký `Auth.module.css` màu trắng `#ffffff`, bo tròn mềm mại `var(--radius-xl, 16px)`, viền hairline `1px solid var(--border-subtle, #e4e4e7)`, đổ bóng phân tầng thanh lịch `var(--shadow-md)`.
- **Thương hiệu:** Logo icon `Boxes` phong cách khối hiện đại, đồng bộ với `AppHeader`.
- **Form Controls:** Input fields có font sắc nét, icon dẫn đường tinh tế (`Mail`, `Lock`, `User`, `Phone`), hairline focus ring (`outline: 2px solid var(--color-primary)` với hiệu ứng glow nhẹ).
- **Password Toggle:** Nút bấm ẩn/hiện mật khẩu sử dụng icon `Eye` / `EyeOff` hiện đại, giữ nguyên `aria-label` và hành vi accessible.
- **Alert Banners:** Thông báo lỗi hoặc phiên làm việc hết hạn có icon `AlertCircle` kèm màu nền Rose nhạt sang trọng, viền hairline sắc nét.

### Bất Biến Miền & Hợp Đồng (Core Invariants)
- Hash bcrypt và kiểm tra JWT hoàn toàn giữ nguyên ở backend.
- Validation Zod client-side giữ nguyên: giới hạn mật khẩu 72 UTF-8 bytes, email lowercase, khớp confirmPassword.
- Payload gửi lên API giữ nguyên strict contract: `RegisterRequest` không chứa `confirmPassword` hay `role`.
- Không thay đổi các `data-testid`, `id`, `htmlFor`, `role="alert"`, `role="status"` hay các semantic class name (`card auth-card`, `auth-container`, `form-control`, `has-error`, `btn-primary`, `toggle-password-btn`, `auth-brand`, `auth-title`, `auth-subtitle`).

---

## 2. Kế Hoạch Các Task Chi Tiết

### Task 1: Xây dựng `Auth.module.css` dùng chung
- **File:** `apps/client/src/pages/Auth.module.css`
- **Mục tiêu:** Cung cấp đầy đủ class styles hiện đại cho cả 2 màn hình đăng nhập và đăng ký:
  - `.container`: layout flexbox căn giữa màn hình hoặc responsive min-height 100vh.
  - `.card`: thẻ auth trung tâm max-width 440px (Login) và 480px (Register).
  - `.header`: brand icon và text phong cách Linear.
  - `.inputGroup`: input wrapper hỗ trợ icon và focus ring không lệch pixel.
  - `.toggleBtn`: nút hiển thị mật khẩu nhỏ gọn, tương tác mượt mà.
  - `.alert`: banner cảnh báo lỗi / thành công tinh tế.
  - `.submitBtn`: nút CTA chính màu Indigo đậm với hiệu ứng hover và loading.
  - `.footer`: link chuyển đổi Login ↔ Register với hover underline.

### Task 2: Hiện đại hóa `LoginPage.tsx`
- **File:** `apps/client/src/pages/LoginPage.tsx`
- **Thực hiện:**
  - Import `Auth.module.css`, icon `lucide-react` (`Boxes`, `Mail`, `Lock`, `Eye`, `EyeOff`, `AlertCircle`, `CheckCircle2`, `ArrowRight`).
  - Áp dụng cấu trúc class kép: class CSS Module mới + class legacy để pass 100% test.
  - Bảo toàn toàn bộ logic điều hướng (`state.from`, role routing `ADMIN` -> `/admin`, `CUSTOMER` -> `/` hoặc sanitized room/booking path).
  - Chạy `npm --prefix apps/client run test -- LoginPage.test.tsx` -> Yêu cầu 18/18 tests pass.

### Task 3: Hiện đại hóa `RegisterPage.tsx`
- **File:** `apps/client/src/pages/RegisterPage.tsx`
- **Thực hiện:**
  - Import `Auth.module.css`, icon `lucide-react` (`Boxes`, `User`, `Mail`, `Phone`, `Lock`, `Eye`, `EyeOff`, `AlertCircle`, `ArrowRight`).
  - Áp dụng cấu trúc class kép: class CSS Module mới + class legacy.
  - Bảo toàn tính năng ẩn/hiện mật khẩu cho cả 2 ô Password và ConfirmPassword.
  - Giữ nguyên quy tắc kiểm tra 72 UTF-8 bytes và logic chuyển hướng sang `/login` kèm thông báo thành công.
  - Chạy `npm --prefix apps/client run test -- RegisterPage.test.tsx` -> Yêu cầu 9/9 tests pass.

### Task 4: Kiểm Thử Toàn Diện, Typecheck & Build Verification
- **Thực hiện:**
  - Chạy `npm --prefix apps/client run test -- --maxWorkers=2` -> Yêu cầu 318/318 tests pass trên toàn bộ 23 test suites.
  - Chạy `npm --prefix apps/client run typecheck` -> Yêu cầu 0 lỗi TypeScript.
  - Chạy `npm --prefix apps/client run build` -> Yêu cầu Vite build thành công không có lỗi.
  - Commit checkpoint hoàn tất Giai đoạn 2.
