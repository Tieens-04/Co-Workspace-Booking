# Redesign toàn bộ giao diện: Editorial Minimalist, Tailwind v4 + shadcn/ui

## Context
Ba phase redesign trước (kiểu Linear, màu indigo/zinc, font Plus Jakarta Sans) đã commit nhưng còn dở dang ở mấy điểm:
- `src/index.css` vẫn dài 2.405 dòng.
- Mỗi element gắn cả class cũ lẫn class module (dual-class).
- Còn khoảng 230 `style={{}}` và hex hard-code, nhiều nhất ở AdminBookingsPage, RoomOverviewGrid, AdminGuestBookingForm và ToastContext.
- Modal admin không có `role="dialog"`.
- Admin nav bị copy-paste qua 3 trang.
- Chưa có dark mode.

User đã chốt:
1. Đổi hẳn ngôn ngữ thiết kế sang **Premium Minimalist / Editorial**: đen trắng tương phản cao, tiêu đề dùng serif, nhiều khoảng trắng.
2. Có **light và dark** cùng nút chuyển theme.
3. Stack: **Tailwind CSS v4 + shadcn/ui (Radix) + Sonner + Motion**. Giữ nguyên Vite 6, React 19, react-router 7, axios, zod 4, lucide-react.
4. Làm **style guide HTML trước** để duyệt, rồi mới động vào code app.
5. Copy tiếng Việt giữ nguyên.

Ràng buộc chung cho mọi phase:
- Không đổi API call, state hay business logic. Backend vẫn là nguồn quyết định.
- Giữ testid, role và accessible name. Test chỉ được sửa có chủ đích, theo ledger cuối file.
- Không thao tác git. Mỗi phase kết thúc bằng các bước kiểm tra, rồi dừng để user review và commit.
- Package manager là npm workspaces, cài từ root. Không đụng `pnpm-lock.yaml`.

---

## Phase 0: Style guide (chưa sửa code app)
Tạo file `<scratchpad>\cospace-style-guide.html` (một file tự chứa). Nạp skill `artifact-design` rồi publish thành Artifact.
- **Nội dung trang:** tên các CSS variable dùng y hệt tên sẽ đưa vào `src/index.css`. Trang có toggle light/dark (class `.dark` trên `<html>`) và nút chuyển giữa 2 cặp font.
- **Font**, cả hai cặp đã kiểm tra có subset tiếng Việt:
  - **A (đề xuất):** Fraunces cho tiêu đề, Be Vietnam Pro cho nội dung.
  - **B:** Newsreader cho tiêu đề, Inter cho nội dung.
  - Không dùng Instrument Serif hay DM Serif Display vì thiếu subset tiếng Việt.
  - Quy tắc dấu: line-height từ 1.1 cho display và từ 1.25 cho heading. Không `overflow:hidden` trên heading. Không viết hoa toàn bộ chữ serif.
- **Palette** (tất cả đạt WCAG AA):

  | Token | Light | Dark |
  |---|---|---|
  | background | `#FAFAF7` | `#0B0B0A` |
  | foreground | `#0A0A0A` | `#F4F4EF` |
  | card | `#FFF` | `#151514` |
  | muted | `#F0F0EB` | `#1C1C1A` |
  | muted-foreground | `#5E5E58` | `#A6A69F` |
  | border (hairline) | `#E3E3DD` | `#2A2A27` |
  | input (viền control, ≥3:1) | `#8C8C85` | `#6E6E68` |
  | primary | đen | trắng ngà |
  | destructive | `#B42318` | `#F97066` |

- **Màu trạng thái**, mỗi trạng thái có bộ fg/bg/border và luôn kèm nhãn chữ:

  | Trạng thái | Màu |
  |---|---|
  | CONFIRMED | xanh dương |
  | COMPLETED, PAID, AVAILABLE | xanh lá (PAID có thêm icon Check) |
  | CANCELLED | đỏ |
  | NO_SHOW | cam đất |
  | UNPAID | trung tính, viền nét đứt |
  | MAINTENANCE | slate |

