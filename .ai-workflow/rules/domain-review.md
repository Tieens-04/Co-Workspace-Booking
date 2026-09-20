# Co-Space Working - Domain Review Rules

Áp dụng các mục liên quan đến task. Không ép mọi task phải thỏa mọi checklist.

## Project areas

Workflow này được thiết kế cho các nhóm capability chính của Co-Space Working như authentication/RBAC, room management/discovery, booking/availability, payment/check-in, notifications, admin dashboard/reporting, và security/quality.

## Authentication / Authorization

Khi task liên quan login/register/JWT/admin/customer:

- password không được lưu/log plaintext;
- auth middleware fail closed;
- role checks nằm server-side;
- UI hiding không được coi là authorization;
- CUSTOMER không truy cập ADMIN route;
- ADMIN behavior không vô tình áp dụng cho CUSTOMER;
- ownership checks nếu resource thuộc customer;
- token expiry/invalid token path;
- không leak password hash/token/sensitive fields;
- tránh mass assignment cho role/status/privileged fields.

## Room / Amenity / Room Image

Khi task liên quan Room:

- create/update relation với amenities có atomicity hợp lý;
- validate room name/capacity/price theo backend contract;
- partial update không null/overwrite field ngoài request;
- image URL normalization/validation nếu có;
- primary image uniqueness/order nếu model hỗ trợ;
- room status/maintenance semantics không bị thay đổi ngoài scope;
- filter/pagination query giữ backward compatibility;
- admin route được RBAC bảo vệ.

## Room discovery / Filters

- URL/query state và UI state đồng bộ nếu app dùng shareable filters;
- back/forward navigation không để stale state;
- debounce/cancellation để stale response không ghi đè response mới;
- pagination reset đúng khi filter thay đổi;
- invalid query params được normalize/validate nhất quán;
- loading/error/empty states phân biệt rõ.

## Booking time rules

- validate start < end;
- timezone/Date parsing không phụ thuộc môi trường ngoài chủ đích;
- slot boundary đúng với business rule;
- duration/range không vượt limit nếu có;
- không cho booking thời gian quá khứ nếu business rule cấm;
- room unavailable/maintenance được enforce server-side;
- client validation chỉ là UX, server phải authoritative.

## Availability / Overlap

- kiểm tra overlap đúng semantics của interval;
- boundary adjacent slots không bị coi overlap nếu business rule cho phép;
- cancelled booking có được tính busy hay không phải theo requirement;
- availability response và create-booking validation phải dùng cùng business semantics;
- tránh TOCTOU: availability check trước đó không được coi là lock/guarantee.

## Booking concurrency / Transaction

Nếu task liên quan chống double-booking:

- transaction boundary bao quanh toàn bộ critical section;
- locking/serialization phù hợp MySQL/Prisma implementation thực tế;
- không chỉ "check then insert" ngoài transaction;
- verify hai concurrent requests cho cùng slot: chỉ một được commit theo AC;
- rollback phải giữ dữ liệu trước transaction;
- test rollback phải thực sự gây lỗi sau một mutation nếu mục tiêu là chứng minh rollback;
- unique constraint/lock/query phải được review về race behavior thực tế.

## Booking price

- server là source of truth cho price calculation;
- không tin client-submitted total;
- decimal/rounding được xử lý nhất quán;
- negative/NaN/invalid duration bị reject;
- price tại thời điểm booking phải theo business requirement (current price vs snapshot).

## Cancellation

- ownership/RBAC;
- cancellation window/boundary;
- idempotency nếu cancel lặp;
- state transition hợp lệ;
- payment/check-in dependency nếu có;
- cancelled booking ảnh hưởng availability đúng requirement.

## Payment / Check-in

- state transition explicit và server-side validated;
- không cho skip state trái business rule;
- duplicate admin action/idempotency;
- authorization;
- revenue chỉ tính các booking/payment status theo requirement;
- không dùng frontend-only state làm source of truth.

## Notifications

- email/toast failure không được làm sai core transaction trừ khi requirement yêu cầu atomic;
- tránh gửi duplicate notification khi request retry;
- template không leak sensitive data;
- cancellation/confirmation trigger đúng state transition.

## Admin dashboard / Reports

- KPI definition khớp business requirement;
- date range/timezone;
- cancelled/unpaid booking inclusion/exclusion;
- aggregate không double count join relation;
- permission ADMIN;
- empty dataset behavior;
- expensive query/pagination nếu applicable.

## Frontend state / React

- stale async response;
- request cancellation/sequence guard;
- state reset khi chuyển entity;
- form preload race;
- double submit;
- disabled state trong request;
- loading/error/success/empty feedback;
- controlled/uncontrolled input consistency;
- modal/dialog keyboard behavior nếu dùng modal;
- focus/escape/trap nếu component là dialog thực sự.

## Express API

- status code semantics;
- validation trước service mutation;
- centralized error mapping nếu project có;
- không leak stack trace/internal DB detail;
- RBAC/auth middleware đúng order;
- body/query/params parsing rõ ràng;
- only allow intended fields.

## Prisma / MySQL

- nested writes/transactions;
- relation connect/disconnect semantics;
- null vs undefined trong PATCH;
- decimal conversion;
- transaction rollback;
- raw SQL parameterization;
- locking query tương thích transaction connection/context;
- N+1/over-fetching ở list endpoint nếu có impact rõ.

## Security / Validation

- input validation server-side;
- CORS/rate-limit changes không weaken security;
- raw SQL luôn parameterized;
- login brute-force protection nếu task liên quan;
- secrets không vào code/log;
- error messages không leak sensitive account existence ngoài intended behavior.

## Release / Regression

- client/server build;
- relevant tests;
- smoke path customer;
- smoke path admin;
- no skipped tests;
- no debug code;
- no accidental migration/dependency changes.
