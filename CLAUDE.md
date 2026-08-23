# Crypto Strategy Lab — Agent Instructions

Đồ án **Kiến trúc phần mềm**: nền tảng phân tích, kết hợp, backtest, và xếp hạng chiến lược giao dịch crypto. Mục tiêu của đồ án là **chứng minh kiến trúc mở rộng được** (thêm strategy mới, đổi search algorithm, đổi market-data provider... mà không phải sửa code không liên quan) — **không phải** tìm chiến lược sinh lời thật.

Đây là file chỉ dẫn nạp cho mọi phiên Claude Code làm việc trong repo này. Đọc file này trước, sau đó đọc `CLAUDE.md` trong đúng subfolder `docs/` liên quan tới việc bạn đang làm.

## Cấp độ hiệu lực của từng nguồn tài liệu

| Nguồn | Cấp độ | Ý nghĩa |
|---|---|---|
| `docs/about-projects/` | **Binding — bám chính xác** | Đây là bản dịch lại đề bài gốc của giảng viên. Không tự ý đổi phạm vi, không tự thêm/bớt yêu cầu. Xem [docs/about-projects/CLAUDE.md](docs/about-projects/CLAUDE.md). |
| `docs/ui-prototype/` | **Binding — bám sát** | UI đã được duyệt. Port đúng layout/luồng màn hình này sang React, không tự vẽ lại UI. Xem [docs/ui-prototype/CLAUDE.md](docs/ui-prototype/CLAUDE.md). |
| `docs/software-architecture/` | **Tham khảo — có thể sửa/đập đi xây lại** | Do nhóm tự viết tay, có thể sai hoặc mâu thuẫn với các doc khác. Xem [docs/software-architecture/CLAUDE.md](docs/software-architecture/CLAUDE.md). |
| `docs/database/` | **Tham khảo — có thể sửa/đập đi xây lại** | Cùng lý do trên. Xem [docs/database/CLAUDE.md](docs/database/CLAUDE.md). |
| `docs/modules-specification/` | **Tham khảo — có thể sửa/đập đi xây lại** | Cùng lý do trên. Xem [docs/modules-specification/CLAUDE.md](docs/modules-specification/CLAUDE.md). |
| `docs/prototype/` | **Lỗi thời — bỏ qua** | HTML prototype cũ, đã bị thay bằng `docs/ui-prototype/`. Đừng dùng làm tham chiếu UI. |
| `docs/superpowers/` | **Lỗi thời — bỏ qua** (trừ `docs/superpowers/plans/` — nơi lưu implementation plan đang chạy, xem mục riêng bên dưới) | Spec/plan của lần scaffold đầu tiên (trước khi có `docs/about-projects` v.v.). Không còn là nguồn sự thật cho scope hiện tại. |
| `database/` (root, **khác** `docs/database/`) | **Hạ tầng thật, đã merge vào `main`** — không phải tài liệu tham khảo | Migration runner + SQL migrations thật của đồng đội (`database/migrate.js`, `database/migrations/*.sql`, `database/seeds/`), **đã chạy thật**, code trong `service/src/` được viết dựa trên schema này. Đang được migrate sang mô hình Candidate+Auth theo `docs/database/` (xem `artifacts/decisions.md` mục 4c) — dùng đúng convention SQL-file-đánh-số có sẵn của `database/migrate.js`, **không** thêm công cụ migration thứ 2. |

**Quy tắc bắt buộc — không được tự suy đoán khi:**
1. `docs/about-projects/` hoặc `docs/ui-prototype/` không nói rõ một hành vi/luồng cụ thể, HOẶC
2. các file tham khảo (`software-architecture/`, `database/`, `modules-specification/`) mâu thuẫn với nhau hoặc với `about-projects/`.

Trong hai trường hợp này, **DỪNG LẠI và hỏi lại người dùng** thay vì tự chọn một phương án. Xem chi tiết quy trình + danh sách mâu thuẫn đã biết ở skill `resolve-before-coding` (`.claude/skills/resolve-before-coding/SKILL.md`) — **bắt buộc invoke skill này trước khi bắt đầu implement bất kỳ module nào**.

## Mâu thuẫn đã biết giữa các file tham khảo (cần hỏi người dùng trước khi code phần liên quan)

- **Mô hình dữ liệu Search/Candidate:** `docs/software-architecture/data.md` gắn thẳng `strategy_id` vào bảng `experiments` (không có khái niệm Candidate tách biệt). `docs/database/Schema explanation.md` tách hẳn `experiments → experiment_configs → candidates → candidate_strategies`, với luận điểm rõ ràng "Strategy = loại thuật toán, Candidate = tham số cụ thể". Đây là 2 mô hình dữ liệu khác nhau, không tương thích trực tiếp.
- **Danh sách strategy nền tảng:** `docs/about-projects` liệt kê ví dụ MVP gồm MA, RSI, Bollinger Bands, Support/Resistance (4 loại). `docs/database` chỉ định nghĩa 3 strategy nền (`MA`, `RSI`, `BB`) làm ví dụ chính, không nhắc Support/Resistance ở tầng bảng `strategies`.
- **Sentiment model:** `docs/software-architecture/system.md` nói dùng **FinBERT** (local) + OpenRouter LLM fallback. `docs/database/news_format.json` (ví dụ mẫu) lại ghi model là **PhoBERT**. Hai model khác nhau, có thể chỉ là ví dụ cũ chưa cập nhật.
- **Tín hiệu chuẩn hoá:** `docs/about-projects` và `docs/software-architecture` đều dùng `BUY/SELL/HOLD`. `docs/modules-specification/strategy-engine.md` lại để ngỏ cả `BUY/SELL/HOLD` **hoặc** `LONG/SHORT/NONE` như hai lựa chọn — chưa chốt.
- **Auth:** `docs/software-architecture` chỉ nhắc AuthModule mơ hồ ("Pro Student" plan tier), không có schema. `docs/database` có đầy đủ bảng `users`/`refresh_tokens` và coi hệ thống là multi-user có đăng nhập. Chưa rõ MVP có bắt buộc auth thật hay không.