- **Radius:** gốc `0.375rem`, các mức sm/md/lg/xl suy ra từ đó. Pill chỉ dùng cho badge.
- **Shadow** gần như không dùng, chủ yếu là hairline. Có 2 mức `--shadow-soft` và `--shadow-overlay`.
- **Type scale:** từ display-xl (`clamp(3.5rem, 6vw, 4.5rem)`) xuống xs. Giá, giờ và mã booking dùng `tabular-nums`.
- **Layout:** container 1240px; nhịp section 96px trên desktop, 56px trên mobile; eyebrow đánh số kiểu "01 — Không gian".
- **Motion:** easing `cubic-bezier(0.22,1,0.36,1)`, thời lượng 120/200/320ms. Chỉ fade và dịch 8px, tôn trọng `prefers-reduced-motion`.
- **Các section:** type scale, swatch kèm tỉ lệ tương phản, button và input đủ các state, card, table, dialog, toast, skeleton, empty state, pagination, segmented control, ô slot của TimeGrid, mẫu trang **Home** và **Room Detail**.
- **Ô slot TimeGrid:** booked có thêm hoạ tiết sọc chéo và gạch ngang chữ, để không chỉ phân biệt bằng màu.
- **Gate:** user duyệt cặp font, palette, radius và độ dày đặc (density) rồi mới sang Phase 1.

## Phase 1: Foundation (app vẫn chạy, giao diện gần như chưa đổi)
- **Cài dependency từ root:**
  - `npm i -w @cospace/client class-variance-authority clsx tailwind-merge radix-ui sonner motion`
  - `npm i -w @cospace/client -D tailwindcss @tailwindcss/vite tw-animate-css`
  - Không cài `next-themes`.
- **Cấu hình:**
  - `vite.config.ts`: thêm plugin `tailwindcss()`.
  - `tsconfig.json`: thêm `paths` `@/*` (shadcn CLI cần).
  - `eslint.config.js`: tắt `react-refresh/only-export-components` cho `src/components/ui/**`.
- **CSS bằng cascade layers.** Chuyển `src/index.css` sang `src/styles/legacy.css` (tạm thời, xóa ở Phase 8). File `index.css` mới:
  - `@layer theme, base, legacy, components, utilities;`
  - import theme, preflight và utilities của Tailwind, import `legacy.css` vào `layer(legacy)`.
  - `@custom-variant dark (&:where(.dark, .dark *))`.
  - Token đặt trong `:root` / `.dark`.
  - `@theme inline` có `--color-*: initial`, để không còn dùng được palette mặc định hay hex lẻ.
  - `@layer base` chứa body, heading dùng `font-display`, `:focus-visible` và reduced-motion.
- **Token bridge trong `legacy.css`:** `--bg-canvas`, `--text-main`, `--color-primary`… trỏ sang token mới, nhờ vậy trang chưa migrate vẫn theo được dark mode. Định nghĩa luôn các biến đang thiếu: `--ease-spring`, `--radius-full`, `--shadow-xs`.
- **shadcn:**
  - Viết tay `components.json` (style new-york, `rsc:false`, `css: src/index.css`, baseColor neutral, iconLibrary lucide). Không chạy `init`.
  - Tạo `src/lib/utils.ts` với `cn()`.
  - `npx shadcn@latest add button card badge input label textarea separator skeleton dialog alert-dialog sheet dropdown-menu tooltip table alert sonner`.
  - Sửa `sonner.tsx` để dùng `useTheme` của mình thay cho next-themes.
  - **Không** dùng Select, Checkbox, Tabs, ToggleGroup của Radix, vì test đang dùng `user.selectOptions` và `fireEvent.change` lên control native, và filter đang là nút `aria-pressed`. Giữ control native, chỉ style lại.
- **Theme:**
  - File mới: `src/context/theme-context-base.ts`, `src/context/ThemeContext.tsx`, `src/hooks/useTheme.ts`, theo đúng pattern của `toast-context-base`.
  - Ba chế độ light / dark / system, lưu ở `localStorage['cospace-theme']`, nghe `matchMedia`.
  - `index.html`: bỏ Plus Jakarta, thêm Google Fonts của cặp đã chọn, `meta color-scheme` và `theme-color`, cùng một **script inline chống nháy** đặt trước module script.
  - `App.tsx`: bọc trong `ThemeProvider`, `MotionConfig reducedMotion="user"` và `LazyMotion`.
- **Toast chuyển sang Sonner:**
  - Viết lại `src/context/ToastContext.tsx` nhưng giữ API `useToast().showToast/removeToast`, kể cả fallback no-op.
  - `src/components/ToastCard.tsx` mới tự gắn `role="alert"` (lỗi) hoặc `role="status"`, kèm nút "Đóng thông báo".
  - Nếu Sonner không ổn định trong test thì giữ provider cũ và chỉ style lại bằng Tailwind.
