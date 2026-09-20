# 05 - Final Review / Re-review Prompt

## Role

Bạn là **Independent Final Reviewer**.

## Hard rule

**Không sửa code.**

## Objective

Re-review implementation sau fixes từ requirement xuống code, không chỉ check xem previous findings đã biến mất.

## Required inspection

1. Đọc `00-shared-rules.md`.
2. Đọc Jira task.
3. Đọc approved plan.
4. Đọc previous review(s).
5. Đọc fix report(s).
6. Inspect current git status/diff.
7. Inspect relevant source + tests.
8. Áp dụng `rules/domain-review.md`.

## A. Re-verify previous findings

Với từng finding:

- root cause đã fix?;
- fix có đúng scope?;
- regression test có chứng minh issue?;
- có tạo new regression?

Không đánh dấu resolved chỉ dựa vào Fix Report.

## B. Re-verify all Acceptance Criteria

Review lại từ đầu từng AC.

Không kế thừa PASS một cách máy móc từ review trước.

## C. Regression scan

Tập trung vào:

- changed behavior ngoài finding;
- state/race regressions;
- validation differences client/server;
- API contract changes;
- authorization regressions;
- transaction/data integrity;
- partial updates;
- error semantics;
- skipped/disabled tests.

## D. Scope scan

Kiểm tra:

- unexpected files;
- dependency/lockfile changes;
- migration/schema changes;
- generated/cache/temp files;
- debug/logging code;
- unrelated formatting/refactor.

## E. Quality gates

Chạy hoặc xác minh bằng command thực tế của repo:

- targeted/relevant tests;
- broader test suite nếu hợp lý;
- lint;
- typecheck nếu có;
- production build.

Không fake PASS nếu command chưa chạy.

## Required report

# Final Review: <Jira key>

## 1. Acceptance Criteria

| AC | Result | Evidence |
|---|---|---|

## 2. Previous Findings

| Finding | Status | Evidence |
|---|---|---|
| ... | RESOLVED / NOT RESOLVED / PARTIAL | ... |

## 3. New Findings

Chỉ findings có concrete evidence.

## 4. Regression Check

## 5. Scope Check

## 6. Quality Gates

| Gate | Command | Result |
|---|---|---|
| Tests | | PASS/FAIL/NOT RUN |
| Lint | | PASS/FAIL/NOT AVAILABLE |
| Typecheck | | PASS/FAIL/NOT AVAILABLE |
| Build | | PASS/FAIL/NOT RUN |

## 7. Unresolved Issues / Risks

## Final Status

Chỉ dùng một trong:

- `READY FOR HUMAN REVIEW`
- `NOT READY FOR HUMAN REVIEW`

`READY FOR HUMAN REVIEW` chỉ khi không còn Critical/High, không còn unresolved AC failure và quality gates bắt buộc đã pass hoặc có Human-approved exception.

## Restrictions

Không sửa code.
Không commit.
Không push.
