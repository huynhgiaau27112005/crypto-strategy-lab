# docs/about-projects/ — BINDING (bám chính xác)

Đây là bản dịch/diễn giải lại **đề bài gốc của giảng viên** cho đồ án Kiến trúc phần mềm. Đây là nguồn sự thật cao nhất cho **phạm vi chức năng** (functional scope) của hệ thống.

## Quy tắc

- **Không tự ý mở rộng hoặc thu hẹp phạm vi.** Nếu một tính năng không có trong 5 file này và không phải hệ quả bắt buộc của một tính năng có trong đó, đừng tự thêm vào MVP.
- **Không tự ý bỏ một yêu cầu MVP** dù nó khó/tốn thời gian (vd: 4 chart đồng thời, Top-K leaderboard, Random Search tối thiểu, pipeline News Collect→Store→Analyze).
- Phần "Optional extensions" (Genetic/Bayesian/LLM search, multi-exchange, price prediction, Redis/Kafka/CQRS/Event Sourcing...) là **không bắt buộc** — chỉ làm nếu còn thời gian, và không được đánh đổi lấy việc bỏ sót MVP.
- Anti-pattern trong `03-anti-patterns-to-avoid.md` là **cấm tuyệt đối**, áp dụng cho mọi module, mọi giai đoạn — kể cả khi code nhanh dưới áp lực deadline.

## Cách đọc 5 file

| File | Dùng khi nào |
|---|---|
| `01-what-is-this-project.md` | Xác nhận phạm vi MVP trước khi quyết định feature nào làm/bỏ. |
| `02-architecture-goals.md` | Tra cứu NFR bắt buộc (modifiability, real-time, reliability, observability, reproducibility...) khi thiết kế module mới. |
| `03-anti-patterns-to-avoid.md` | Checklist tự review trước khi merge/hoàn thành 1 module — không được vi phạm bất kỳ mục nào. |
| `04-examples-in-the-brief.md` | Ví dụ số liệu cụ thể (công thức Overall Score, ngưỡng stop condition, ví dụ Weighted Combination...) — dùng làm test case / seed data mẫu. |
| `05-required-flows.md` | Danh sách 20 luồng bắt buộc + 4 luồng phải có trong Architecture Document nộp (Data Flow, Realtime Flow, Strategy Flow, Search/Backtest Flow). Dùng để kiểm tra đã cover đủ luồng chưa trước khi coi 1 giai đoạn là "xong". |

## Khi nào phải hỏi lại người dùng thay vì tự suy diễn

- Đề bài mô tả một hành vi bằng ví dụ minh hoạ nhưng không cho công thức/ngưỡng chính xác, và không file tham khảo nào (`software-architecture/`, `database/`, `modules-specification/`) thống nhất bổ sung giá trị đó.
- Một tính năng optional extension có vẻ hữu ích nhưng tốn thời gian — hỏi trước khi đầu tư công sức thay vì tự quyết.