- **`src/test/setup.ts`** dùng hàm thường, không dùng `vi.fn()`, vì `resetAllMocks` sẽ xóa mất:
  - stub `matchMedia`, `ResizeObserver`, `IntersectionObserver`, pointer-capture và `scrollIntoView`;
  - `MotionGlobalConfig.skipAnimations = true`;
  - trong `afterEach`: `toast.dismiss()` và gỡ `.dark`.
- **Test:**
  - Sửa `Toast.test.tsx` sang `findBy*` cùng fake timers.
  - Thêm `ThemeContext.test.tsx`.

## Phase 2: Layout và điều hướng
- **File mới trong `src/layouts/`:**
  - `PublicLayout.tsx`: skip link, `AppHeader`, `<main id="main-content">` bọc `Outlet` với fade khi vào trang, `AppFooter`.
  - `AuthLayout.tsx`: bố cục chia đôi, có panel editorial trên màn `lg`.
  - `AdminLayout.tsx`: sidebar `NavLink` với testid `admin-nav-dashboard|rooms|bookings` và `aria-current`; trên mobile dùng `Sheet` mở bằng nút "Mở menu quản trị".
- **Component và hook mới:**
  - `src/components/ThemeToggle.tsx`: DropdownMenu Sáng / Tối / Theo hệ thống, `aria-label="Chọn giao diện"`.
  - `src/hooks/useMediaQuery.ts`: query viết dạng max-width để môi trường test mặc định coi là desktop.
- **Viết lại** `AppHeader.tsx` và `AppFooter.tsx` bằng Tailwind và shadcn, có menu mobile. Giữ nguyên toàn bộ tên link, nút và badge mà `AppHeader.test.tsx` kiểm tra.
- **`App.tsx` chuyển sang route lồng nhau:** PublicLayout (home, chi tiết phòng, 404, nhánh CustomerRoute), GuestRoute + AuthLayout (login, register), AdminRoute + AdminLayout. `RouteGuard` giữ API `children`; style lại phần loading và thẻ 403, giữ nguyên chữ và `role`.
- **Bỏ** `AppHeader`/`AppFooter` khỏi 8 trang, đổi `<main>` của từng trang thành `div`, xóa 3 khối admin sub-nav bị copy.
- **Test:**
  - Thêm helper `src/test/renderWithRouter.tsx` (tham số `layout`).
  - `RoomDiscovery` và `ResponsiveAndStatePolish` render qua layout, dùng role `banner`/`navigation` thay cho `.app-header`/`.nav-actions`.
  - Chuyển test nav ở `AdminPage.test.tsx:169-178` sang `AdminLayout.test.tsx` mới.
  - Thêm `PublicLayout.test.tsx`.

## Phase 3: Component domain dùng chung
- **`src/utils/status.ts`:** một map duy nhất cho nhãn và tone của booking, payment và room. Chuyển `getPaymentMethodLabel` từ `BookingSummary.tsx` sang đây.
- **Component mới:**
  - Trong `src/components/common/`: `StatusBadge` (cva, `data-status`, prop `label` để giữ chữ raw `MAINTENANCE` ở trang admin), `PageHeader`, `EmptyState`, `ErrorState`, `Pagination` (testid và `ariaLabel` truyền vào).
  - `SegmentedControl` (nút `aria-pressed`).
  - Wrapper cho control native: `NativeSelect`, `Checkbox`, `DateInput`, `FileInput`.
  - `Field` (label, hint, error có `role="alert"`, `aria-describedby`).
  - `Money`, `BookingCode`, `DateTimeText`, đều dùng lại `src/utils/format.ts`.
- **Dùng ngay:** áp vào `BookingSummary.tsx` và `AdminBookingsPage.tsx`, xóa hai map trạng thái bị trùng.
- **Test:**
  - `BookingDetailPage` và `BookingHistoryPage`: đổi `toHaveClass('badge-*')` thành `toHaveAttribute('data-status', …)`.
  - Thêm unit test cho StatusBadge, Pagination, SegmentedControl, Field và status utils.

## Phase 4: Khám phá phòng, auth, 404
- **`HomePage`:**
  - Hero editorial: headline serif cỡ lớn kèm số lượng kết quả.
  - Filter rail trong Card; trên mobile chuyển vào Sheet mở bằng nút "Bộ lọc". Lúc nào cũng chỉ render một bộ filter.
  - Tách thành `src/components/rooms/RoomCard.tsx`, `RoomFilters.tsx` và `RoomGridSkeleton.tsx` (6 thẻ `room-card-skeleton`).
  - Emoji 👥 thay bằng icon `Users`.
