# Shared Rules - Co-Space Working AI Workflow

Các rule này áp dụng cho mọi Planner, Implementer, Reviewer và Fixer.

## 1. Source of truth priority

Khi có mâu thuẫn, ưu tiên:

1. Jira Description + Acceptance Criteria.
2. Existing architecture, database constraints, API contracts và project conventions đã được xác minh trong repo.
3. Approved Implementation Plan.
4. Agent assumptions.

Không được làm implementation "đúng plan" nhưng sai Jira.

## 2. Scope discipline

- Không tự thêm feature.
- Không unrelated refactor.
- Không đổi dependency/version nếu không nằm trong plan.
- Không đổi schema/migration nếu không nằm trong plan.
- Không đổi public API contract nếu không nằm trong plan.
- Không đổi auth/RBAC behavior ngoài scope.
- Không format/rewrite file lớn không liên quan.

## 3. Evidence over assumption

Trước khi kết luận:

- đọc code thực tế;
- đọc relevant tests;
- kiểm tra git diff;
- xác minh project scripts/config;
- không đoán command, route, schema hay convention nếu repo đã có câu trả lời.

Nếu không xác minh được, ghi rõ `UNKNOWN` hoặc `ASSUMPTION`.

## 4. Stop conditions

STOP AND REPORT nếu task đòi hỏi một trong các việc sau mà approved scope/plan không cho phép:

- migration/schema change;
- dependency mới;
- breaking API change;
- destructive data operation;
- auth/RBAC architecture change;
- large cross-cutting refactor;
- requirement decision có tác động business quan trọng;
- test hiện tại mâu thuẫn với Jira AC;
- quality gate không thể chạy vì tooling/environment.

Format:

```text
BLOCKED

Reason:
...

Evidence:
...

Impact:
...

Decision needed:
...
```

## 5. Quality expectations

Tùy task, phải xem xét:

- correctness;
- validation;
- authorization/RBAC;
- error handling;
- loading/empty/success states;
- data integrity;
- transaction atomicity;
- concurrency/race conditions;
- API compatibility;
- frontend state consistency;
- accessibility;
- performance ở mức hợp lý;
- tests chứng minh behavior;
- regression risk.

## 6. Tests

- Test behavior quan trọng, không chỉ implementation details.
- Không xóa/skip test để làm suite pass nếu không có approved reason.
- Bug fix nên có regression test khi khả thi.
- Transaction/concurrency bugs cần test chứng minh semantics thực tế nếu repo/tooling cho phép.

## 7. Git safety

Trừ khi Human yêu cầu rõ ràng:

- không commit;
- không push;
- không force reset;
- không force checkout làm mất work;
- không rewrite history;
- không xóa untracked file không thuộc task.

## 8. Definition of Done

Task chưa DONE chỉ vì:

- code compile;
- tests pass;
- implementer nói complete.

Task chỉ sẵn sàng commit khi:

- Jira AC đã được re-verified;
- blocking findings đã resolved;
- final review không tìm thấy blocking regression;
- relevant tests/lint/typecheck/build pass;
- pre-commit inspection sạch;
- Human review đồng ý.