Không tự chọn 1 bên cho các điểm trên khi bắt đầu code module liên quan (Strategy/Search/Backtest, Sentiment, Auth) — hỏi người dùng trước.

## Artifacts — nơi ghi lại thiết kế thật đã build

Thư mục [artifacts/](artifacts/) chứa tài liệu tiếng Việt mô tả **những gì thực sự được xây** (khác với `docs/` là input/tham khảo đầu vào). Cập nhật liên tục trong lúc code — đây là tài liệu nhóm dùng để chuẩn bị vấn đáp. Xem [artifacts/README.md](artifacts/README.md) để biết cấu trúc.

## Trạng thái code hiện tại — `service/` có code thật đáng kể, `web-platform/` vẫn là stub

**Cập nhật 2026-08-23:** `service/src/` **không phải stub rỗng** — đã có ~2700 dòng code thật, chạy được: Market Data (Binance client thật + candle repository), Strategy Engine (indicators, base strategy), Strategy Search (domain-guided random generator + candidate fingerprinting, có test), Backtesting (mô phỏng trade + evaluation, có test), Leaderboard, Composite Strategy. Dùng raw `pg` (không ORM) qua `DatabaseService`/`DatabaseModule` — giữ nguyên cách này.

**Nhưng code này dùng mô hình dữ liệu phẳng + session ẩn danh (`session_id` qua cookie, không auth thật), khác với quyết định đã chốt** (xem `artifacts/decisions.md` mục 1, 4, 4b) — đang được migrate sang mô hình Candidate tách riêng + Auth thật theo plan `docs/superpowers/plans/2026-08-23-foundation-candidate-auth-migration.md`. Trước khi sửa bất cứ gì trong `service/src/modules/strategy-search/`, `backtesting/`, `leaderboard/`, hoặc `database/` — đọc plan đó trước để biết trạng thái migrate tới đâu, tránh code chồng lên nhau.

- `web-platform/`: vẫn là page stub theo IA cũ (`/strategies`, `/search`, `/leaderboard`...) — **chưa động tới**, cần port theo `docs/ui-prototype/` (1 màn hình dạng TradingView, không phải multi-page). Đây thực sự là phần chưa làm gì, không phải đã có code cần migrate.
- Có `docker-compose.yml` ở root (TimescaleDB + api service) — dùng cái này, không tạo file docker-compose mới.
- Redis, Python workers (crawler/sentiment): chưa có gì, cần xây từ đầu.

**Bài học:** Đừng suy đoán trạng thái code chỉ từ tài liệu spec cũ (`docs/superpowers/`) hoặc từ việc liệt kê thư mục nông (`ls` 1-2 cấp) — luôn đọc sâu nội dung file thật trong `service/src/` và `web-platform/src/` trước khi viết plan/code cho một module, vì code có thể đã tiến xa hơn nhiều so với tài liệu scaffold ban đầu.

**Quy tắc áp dụng code draft:** Được phép giữ lại phần còn hợp lý, cũng được phép đập đi viết lại module/file bất kỳ nếu không khớp `docs/about-projects/` + `docs/ui-prototype/` + các quyết định đã chốt trong `artifacts/decisions.md`. Không cần hỏi trước khi refactor thuần kỹ thuật — chỉ hỏi khi gặp mâu thuẫn *thiết kế/hành vi/business logic* thật sự (xem mục "Mâu thuẫn đã biết" và `artifacts/decisions.md`).

## Làm việc nhóm qua git — đọc trước khi tạo branch/PR

Repo này đang có nhiều người code song song qua các nhánh riêng trên GitHub (`origin/database`, `origin/market`, `origin/search`, `origin/strategy-plugin`, `origin/crawler_sentiment_worker`, `origin/tahi`...), merge liên tục vào `main`. **Trạng thái `main` có thể đổi bất cứ lúc nào** do người khác push — đừng giả định trạng thái đã biết từ đầu phiên vẫn còn đúng cho một task lớn/dài hơi; chạy `git fetch` và kiểm tra lại trước khi bắt đầu công việc ảnh hưởng nhiều file (đặc biệt là migration DB, vốn ảnh hưởng mọi nhánh khác).

Trước khi bắt đầu 1 plan/thay đổi lớn: xác nhận đang ở đúng branch dự định (không tự ý làm việc lớn trên `main` nếu chưa được người dùng đồng ý rõ ràng), và cân nhắc việc thay đổi có thể xung đột với nhánh đang mở của người khác không (đặc biệt: đổi schema DB) — nếu có rủi ro xung đột cao, đây là điều cần hỏi người dùng trước khi tiến hành (xem skill `resolve-before-coding`).

## Nguyên tắc kiến trúc bắt buộc (từ `docs/about-projects/03-anti-patterns-to-avoid.md`)

Không vi phạm các anti-pattern sau dù ở giai đoạn code nhanh nào: God Service, hard-coded strategy branching (`if MA && RSI...`), business logic trong frontend, strategy truy cập DB trực tiếp, crawler gắn cứng vào 1 model ML, frontend gọi thẳng Binance, uncontrolled infinite loop, overwrite strategy history. Chi tiết đầy đủ trong file gốc.

## Ngôn ngữ

Code, tên biến, comment: tiếng Anh (theo chuẩn thực hành). Tài liệu trong `artifacts/`: **tiếng Việt** (theo yêu cầu người dùng, phục vụ vấn đáp).