- **`RoomDetailPage`:**
  - Gallery với thumbnail là button thật, có `aria-label`.
  - Cột đặt phòng sticky trên `lg`.
  - Mũi tên "←" trong link quay lại chuyển thành span `aria-hidden`.
- **`LoginPage` / `RegisterPage`:** chạy trong AuthLayout, dựng bằng Card, Field, Input và Button. Giữ nguyên id, label, aria và testid.
- **`NotFoundPage`:** trang 404 editorial, không còn inline style.
- **Xóa** `HomePage.module.css`, `RoomDetailPage.module.css` và `Auth.module.css`.
- **Test:**
  - `'👥 4 người'` đổi thành `'4 người'`.
  - Regex link quay lại bỏ ký tự "←".
  - Đếm skeleton bằng testid.
  - Test Login và Register phải pass mà không cần sửa.

## Phase 5: Luồng đặt phòng
- **`TimeGrid`:**
  - Mỗi slot có `data-slot-state="available|booked|past|selected"`, kèm `aria-pressed` khi được chọn.
  - Booked và past vẫn `disabled`; booked có hoạ tiết sọc chéo.
- **`BookingForm`:** hai bước trong Card, giá hiển thị qua `Money`, bỏ 25 inline style. **Không đổi logic** của `utils/bookingTime.ts` hay API.
- **`BookingConfirmationPage`:** dạng "receipt" editorial; sửa lỗi lồng hai `<main>`.
- **`BookingHistoryPage`:** PageHeader, SegmentedControl, các dòng Card, Pagination và EmptyState.
- **`BookingDetailPage`:**
  - Hộp xác nhận huỷ chuyển sang `AlertDialog`; testid `cancellation-confirm-box`, `confirm-cancel-btn` và `abort-cancel-btn` vẫn giữ.
  - Dialog không tự đóng khi API lỗi.
- **Xóa** các file module CSS liên quan.
- **Test:**
  - `TimeGrid.test` và `BookingForm.test`: đổi `toHaveClass('slot-*')` thành `data-slot-state`, thêm kiểm tra `aria-pressed`.
  - `BookingDetailPage`: sau khi bấm bỏ qua, assert dialog đã đóng.

## Phase 6: Admin quản lý phòng (`AdminPage.tsx`, 1.359 dòng)
- Chỉ tách phần presentation. State, effect, API, logic focus và luồng cảnh báo bảo trì giữ nguyên trong page.
- Component mới trong `src/components/admin/rooms/`:
  - `RoomTable`
  - `RoomForm`: panel Card inline, **không** dùng Sheet hay modal để tránh `aria-hidden` lên bảng; testid `admin-room-form` giữ ở wrapper của `<form aria-busy>`.
  - `AmenityChecklist`
  - `RoomImageManager`
  - `MaintenanceWarning` (`role="alertdialog"`, chỉ hiện inline)
- Select trạng thái vẫn là control native.
- **Test:** `AdminPage.test.tsx` phải pass mà không cần sửa. Thêm test render cho `RoomTable` và `MaintenanceWarning`.

## Phase 7: Admin dashboard, đặt phòng và form khách vãng lai
- **`AdminDashboardPage`:** PageHeader, `KpiCard` (giữ các testid skeleton) và ErrorState.
- **`RoomOverviewGrid`:** bỏ 26 inline style và 21 mã hex. Độ rộng động truyền qua CSS variable; đây là dạng `style=` duy nhất được phép.
- **`AdminBookingsPage`:** tách vào `src/components/admin/bookings/`:
  - `BookingFilters`
  - `RevenueSummary`
  - `AdminBookingTable`
  - `ConfirmPaymentDialog` (`confirm-payment-modal`)
  - `CancelBookingDialog` (`admin-cancel-modal`)

  Hai dialog dùng shadcn `Dialog`, có sẵn `role="dialog"`, focus trap và đóng bằng Esc. Khi đang submit thì chặn đóng. Bỏ 68 inline style.
- **`AdminGuestBookingForm`:**
  - Tách thành `GuestRoomPicker`, `GuestInfoFields`, `GuestTimeFields` và `GuestPricePreview`.
  - Giữ toàn bộ testid `guest-*`; `guest-room-select` vẫn là select native.
  - Glyph ▲▼ thay bằng icon chevron.
- **Test:**
  - Test hiện có phải pass. Nếu Radix chặn `pointer-events`, chỉ test bị ảnh hưởng mới dùng `pointerEventsCheck: 0`.
  - Mỗi dialog thêm một test: Esc đóng được khi đang rảnh, nhưng không đóng khi đang submit.

