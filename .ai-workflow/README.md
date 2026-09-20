Co-Space Working - AI Development Workflow
Workflow chuẩn để phối hợp Codex (Planner/Reviewer) và Antigravity (Implementer/Fixer) theo từng Jira task.
Pipeline
```text
Jira Task
  -> Codex Pre-check + Plan
  -> Human Plan Approval
  -> Antigravity Implement + Self-check
  -> Codex Independent Review
  -> Antigravity Fix (nếu có findings)
  -> Codex Re-review / Final Review
  -> Codex Pre-commit Verification
  -> Human Smoke Review
  -> Commit / Push
```
Nguyên tắc cốt lõi:
Jira Description + Acceptance Criteria là requirement source of truth.
Existing architecture/constraints đứng trước Plan nếu Plan mâu thuẫn với codebase thực tế.
Plan là hướng triển khai đã duyệt, không phải requirement tuyệt đối.
Reviewer không sửa code trong lượt review.
Implementer/Fixer không commit hoặc push.
Sau mỗi vòng fix phải re-review.
`Tests pass` không đồng nghĩa `Task done`.
Roles
Role	Agent	Trách nhiệm
Planner	Codex	Phân tích repo, requirement, lập plan
Implementer	Antigravity	Implement theo approved plan, thêm tests, self-check
Reviewer	Codex	Independent review theo Jira + Plan + current diff
Fixer	Antigravity	Minimal safe fix cho confirmed findings
Final gate	Codex	Re-review + pre-commit verification
Approver	Human	Approve plan, smoke test, quyết định commit/push
Folder layout
```text
.ai-workflow/
├── README.md
├── prompts/
│   ├── 00-shared-rules.md
│   ├── 01-plan.md
│   ├── 02-implement.md
│   ├── 03-review.md
│   ├── 04-fix.md
│   ├── 05-final-review.md
│   └── 06-precommit.md
├── rules/
│   └── domain-review.md
└── tasks/
    └── _TEMPLATE/
        ├── jira.md
        └── status.md
```
Setup một lần
Copy folder `.ai-workflow` vào root repository.
Khuyến nghị thêm vào `.gitignore` nếu không muốn commit execution artifacts của từng Jira task:
```gitignore
# AI workflow task artifacts
.ai-workflow/tasks/*
!.ai-workflow/tasks/_TEMPLATE/
!.ai-workflow/tasks/_TEMPLATE/**
```
Các prompt/rules nên commit vào Git. Thư mục task thực thi có thể giữ local.
Bắt đầu một Jira task
Ví dụ task key là `COS-2008`:
```bash
git checkout main
git pull
git checkout -b feat/COS-2008-admin-room-crud

mkdir -p .ai-workflow/tasks/COS-2008
cp .ai-workflow/tasks/_TEMPLATE/jira.md .ai-workflow/tasks/COS-2008/jira.md
cp .ai-workflow/tasks/_TEMPLATE/status.md .ai-workflow/tasks/COS-2008/status.md
```
Paste nguyên Jira Description + Acceptance Criteria vào `jira.md`.
1. Codex - Plan
Prompt ngắn dùng trong Codex:
```text
Task: COS-2008

Read:
- .ai-workflow/prompts/00-shared-rules.md
- .ai-workflow/prompts/01-plan.md
- .ai-workflow/tasks/COS-2008/jira.md
- .ai-workflow/rules/domain-review.md

Analyze the current repository and create the implementation plan.
Write the final plan to:
.ai-workflow/tasks/COS-2008/plan.md

Do not implement code.
```
Sau đó Human review plan trước khi implement.
2. Antigravity - Implement
```text
Task: COS-2008

Read:
- .ai-workflow/prompts/00-shared-rules.md
- .ai-workflow/prompts/02-implement.md
- .ai-workflow/tasks/COS-2008/jira.md
- .ai-workflow/tasks/COS-2008/plan.md
- .ai-workflow/rules/domain-review.md

Implement the approved plan.
Write the implementation report to:
.ai-workflow/tasks/COS-2008/implementation-report.md

Do not commit. Do not push.
```
3. Codex - Independent Review
Nên dùng một review context/chat mới nếu thuận tiện.
```text
Task: COS-2008

Read:
- .ai-workflow/prompts/00-shared-rules.md
- .ai-workflow/prompts/03-review.md
- .ai-workflow/tasks/COS-2008/jira.md
- .ai-workflow/tasks/COS-2008/plan.md
- .ai-workflow/tasks/COS-2008/implementation-report.md
- .ai-workflow/rules/domain-review.md

Review the current git diff and all relevant surrounding code.
Write the report to:
.ai-workflow/tasks/COS-2008/review-01.md

Do not modify code.
```
4. Antigravity - Fix findings
Chỉ chạy nếu review có confirmed findings.
```text
Task: COS-2008

Read:
- .ai-workflow/prompts/00-shared-rules.md
- .ai-workflow/prompts/04-fix.md
- .ai-workflow/tasks/COS-2008/jira.md
- .ai-workflow/tasks/COS-2008/plan.md
- .ai-workflow/tasks/COS-2008/review-01.md

Fix only the confirmed findings using minimal safe changes.
Write the fix report to:
.ai-workflow/tasks/COS-2008/fix-report.md

Do not commit. Do not push.
```
5. Codex - Final Review
```text
Task: COS-2008

Read:
- .ai-workflow/prompts/00-shared-rules.md
- .ai-workflow/prompts/05-final-review.md
- .ai-workflow/tasks/COS-2008/jira.md
- .ai-workflow/tasks/COS-2008/plan.md
- .ai-workflow/tasks/COS-2008/review-01.md
- .ai-workflow/tasks/COS-2008/fix-report.md
- .ai-workflow/rules/domain-review.md

Re-review the current implementation from the Jira acceptance criteria down.
Write the final report to:
.ai-workflow/tasks/COS-2008/final-review.md

Do not modify code.
```
Nếu còn blocking finding, quay lại bước Fix rồi Final Review lại.
6. Codex - Pre-commit verification
Chỉ chạy khi final review trả `READY FOR HUMAN REVIEW`.
```text
Task: COS-2008

Read:
- .ai-workflow/prompts/00-shared-rules.md
- .ai-workflow/prompts/06-precommit.md
- .ai-workflow/tasks/COS-2008/jira.md
- .ai-workflow/tasks/COS-2008/plan.md
- .ai-workflow/tasks/COS-2008/final-review.md

Perform pre-commit verification against the current working tree.
Do not modify code. Do not commit.
```
Human gate trước commit
Kiểm tra tối thiểu:
Jira AC đã được đáp ứng theo behavior thực tế.
`git diff --stat` hợp lý.
Không có file ngoài scope.
Không có API/schema/auth change bất ngờ.
Test mới hợp lý và không bị skip để suite pass.
Nếu có frontend: mở UI và smoke-test happy path + một negative path.
Đọc `Deviations`, `Remaining Risks`, `Unresolved Issues`.
Chỉ commit khi pre-commit trả `SAFE TO COMMIT` và Human review đồng ý.
Severity gate
Critical: STOP, bắt buộc fix.
High: bắt buộc fix trước commit.
Medium: mặc định fix trước commit; chỉ defer khi Human chấp thuận và có lý do/documentation.
Low: fix hoặc defer có chủ đích.
Stop conditions
Agent phải STOP AND REPORT thay vì tự quyết khi phát hiện:
Jira AC mâu thuẫn hoặc thiếu behavior quan trọng.
Cần migration/schema change ngoài approved plan.
Cần dependency mới ngoài approved plan.
Cần breaking API change ngoài approved plan.
Cần thay đổi auth/RBAC architecture ngoài approved plan.
Cần destructive data operation.
Cần refactor lớn ngoài scope.
Existing tests phản ánh requirement khác Jira.
Không thể chạy một quality gate bắt buộc vì environment/tooling lỗi.
Task lifecycle
```text
BACKLOG
 -> PLANNING
 -> PLAN_APPROVED
 -> IMPLEMENTING
 -> IMPLEMENTED
 -> IN_REVIEW
 -> CHANGES_REQUESTED (nếu có)
 -> FIXING
 -> RE_REVIEW
 -> READY_FOR_HUMAN_REVIEW
 -> QUALITY_GATE_PASSED
 -> COMMITTED
 -> PUSHED
 -> DONE
```