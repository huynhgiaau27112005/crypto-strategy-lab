---
name: resolve-before-coding
description: Use before implementing any backend module, database table, or API contract in this repo — when the about-projects/ui-prototype spec is silent on a needed behavior, or the software-architecture/database/modules-specification reference docs disagree with each other or with about-projects.
---

# Resolve Before Coding

## Overview

Trong repo này, `docs/about-projects/` và `docs/ui-prototype/` là **binding** (bám chính xác). `docs/software-architecture/`, `docs/database/`, `docs/modules-specification/` là **tham khảo do nhóm tự viết tay, có thể sai hoặc mâu thuẫn nhau**. Khi hai nhóm tài liệu này xung đột, hoặc khi cả hai đều im lặng về một quyết định cần thiết để code, agent **không được tự chọn một phương án và code tiếp** — phải dừng lại và hỏi người dùng.

Đây là quy tắc kỷ luật, không phải gợi ý — vì repo đang chạy roadmap deadline 29/8, nếu agent tự đoán sai một quyết định dữ liệu/kiến trúc cốt lõi (vd mô hình Search/Candidate), phần code dựng trên đó có thể phải viết lại toàn bộ, còn tốn thời gian hơn việc hỏi 1 câu.

## Khi nào dừng lại và hỏi

Dừng và hỏi người dùng (không tự chọn) khi rơi vào 1 trong 3 trường hợp:

1. **Reference docs mâu thuẫn nhau** về cùng một điều (vd: `software-architecture/data.md` vs `database/Schema explanation.md` về mô hình Candidate; model sentiment FinBERT vs PhoBERT). Danh sách mâu thuẫn đã biết nằm ở [CLAUDE.md gốc](../../../CLAUDE.md), mục "Mâu thuẫn đã biết" — luôn đọc mục đó trước khi bắt đầu module Strategy/Search/Backtest/Sentiment/Auth.
2. **`about-projects/` và `ui-prototype/` đều không nói rõ** một hành vi/ngưỡng/công thức cần để code (vd: giá trị cụ thể chưa có ví dụ minh hoạ, một trạng thái lỗi chưa được mô tả ở tầng dữ liệu).
3. **Một quyết định đánh đổi phạm vi lớn** ảnh hưởng khả năng kịp deadline (vd: có dùng TimescaleDB thật hay không, có cần Python worker ML thật hay mock, có cần auth thật hay không) — kể cả khi bạn có thể tự chọn một phương án hợp lý, đây vẫn là quyết định của người dùng vì ảnh hưởng effort budget của cả nhóm.

**Không** cần hỏi khi:
- Chi tiết triển khai kỹ thuật thuần tuý không ảnh hưởng hành vi/API/schema quan sát được (đặt tên biến, cấu trúc thư mục nội bộ, chọn thư viện chart cụ thể miễn giữ đúng UI).
- Refactor/viết lại code draft hiện có trong `service/` hoặc `web-platform/` — 2 thư mục này là draft, được phép sửa tự do (xem CLAUDE.md gốc).
- UI prototype không thể hiện 1 trạng thái phụ (loading/empty/error) — tự thiết kế hợp lý theo cùng ngôn ngữ UI.

## Quy trình

1. Trước khi viết code cho một module, đọc `CLAUDE.md` của đúng `docs/<folder>/` liên quan (vd sắp code Backtest → đọc `docs/software-architecture/CLAUDE.md` và `docs/database/CLAUDE.md`).
2. Kiểm tra mục "Mâu thuẫn đã biết" ở CLAUDE.md gốc có đề cập module này không.
3. Nếu có mâu thuẫn/thiếu thông tin thuộc 1 trong 3 trường hợp ở trên — dùng `AskUserQuestion` (nếu có) hoặc hỏi thẳng trong chat, trình bày ngắn gọn: các phương án khả dĩ + hệ quả mỗi phương án (effort, rủi ro) — không hỏi mơ hồ kiểu "bạn muốn sao cũng được".
4. Sau khi có câu trả lời, ghi lại quyết định vào `artifacts/decisions.md` (tạo nếu chưa có) kèm ngày và lý do — để không phải hỏi lại lần sau và để phục vụ vấn đáp.
5. Chỉ sau đó mới code.

## Red flags — tự kiểm tra trước khi code tiếp

- "Chắc là ý này" / "chọn cái nào cũng được, chọn đại 1 cái" → dừng lại, đây chính là lúc phải hỏi.
- Đang code phần Search/Backtest/Leaderboard mà chưa xác nhận mô hình dữ liệu Candidate với người dùng → dừng lại.
- Đang code Sentiment mà chưa hỏi dùng model gì (rule-based tạm/FinBERT thật/khác) → dừng lại.
- Cảm thấy hỏi sẽ "làm chậm tiến độ" → hỏi 1 câu tốn 1 phút; sửa lại kiến trúc sai sau khi đã code xong tốn hàng giờ. Deadline gấp là lý do để hỏi sớm, không phải lý do để bỏ qua bước hỏi.
