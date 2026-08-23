# docs/ui-prototype/ — BINDING (bám sát)

UI đã được nhóm duyệt. Đây là nguồn sự thật cho **layout, luồng màn hình, và thành phần hiển thị** khi port sang `web-platform/` (React + TypeScript).

## Nội dung folder

- `Design giao diện web đồ án/Crypto Strategy Lab.html` — bản HTML tĩnh đã render, xem trực tiếp bằng trình duyệt để thấy giao diện cuối.
- `Design giao diện web đồ án/Crypto Strategy Lab.dc.html` — file nguồn canvas (Claude Design), chứa toàn bộ artboard/markup gốc.
- `uploads/` — ảnh mockup/tham chiếu được dùng khi thiết kế (không phải asset để nhúng vào app).
- `_ds/` — tooling nội bộ của Claude Design (style bundle, manifest, lint config) — **không phải code của app**, không port thứ này vào `web-platform/`.

## Quy tắc port sang React

1. Mở `Crypto Strategy Lab.html` (hoặc `.dc.html`) để lấy đúng: cấu trúc layout tổng thể (rail/panel/chart workspace), spacing, màu sắc, typography, tên gọi từng khu vực UI, và trạng thái tương tác (hover/active/panel mở-đóng) nếu có thể suy ra từ markup/CSS.
2. Port đúng **cấu trúc và luồng** (bao nhiêu panel, panel nào mở từ đâu, thứ tự các bước trong demo flow) — không tự vẽ lại layout khác dù "đẹp hơn".
3. Có thể tự do quyết định **chi tiết triển khai kỹ thuật React** (component boundary, state management, thư viện chart cụ thể) miễn giữ đúng UI/UX quan sát được.
4. Nếu UI prototype không thể hiện rõ một trạng thái (vd: loading state, error state, empty state) — đây là chỗ được phép tự thiết kế hợp lý theo cùng ngôn ngữ thiết kế, không cần hỏi lại (khác với mâu thuẫn ở tầng kiến trúc/dữ liệu, vốn bắt buộc phải hỏi).
5. Đối chiếu UI với `docs/about-projects/05-required-flows.md` mục 20 (Required end-to-end demo flow) để đảm bảo UI hỗ trợ đủ luồng demo bắt buộc.

## Lưu ý

`docs/prototype/` (thư mục khác, ở ngoài `docs/ui-prototype/`) là **bản HTML prototype cũ hơn, đã lỗi thời** — không dùng làm tham chiếu, chỉ `docs/ui-prototype/` là bản chuẩn hiện tại.
