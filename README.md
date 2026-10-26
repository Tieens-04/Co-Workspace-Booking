# Co-Space Working

Ứng dụng tìm kiếm và đặt phòng làm việc, hỗ trợ quản lý phòng, thanh toán, check-in và báo cáo doanh thu.

- **Khách hàng:** tìm phòng, xem lịch trống, đặt phòng, xem lịch sử và hủy đặt chỗ.
- **Quản trị viên:** quản lý phòng/ảnh, đặt phòng cho khách vãng lai, xác nhận thanh toán và theo dõi doanh thu.
- **Công nghệ:** React + TypeScript + Vite; Node.js + Express; MySQL 8 + Prisma; JWT, Cloudinary và Nodemailer.

## Chạy tại máy

Yêu cầu Node.js **24.22.1**, npm **11.11.0** và MySQL 8. `.nvmrc` là phiên bản Node chuẩn cho local và CI. Root package khai báo engines Node `>=24.22.1 <25` và npm `11.11.0`; `.npmrc` bật `engine-strict` để từ chối toolchain không tương thích. Chạy các lệnh tại thư mục gốc.

Với nvm trên macOS/Linux:

```bash
nvm install
nvm use
npm install --global npm@11.11.0
```

Với nvm-windows (chỉ định phiên bản vì không tự đọc `.nvmrc`):

```powershell
nvm install 24.22.1
nvm use 24.22.1
npm install --global npm@11.11.0
```

Cài dependencies theo lockfile đã commit và tạo cấu hình backend:

```bash
npm ci
cp apps/server/.env.example apps/server/.env
```

Root `package-lock.json` là lockfile chuẩn duy nhất cho toàn bộ npm workspaces. `pnpm-lock.yaml` và lockfile riêng `apps/client/package-lock.json` đã được loại bỏ; không tạo lại hoặc dùng package manager khác. Cài mới/CI dùng `npm ci` từ gốc. Khi chủ động đổi dependency, chạy `npm install <package>` tại gốc hoặc `npm install <package> --workspace=apps/client` (tương tự `apps/server`), commit manifest và root lockfile cùng nhau, rồi chạy lint, typecheck, test và build bên dưới.

Khi nâng toolchain, cập nhật đồng bộ `.nvmrc`, `engines` và `packageManager` trong root package, metadata root `package-lock.json`, Node base image/npm trong Dockerfiles, phiên bản npm và kiểm tra runtime trong CI, cùng hướng dẫn này. Dùng phiên bản mới để cập nhật lockfile và chạy lại `npm ci`, các kiểm tra và Docker build trước khi merge.

### Bản vá dependency và kiểm thử tooling

Các dependency trực tiếp khai báo minimum version đã vá; root lockfile khóa cả dependency gián tiếp. Chạy `npm audit` để kiểm tra toàn bộ cây dependency, kể cả công cụ development. CI chạy audit và `npm run test:tooling` sau `npm ci`; không bỏ qua advisory hoặc dùng `npm audit fix --force` để nâng major tự động.

