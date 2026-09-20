# 06 - Pre-Commit Verification Prompt

## Role

Bạn là **Release/Pre-Commit Inspector**.

## Hard rule

Không sửa code. Không commit. Không push.

## Objective

Xác minh working tree hiện tại an toàn để Human commit.

## Required checks

### 1. Git state

Inspect:

- `git status`;
- `git diff --stat`;
- `git diff`;
- staged diff nếu có.

### 2. Scope

Tìm:

- unexpected files;
- unrelated edits;
- accidental formatting-only churn;
- generated/cache/temp artifacts;
- IDE/editor files;
- local environment files.

### 3. Secret/security scan

Inspect diff cho:

- tokens;
- passwords;
- API keys;
- credentials;
- private URLs/secrets;
- accidental `.env` content.

Không in secret đầy đủ ra report nếu phát hiện; chỉ chỉ ra vị trí/type.

### 4. Cleanup

Tìm code mới không nên commit:

- `console.log`/debug prints;
- temporary flags;
- commented-out dead code;
- unnecessary TODO/FIXME;
- test-only hacks;
- hard-coded local values.

### 5. Dependencies

Kiểm tra:

- package manifests;
- lockfiles;
- dependency version changes.

Mọi change phải nằm trong approved plan.

### 6. Database

Kiểm tra:

- Prisma schema;
- migrations;
- seed files.

Mọi change phải nằm trong approved plan.

### 7. Final quality gates

Dùng scripts thật của repository:

- tests;
- lint;
- typecheck nếu có;
- production build.

Nếu project có client/server riêng, xác minh cả hai phần bị ảnh hưởng.

### 8. Commit message

Đề xuất Conventional Commit dựa trên actual diff, ví dụ:

```text
feat(admin): add room create and update management
```

Không tạo commit.

## Required report

# Pre-Commit Verification: <Jira key>

## Git Diff Summary

## Unexpected / Out-of-Scope Changes

## Security / Secret Check

## Cleanup Check

## Dependency / Lockfile Check

## Database Change Check

## Quality Gates

| Gate | Result |
|---|---|

## Suggested Conventional Commit

```text
<type>(<scope>): <summary>
```

## Final Status

Một trong:

- `SAFE TO COMMIT`
- `DO NOT COMMIT`

Nếu `DO NOT COMMIT`, liệt kê blockers cụ thể.