## Phase 8: Dọn dẹp, audit, tài liệu
- **Xóa:** `src/styles/legacy.css` cùng layer `legacy`, toàn bộ `*.module.css`, và các class cũ còn sót.
- **Grep gate**, tất cả phải trả về rỗng:
  - file `*.module.css`;
  - `legacy.css` hoặc `Plus Jakarta`;
  - mã hex trong `.tsx` (ngoài thư mục test);
  - `style={{` (trừ dạng gán CSS variable);
  - class `btn|card|badge|form-control`.
- **Audit thủ công:**
  - bàn phím: skip link, focus trap của Sheet và Dialog, DropdownMenu, thứ tự tab của TimeGrid;
  - tương phản ở cả hai theme bằng Lighthouse hoặc axe DevTools;
  - responsive ở 375 / 768 / 1024 / 1440, bảng admin có `overflow-x-auto`;
  - reduced-motion;
  - không nháy theme khi hard reload;
  - dấu tiếng Việt ở mọi cỡ display.
- **Tài liệu:**
  - `apps/client/DESIGN.md`: token, type scale, map trạng thái, danh mục component, các quy tắc (không hex, không inline style, dùng control native ở đâu), script chống nháy và ghi chú CSP, trình duyệt tối thiểu (Safari 16.4+, Chrome 111+).
  - Cập nhật `README.md`.
  - Thêm `docs/adr/0002-ui-stack-tailwind-shadcn.md`, lý do theo AGENTS §1 và §11.
  - Lưu plan này vào `docs/superpowers/plans/2026-10-18-ui-redesign-editorial.md`.

---

## Ledger: test sửa có chủ đích
| File | Thay đổi |
|---|---|
| Toast.test | `findBy*` và fake timers |
| RoomDiscovery.test | render qua PublicLayout; `'4 người'` |
| ResponsiveAndStatePolish.test | testid skeleton; role banner/navigation |
| AdminPage.test:169-178 | chuyển sang AdminLayout.test |
| BookingDetailPage.test, BookingHistoryPage.test | `data-status`; dialog đã đóng |
| TimeGrid.test, BookingForm.test | `data-slot-state` và `aria-pressed` |
| RoomDetailPage.test | regex link quay lại |
| Test mới | ThemeContext, PublicLayout, AdminLayout, StatusBadge, Pagination, SegmentedControl, Field, status utils, RoomTable, MaintenanceWarning, hai dialog admin |

## Rủi ro và cách giảm
- **Preflight của Tailwind đè lên CSS cũ khi hai bên chạy song song.** Thứ tự layer đặt `legacy` trên preflight và dưới utilities. CSS Modules không nằm trong layer nên luôn thắng, vì vậy **không trộn class module với utility trên cùng một element**: mỗi component migrate trọn một lần.
- **Trùng tên biến** (`--color-primary`, `--radius-*`, `--shadow-*`): xử lý bằng `@theme inline`, token bridge và `--color-*: initial`.
- **Radix trong jsdom** (portal, pointer-events, `aria-hidden`): chỉ modal thật mới dùng Dialog; select, checkbox và tabs vẫn là native; stub đặt trong `setup.ts`.
- **Sonner render bất đồng bộ và dùng store global:** test dùng `findBy`, gọi `toast.dismiss()` trong `afterEach`; nếu vẫn không ổn thì quay về provider tự viết.
- **Responsive sinh DOM trùng lặp:** Sheet chỉ mount khi mở; `useMediaQuery` mặc định coi là desktop.
- **Docker trên alpine dùng `npm ci`:** binary native của Tailwind oxide và lightningcss (bản musl) có thể thiếu trong lockfile tạo trên Windows. Phải kiểm tra lockfile, hoặc chạy `docker build -f apps/client/Dockerfile .`.
- **shadcn CLI có thể ghi đè `index.css` hoặc chọn nhầm pnpm:** viết tay `components.json` và review `git status` sau mỗi lần `add`.
- **Lockfile lồng `apps/client/package-lock.json`:** báo cho user, không tự xóa.

## Kiểm tra cuối mỗi phase
```
npm --workspace apps/client run test -- <các file test của phase>
npm --workspace apps/client run lint
npm --workspace apps/client run typecheck
npm --workspace apps/client run test
npm --workspace apps/client run build
```
Sau đó chạy `npm run dev:client` và kiểm tra trực quan các trang của phase ở cả light lẫn dark, mobile lẫn desktop. Ở Phase 8 còn chạy thêm grep gate, audit và `docker build` nếu có Docker.
