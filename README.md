# 🏢 Co-Space Working - Co-Workspace Booking Platform

Hệ thống quản lý và đặt chỗ làm việc (Co-Working Space Booking System) hỗ trợ tìm phòng, kiểm tra slot trống theo thời gian thực, đặt phòng chống trùng lịch và quản trị nghiệp vụ.

---

## 🛠️ Kiến Trúc Công Nghệ

Dự án được tổ chức theo mô hình **Monorepo** với `npm workspaces`:

- **Frontend (`apps/client`)**: React 19, TypeScript, Vite, Axios.
- **Backend (`apps/server`)**: Express.js, TypeScript, áp dụng **Clean Architecture** (Domain - Repository - Service - Controller).
- **Code Quality**: Prettier & ESLint cấu hình thống nhất toàn monorepo.

---

## 📋 Yêu Cầu Môi Trường

- **Node.js**: phiên bản `>= 20.x` (khuyến nghị `22.x` hoặc `24.x`)
- **npm**: phiên bản `>= 10.x`

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Cài đặt toàn bộ dependencies
Chạy lệnh duy nhất tại thư mục gốc:
```bash
npm install
```

### 2. Cấu hình biến môi trường
Tạo file `.env` cho backend:
```bash
cp apps/server/.env.example apps/server/.env
```

### 3. Khởi chạy dự án ở chế độ Development

- **Chạy cả Frontend và Backend song song (Khuyến nghị):**
  ```bash
  npm run dev
  ```
  - Backend: `http://localhost:5000` (Health Check: `http://localhost:5000/api/v1/health`)
  - Frontend: `http://localhost:5173`

- **Hoặc chạy riêng từng ứng dụng:**
  ```bash
  npm run dev:server   # Chỉ chạy Backend
  npm run dev:client   # Chỉ chạy Frontend
  ```

---

## 🔍 Kiểm Tra Chất Lượng Mã Nguồn (Lint & Format)

```bash
# Kiểm tra lỗi cú pháp và conventions bằng ESLint
npm run lint

# Tự động định dạng mã nguồn bằng Prettier
npm run format

# Kiểm tra xem code đã được format đúng chuẩn chưa
npm run format:check

# Build kiểm tra kiểu dữ liệu TypeScript (Production Build)
npm run build
```

---

## 📁 Cấu Trúc Thư Mục Backend (Clean Architecture)

```text
apps/server/src/
├── config/          # Cấu hình môi trường, hằng số hệ thống
├── domain/          # Entities & Business Models độc lập
├── repositories/    # Data Access Layer (Prisma ORM query)
├── services/        # Business Logic & Use Cases (Quy tắc đặt cọc, tính tiền, overlap)
├── controllers/     # HTTP Request Handlers (Nhận request và phản hồi)
├── routes/          # Định tuyến API (/api/v1/...)
├── middlewares/     # JWT Authentication, RBAC, Validate input, Error handling
└── utils/           # Response formatters, logger, helper functions
```