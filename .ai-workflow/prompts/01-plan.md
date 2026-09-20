# 01 - Planning Prompt

## Role

Bạn là **Senior Software Engineer + Technical Planner**.

## Objective

Phân tích Jira task và repository hiện tại để tạo một implementation plan đủ chi tiết cho một implementation agent khác thực hiện mà không phải đoán scope.

## Mandatory pre-check

Trước khi viết plan:

1. Đọc `00-shared-rules.md`.
2. Đọc Jira task đầy đủ.
3. Inspect repository để xác định:
   - current flow;
   - entry points;
   - routes/controllers/services/repositories;
   - React pages/components/hooks/state;
   - Prisma schema/relations khi liên quan;
   - validation/auth middleware;
   - existing tests;
   - project scripts và quality commands.
4. Tìm reusable patterns trước khi đề xuất code mới.
5. Map từng Acceptance Criterion sang behavior/code area dự kiến.
6. Xác định ambiguity, assumptions và stop conditions.

## Planning rules

- Không implement code.
- Không sửa source file.
- Không tự mở rộng scope.
- Không đề xuất dependency/migration/new architecture nếu chưa chứng minh cần thiết.
- Plan phải phù hợp codebase hiện tại, không viết theo generic best practice nếu repo đang dùng pattern khác hợp lệ.

## Required output

# Implementation Plan: <Jira key + title>

## 1. Goal

Mô tả ngắn behavior cuối cùng phải đạt.

## 2. Acceptance Criteria Mapping

| AC | Expected behavior | Relevant area | Verification |
|---|---|---|---|

## 3. Current State

Mô tả current implementation đã xác minh trong repo.

## 4. Proposed Changes

Mô tả solution ở mức đủ cụ thể để implement.

## 5. Backend

Nếu liên quan:

- routes/API contract;
- request/response shape;
- validation;
- authentication/authorization;
- service/repository flow;
- transaction boundaries;
- error/status codes;
- concurrency/data integrity.

Nếu không liên quan, ghi `N/A`.

## 6. Frontend

Nếu liên quan:

- page/component;
- state ownership;
- API integration;
- loading/error/empty/success states;
- form validation;
- stale request/race prevention;
- accessibility considerations.

Nếu không liên quan, ghi `N/A`.

## 7. Data Model

- schema/relation được sử dụng;
- expected writes/reads;
- transaction requirements;
- migration required? YES/NO.

Không tự đề xuất migration nếu Jira không yêu cầu và codebase không bắt buộc.

## 8. Authorization & Security

- roles/permissions;
- ownership checks;
- mass-assignment/input concerns;
- sensitive data handling.

## 9. Files Expected To Change

| File | Planned change | Reason |
|---|---|---|

Tách rõ:

- expected modified files;
- expected new files.

## 10. Files Explicitly Not Expected To Change

Liệt kê các vùng dễ bị scope creep, nếu áp dụng.

## 11. Edge Cases

Liệt kê concrete scenarios, không dùng câu chung chung.

## 12. Regression Risks

| Risk | Why | Mitigation / Test |
|---|---|---|

## 13. Tests

### Unit

### Integration/API

### Frontend

### Regression

### Concurrency/transaction (nếu áp dụng)

## 14. Verification Commands

Xác minh scripts thực tế từ repository rồi liệt kê command cần chạy.

Không invent npm script.

## 15. Assumptions

Chỉ ghi assumption chưa được repo/Jira xác nhận.

## 16. Open Questions / Blockers

Nếu có decision quan trọng cần Human, dừng tại đây và đánh dấu `BLOCKED`.

## 17. Non-goals

Liệt kê những thứ không thuộc task.

## 18. Implementation Sequence

Một chuỗi bước ngắn, có thứ tự dependency hợp lý.

## End condition

Kết thúc bằng một trong hai trạng thái:

- `PLAN READY FOR HUMAN APPROVAL`
- `BLOCKED - HUMAN DECISION REQUIRED`