Prisma 6.19.3 dùng `deepmerge-ts` 7 bị [stack exhaustion với cấu trúc đệ quy (GHSA-ggr8-5vv4-36mx)](https://github.com/advisories/GHSA-ggr8-5vv4-36mx). Root `overrides` chỉ thay dependency này trong `@prisma/config` bằng bản vá 8.0.0, giữ nguyên Prisma 6 và hợp đồng database. `test:tooling` kiểm tra đầu vào đệ quy và việc Prisma thực sự nạp cấu hình với merger đã vá. Chỉ bỏ override sau khi Prisma đã tự phụ thuộc bản an toàn và các kiểm tra này vẫn pass.

Vitest frontend giới hạn hai worker để giảm tranh chấp tài nguyên giữa các môi trường jsdom trên máy bận. `npm test` chạy regression tooling trước các workspace tests; không cần đặt biến môi trường riêng và không tăng timeout hay bỏ assertion.

Trong `apps/server/.env`, cấu hình `DATABASE_URL`, `JWT_SECRET` (ít nhất 32 ký tự), `CLOUDINARY_*` và `CLIENT_URL` (mặc định `http://localhost:5173`). Cấu hình `SMTP_*` nếu cần gửi email; xem các biến và chú thích trong [file mẫu](apps/server/.env.example).

Sau khi tạo database MySQL và điền cấu hình:

```bash
npm run db:generate --workspace=apps/server
npm exec --workspace=apps/server -- prisma migrate deploy
npm run dev
```

Frontend: <http://localhost:5173> · Backend: <http://localhost:5000> · Health: <http://localhost:5000/api/v1/health>.

Có thể chạy riêng bằng `npm run dev:client` hoặc `npm run dev:server`.

### Cấu hình email (CWB-44)

Email xác nhận/hủy đặt phòng mã hóa mọi dữ liệu động khi chèn vào HTML (CWB-45), để ký tự đặc biệt và mã định dạng hiển thị nguyên văn, không tạo thẻ HTML hoặc liên kết. Bản văn bản thuần và dữ liệu booking giữ nguyên; lỗi gửi email không hoàn tác booking đã lưu.

Backend đọc sáu biến SMTP sau; biến môi trường của tiến trình ưu tiên hơn giá trị trong dotenv:

| Biến          | Mặc định / ý nghĩa                                                         |
| ------------- | -------------------------------------------------------------------------- |
| `SMTP_HOST`   | `smtp.gmail.com` — máy chủ SMTP                                            |
| `SMTP_PORT`   | `587` — cổng SMTP                                                          |
| `SMTP_SECURE` | `false` — kết nối ban đầu không dùng TLS trực tiếp, nâng cấp bằng STARTTLS |
| `SMTP_USER`   | Tài khoản xác thực SMTP                                                    |
| `SMTP_PASS`   | Mật khẩu SMTP; với Gmail, dùng App Password                                |
| `SMTP_FROM`   | `"Co-Space Working" <no-reply@co-space.local>` — địa chỉ người gửi         |

`SMTP_*` là cấu hình chính. Các tên cũ `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM` chỉ được dùng làm fallback tương ứng khi không có `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Không có tài khoản/mật khẩu thì email bị tắt. Cấu hình SMTP không hợp lệ cũng tắt email và ghi cảnh báo an toàn; backend vẫn khởi động và xử lý booking/hủy booking. Lỗi gửi email không hoàn tác giao dịch đã lưu. Sửa cấu hình rồi khởi động lại backend để áp dụng.

Với Gmail, bật xác minh hai bước và tạo App Password cho `SMTP_PASS`; không dùng mật khẩu đăng nhập thông thường. Đặt `SMTP_FROM` thành tài khoản Gmail đã xác thực hoặc địa chỉ gửi được tài khoản đó cho phép. Giá trị mặc định `no-reply@co-space.local` chỉ là mẫu cho môi trường local. Dùng cổng `587` với `SMTP_SECURE=false` (STARTTLS), hoặc cổng `465` với `SMTP_SECURE=true` (TLS trực tiếp).

Chạy production trực tiếp bằng Node: sao chép `apps/server/.env.production.example` thành `apps/server/.env`, điền cấu hình, rồi chạy từ thư mục gốc:

```bash
npm run build --workspace=apps/server
npm run db:deploy --workspace=apps/server
npm run start --workspace=apps/server
```

Backend tự đọc `apps/server/.env`; không tự đọc `.env.production`. Với Docker Compose, dùng file `.env` ở gốc theo hướng dẫn bên dưới; Compose chuyển các biến SMTP vào container. Không đưa thông tin xác thực thật vào Git.

## Chạy bằng Docker

```bash
cp .env.production.example .env
# Điền cấu hình và thay các giá trị mẫu trong .env trước khi chạy.
docker compose up -d --build
```

Truy cập `http://localhost` (hoặc cổng `CLIENT_PORT` đã cấu hình). API ở `/api/v1`, healthcheck ở `/health`; backend không công khai cổng `5000`. Migrations được áp dụng tự động khi container backend khởi động qua `npm run db:deploy`, dùng Prisma CLI đã khóa trong dependencies của workspace server. Prisma CLI và client được npm hoist về dependencies ở gốc và được mang theo trong image; lệnh khởi động không tự tải Prisma phiên bản mới.

**Reverse proxy:** chạy trực tiếp giữ `TRUST_PROXY=false`, kể cả production. Compose đặt `true` để tin đúng một Nginx; Nginx ghi đè header chuyển tiếp bằng IP kết nối. Chỉ bật khi đã chặn truy cập trực tiếp backend; cần đánh giá lại nếu thêm CDN/load balancer.

**Giới hạn đăng nhập:** sau 10 lần sai liên tiếp trong 15 phút, lượt tiếp theo trả `429`; đăng nhập thành công reset bộ đếm, lỗi validation không tính. IPv6 cùng `/56` dùng chung giới hạn.

## Kiểm tra

```bash
npm run lint
npm test
npm run build
```

Các lệnh bổ sung:

```bash
npm run typecheck --workspace=apps/client
npm run typecheck:tests --workspace=apps/server
npm run format:check
```

Test tích hợp MySQL chạy bằng `npm run test:integration --workspace=apps/server`, yêu cầu `TEST_DATABASE_URL` trỏ tới database riêng có tên kết thúc bằng `_test`.

### Kiểm tra tự động trên GitHub (CWB-48)

Workflow **CI**, job **quality**, chạy trên mọi push, pull request và khi chọn Run workflow trong GitHub Actions. Ubuntu 24.04 đọc Node 24.22.1 từ `.nvmrc`, cài npm 11.11.0, in và kiểm tra phiên bản Node/npm trước `npm ci` theo root `package-lock.json`; **browser-e2e** dùng cùng quy trình. MySQL 8 được tạo mới cho mỗi job với database `cospace_ci_test`. Thông tin đăng nhập trong workflow chỉ dành cho service tạm, không truy cập hạ tầng thật. Không cần secrets SMTP/Cloudinary hay database production. Không truyền thông tin xác thực thật vào workflow này; các workflow khác nếu cần secrets phải lấy từ GitHub Actions secrets.

Để chạy quy trình tương đương tại máy, tạo database MySQL 8 riêng kết thúc bằng `_test`, cấp quyền migration/CRUD và tạo bảng tạm cho tài khoản test. Đặt `TEST_DATABASE_URL` trong môi trường shell hoặc `apps/server/.env`; giữ `DATABASE_URL` development riêng, không đặt nó bằng URL test. Chạy tại thư mục gốc:

```bash
npm ci
npm run db:generate --workspace=apps/server
npm exec --workspace=apps/server -- prisma validate
npm run db:deploy:test --workspace=apps/server
npm run lint
npm run typecheck
npm run test --workspace=apps/client
npm run test --workspace=apps/server
npm run test:integration --workspace=apps/server
npm run build
```

`db:deploy:test` kiểm tra URL bằng cùng database guard của integration trước khi gọi `prisma migrate deploy`; chỉ tiến trình Prisma con nhận `DATABASE_URL` test. Guard từ chối URL thiếu/sai, database không kết thúc `_test`, hoặc trùng tên database development kể cả khác host/user. Không dùng lệnh `db:deploy` thông thường để chuẩn bị database test. Integration chạy MySQL thật, tuần tự giữa các file, gồm overlap và hai request đặt cùng phòng/giờ. SMTP bị tắt; Cloudinary dùng cấu hình giả, upload phải được mock rõ ràng và xóa ảnh được thay bằng mock không gọi mạng. Smoke test SMTP/Nginx tiếp tục chạy riêng bằng các lệnh đã ghi bên dưới.

CI xuất console và JUnit XML cho từng bộ frontend/backend/integration, lưu artifact **test-results** trong 14 ngày, kể cả khi test thất bại. Mở Actions → lượt chạy → bước đỏ để xem lỗi; tải artifact để xem báo cáo. Nếu lỗi xảy ra trước khi test bắt đầu, báo cáo tương ứng chưa tồn tại. Mọi bước lỗi đều làm job thất bại; sửa nguyên nhân và chạy lại, không bỏ qua check. Có thể đặt **quality** thành required status check trong GitHub branch protection để chặn merge khi thất bại; workflow không tự thay đổi cấu hình bảo vệ nhánh hoặc triển khai ứng dụng.

### Kiểm tra Docker và toolchain (CWB-50)

Job **docker-build** chạy sau **quality** trên Ubuntu 24.04, timeout 30 phút. Job build cả hai production images bằng `--pull --no-cache`, kiểm tra Node 24.22.1/npm 11.11.0 trong server runner và `index.html` trong client runner. Các lệnh override entrypoint nên không khởi động ứng dụng, chạy migrations hoặc cần database/secrets. Job chỉ build và kiểm tra, không push image hay triển khai.

Sau khi chuẩn bị toolchain ở trên, có thể chạy tương đương tại gốc với Docker daemon đang hoạt động:

```bash
docker build --pull --no-cache -f apps/server/Dockerfile -t cospace-server:cwb-50 .
docker build --pull --no-cache -f apps/client/Dockerfile -t cospace-client:cwb-50 .
docker run --rm --entrypoint node cospace-server:cwb-50 --version
docker run --rm --entrypoint npm cospace-server:cwb-50 --version
docker run --rm --entrypoint sh cospace-client:cwb-50 -c 'test -s /usr/share/nginx/html/index.html'
```

Hai lệnh phiên bản phải in lần lượt `v24.22.1` và `11.11.0`; lệnh cuối phải thoát thành công. CI tự so sánh các phiên bản và thất bại nếu không khớp.

### Kiểm thử trình duyệt Customer/Admin (CWB-49)

Bộ Playwright chạy React, Express và MySQL 8 thật, gồm 15 kịch bản trên desktop
1440×900 và mobile giả lập 390×844 (Chromium, múi giờ Việt Nam). Đây không phải
kiểm thử trên điện thoại vật lý. Bộ test độc lập với Vitest.

Chuẩn bị MySQL riêng với database kết thúc `_test`, khác database development;
tài khoản test cần quyền migration và CRUD. Đặt `TEST_DATABASE_URL` trong môi
trường shell hoặc `apps/server/.env`, giữ nguyên `DATABASE_URL` development.
Không dùng database có dữ liệu thật. Chạy tại thư mục gốc:

```bash
npm ci
npm run db:generate --workspace=apps/server
npx playwright install chromium
npm run lint:e2e
npm run typecheck:e2e
npm run test:e2e
# Xem trình duyệt trong lúc chạy:
npm run test:e2e:headed
# Kiểm tra cạnh tranh nhiều lần:
npm run test:e2e -- --grep "two customer browsers race" --project=desktop --repeat-each=10
```

Runner kiểm tra database guard, áp dụng migrations, tự mở backend `127.0.0.1:5001`
và frontend `127.0.0.1:5174`, chờ health rồi chạy; tự dừng các tiến trình khi kết
thúc. Hai cổng phải trống; runner từ chối dùng lại server đang chạy. Không chạy
hai lượt E2E đồng thời trên cùng hai cổng. Nếu Prisma chưa được generate, chạy
lệnh `db:generate` ở trên; nếu kết nối MySQL lỗi, kiểm tra service và URL test.

Mỗi ca/retry tạo tài khoản, phòng và booking riêng, rồi xóa theo ID của chính ca
đó; không reset database. Booking check-in và hoàn tất được chuẩn bị ở các thời
điểm phù hợp, không chờ nhiều giờ hay đổi luật nghiệp vụ. SMTP và cả cấu hình
fallback bị vô hiệu hóa; không dùng tài khoản email/Cloudinary thật. Các luồng
chính không giả lập API; chỉ ca lỗi mạng chủ động chặn request để kiểm tra phục hồi.

Xem báo cáo bằng `npx playwright show-report`; JUnit ở `reports/e2e.xml`, screenshot
và trace lỗi ở `test-results/`. Trace chứa dữ liệu đăng nhập test, chỉ chia sẻ
trong phạm vi kiểm thử. Git bỏ qua toàn bộ báo cáo và artifact sinh ra.

CI có job **browser-e2e** sau **quality**, MySQL riêng và Chromium; chạy toàn bộ
kịch bản và lặp ca cạnh tranh 10 lần. Tối đa một retry trong CI, nhưng ca flaky
vẫn làm job thất bại. Artifact **browser-e2e-results** được giữ 14 ngày cả khi lỗi.
Job này không triển khai ứng dụng hoặc tự thay đổi branch protection.

### Kiểm tra email qua SMTP local (CWB-44)

```bash
npm run test:smoke:email --workspace=apps/server
```

Yêu cầu đã cài dependencies, Docker CLI có Docker Compose và Docker daemon đang chạy; lần đầu cần tải image MySQL/Mailpit. Test dựng MySQL và Mailpit riêng biệt, chỉ dùng tài khoản/dữ liệu giả, gửi tới SMTP local và kiểm tra email booking/hủy booking. Không cần tài khoản Gmail và không gửi email qua SMTP thật. Test tự dọn tài nguyên đã tạo khi kết thúc, báo thất bại nếu Docker/Compose không sẵn sàng và không nằm trong bộ unit test thông thường.

### Kiểm tra upload ảnh qua Nginx (CWB-43)

Ảnh phòng hỗ trợ JPEG, PNG, WebP, tối đa **10 ảnh/lần**, mỗi ảnh tối đa **5 MiB** (5 × 1024 × 1024 byte). Nginx giới hạn toàn request API ở **55 MiB**, đủ cho 50 MiB ảnh cộng phần đóng gói multipart. Backend tiếp tục kiểm tra từng ảnh, số lượng, MIME và chữ ký ảnh; giới hạn proxy không thay thế các kiểm tra này. Khi đổi policy ảnh, cần điều chỉnh giới hạn proxy tương ứng.

```bash
npm run test:smoke:upload --workspace=apps/server
```

Yêu cầu Docker CLI, Docker daemon đang chạy và cổng host `5000` đang trống (dừng backend dev trước). Lần đầu Docker cần tải `nginx:1.27-alpine`; cho phép Docker truy cập backend test trên host qua `server:host-gateway`. Smoke test dùng cấu hình Nginx production nguyên bản, cổng proxy tự cấp, Express và JWT thật; repository và Cloudinary được mock nên không cần MySQL, tài khoản Cloudinary hoặc dữ liệu thật. Test tự dọn container/server khi kết thúc và báo thất bại nếu Docker không sẵn sàng; không chạy cùng bộ unit test thông thường.

Smoke test kiểm tra ảnh 1/3/5 MiB, batch 10 × 5 MiB, giới hạn từng file/số lượng/định dạng, quyền truy cập và request trên 55 MiB bị proxy chặn trước Express. Để kiểm chứng test bắt được lỗi cấu hình cũ, đặt biến môi trường `SMOKE_NGINX_CONFIG` thành đường dẫn tuyệt đối tới bản sao `nginx.conf` đã bỏ dòng `client_max_body_size 55m;`, rồi chạy lại cùng lệnh: các upload hợp lệ trên giới hạn mặc định phải thất bại. Bỏ biến này để kiểm tra cấu hình production. Không sửa cấu hình production chỉ để chạy đối chứng.

## Nâng cấp check-in (CWB-39)

Dừng tất cả backend cũ trước khi chạy migration và khởi động backend mới; không chạy song song bản cũ vì lazy evaluator cũ có thể ghi `NO_SHOW` sai. Với Docker Compose, dừng service backend trước khi rebuild/khởi động lại.

Migration lấy một mốc UTC cố định: booking đã bắt đầu tại mốc đó giữ dữ liệu lịch sử (`attendanceTrackingEnabled = false`), không tự chuyển `NO_SHOW`; ADMIN giải quyết thủ công sau giờ kết thúc. Booking chưa bắt đầu và booking mới bật theo dõi check-in. Migration không đổi trạng thái, không tạo timestamp check-in và không suy ra khách đã đến từ `PAID`. Các trạng thái lịch sử đã ghi sai trước nâng cấp cần đối soát thủ công, không được tự sửa.

Trước nâng cấp, sao lưu database theo quy trình triển khai. Chạy `npm exec --workspace=apps/server -- prisma migrate deploy`, khởi động bản mới, rồi kiểm tra luồng ADMIN check-in và detail/list/KPI. Không hạ backend về bản evaluator cũ trên database đang hoạt động.

## Nâng cấp lịch sử phòng (CWB-42)

Dừng các backend/seed cũ trước khi migration để không bỏ sót lịch sử trạng thái.
Sao lưu database theo quy trình triển khai, chạy `npm exec --workspace=apps/server -- prisma migrate deploy`
và `npm run db:generate --workspace=apps/server`, rồi khởi động backend mới. Không chạy bản cũ song song:
mọi thao tác tạo/đổi trạng thái phòng phải ghi lịch sử cùng giao dịch.

Migration bổ sung `room_status_history` và giả định trạng thái hiện tại của mỗi phòng đã áp dụng từ ngày tạo.
Những lần bảo trì trước nâng cấp chưa từng được lưu không thể khôi phục tự động; báo cáo cũ có thể thay đổi
một lần khi áp dụng định nghĩa mới. Từ nâng cấp trở đi, đổi trạng thái phòng không viết lại lịch sử đã ghi.
Xem [kế hoạch và định nghĩa CWB-42](docs/plans/cwb-42-dashboard-occupancy.md).

## Cấu trúc và tài liệu

- `apps/client/`: giao diện React, routes, hooks và API client.
- `apps/server/`: REST API, services, repositories và Prisma migrations.
- [API và luồng nghiệp vụ](docs/application-reference.md): xác thực, phân quyền, phòng, đặt chỗ và các lệnh test theo tính năng.
- [Quy tắc giao diện](apps/client/DESIGN.md) · [Thuật ngữ](GLOSSARY.md) · [Quyết định kiến trúc](docs/adr/).
