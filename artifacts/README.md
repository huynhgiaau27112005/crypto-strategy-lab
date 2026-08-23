# artifacts/ — Tài liệu thực tế đã build

Khác với `docs/` (đầu vào: đề bài, tham khảo kiến trúc/DB do nhóm phác thảo, UI đã duyệt), thư mục này chứa tài liệu **mô tả chính xác những gì Claude thực sự đã xây dựng**, viết bằng **tiếng Việt**, cập nhật liên tục trong lúc code (không phải viết 1 lần rồi bỏ quên).

Mục đích: nhóm dùng tài liệu này để hiểu hệ thống và chuẩn bị vấn đáp — nên ưu tiên rõ ràng, đúng thực tế, hơn là đầy đủ thuật ngữ.

## Cấu trúc dự kiến

| File/Folder | Nội dung |
|---|---|
| `architecture.md` | Kiến trúc thực tế đã build: style, module boundary, tech stack đã dùng (có thể khác `docs/software-architecture/` nếu trong lúc code phải điều chỉnh), lý do các quyết định khác với bản tham khảo. |
| `database.md` | Schema DB thực tế (bảng, cột, quan hệ, constraint) đã migrate, kèm giải thích khác biệt so với `docs/database/` nếu có. |
| `api-contract.md` | Danh sách endpoint REST + WebSocket event thực tế: method, path, request/response shape, mã lỗi. Đây là nguồn sự thật cho FE/BE khi cả hai cùng phát triển song song. |
| `module-spec/` | Nếu 1 module cần giải thích dài, tách file riêng ở đây (vd `module-spec/strategy-engine.md`, `module-spec/backtesting.md`) thay vì nhồi hết vào 1 file. |
| `decisions.md` | Nhật ký các quyết định phải hỏi người dùng trong lúc code (theo skill `resolve-before-coding`) và câu trả lời nhận được — để buổi present khỏi phải nhớ lại tại sao chọn phương án này. |

Các file khác có thể thêm nếu cần thiết (vd `acceptance-criteria.md` cho tiêu chí review từng module) — không giới hạn cứng vào danh sách trên.

## Quy tắc cập nhật

- Cập nhật file liên quan **ngay khi** một quyết định thiết kế thay đổi trong lúc code — đừng để cuối mới viết lại từ trí nhớ.
- Khi một quyết định lệch khỏi `docs/software-architecture/`, `docs/database/`, hoặc `docs/modules-specification/`, ghi rõ lệch ở đâu và tại sao trong `decisions.md` hoặc ngay trong file liên quan.
- File trong `artifacts/` mô tả **hiện trạng đã build**, không phải kế hoạch — nếu code còn là stub/TODO, ghi rõ trạng thái đó thay vì mô tả như đã hoàn thiện.
