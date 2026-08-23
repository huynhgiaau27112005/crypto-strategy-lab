## 1. TỔNG QUAN VỀ KIẾN TRÚC HỆ THỐNG

Trong một hệ thống theo dõi và phân tích chiến lược giao dịch Crypto theo thời gian thực (Real-time), thách thức lớn nhất là xử lý **tần suất cập nhật dữ liệu cao (High Throughput)** và **độ trễ thấp (Low Latency)**. 

### 1.1 Vấn đề của mô hình kết nối trực tiếp (Direct Connection)
Nhiều thiết kế ban đầu mắc phải sai lầm kết nối trực tiếp **Frontend $\rightarrow$ Binance WebSocket**:
* **Rủi ro lộ thông tin bí mật & Quá tải kết nối:** Nếu hệ thống có $N$ người dùng cùng mở giao diện, sẽ có $N$ kết nối WebSocket được mở đồng thời tới Binance. Điều này khiến IP server dễ bị Binance Rate-limit hoặc cấm IP.
* **Tính đồng bộ không cao:** Mọi logic tính toán chiến lược (Strategy Evaluation) buộc phải thực hiện client-side hoặc lặp lại ở server từng client, không tối ưu cho kiến trúc backend tập trung.
* **Tải đĩa (I/O) quá lớn nếu dùng SQL:** Việc ghi nhận từng tick biến động giá nến (với tần suất hàng chục ms/tick) trực tiếp vào Relational Database (MySQL, PostgreSQL) sẽ làm treo I/O của ổ cứng.

### 1.2 Giải pháp Kiến trúc chuẩn (Backend Aggregator + Redis Middleware)
Hệ thống được thiết kế theo dạng **Pub/Sub Pipeline & Caching Layer**:
1. **Binance WebSocket Service (Worker):** Chỉ duy nhất **01 Worker Backend** đứng ra duy trì kết nối tới Binance WebSocket API để nhận luồng nến liên tục.
2. **Redis In-Memory Data Store:** Đóng vai trò làm lớp trung gian kép:
   * **In-Memory Cache:** Lưu giữ trạng thái nến biến động hiện tại để cung cấp dữ liệu tức thì cho Client mới kết nối.
   * **Message Broker (Pub/Sub):** Phân phối biến động nến real-time tức thì đến các Socket Nodes (API Server).
3. **API Socket Server:** Lắng nghe từ Redis Pub/Sub và broadcast tới hàng ngàn Frontend Client thông qua Socket.io/WebSocket.
4. **Persistent Database (MongoDB/PostgreSQL):** Chỉ ghi dữ liệu khi **Nến đã chính thức đóng (Candle Closed)**.

---

## 2. SƠ ĐỒ LUỒNG DỮ LIỆU (DATA FLOW DIAGRAM)

Below is the structured ASCII sequence diagram showing the step-by-step communication between all layers of the system:

```text
┌────────────────┐     ┌────────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌────────────────┐
│ Binance WS Server│     │ Backend Worker │     │ Redis Store  │     │ Socket.io Server│     │ Frontend (App) │
└───────┬────────┘     └───────┬────────┘     └──────┬───────┘     └────────┬────────┘     └───────┬────────┘
        │                      │                     │                      │                      │
        │ 1. Stream Tick Data  │                     │                      │                      │
        │─────────────────────>│                     │                      │                      │
        │  (kline_1m packet)   │                     │                      │                      │
        │                      │ 2. Set Active Candle│                      │                      │
        │                      │    Cache (JSON)     │                      │                      │
        │                      │────────────────────>│                      │                      │
        │                      │ `candle:BTCUSDT:1m` │                      │                      │
        │                      │                     │                      │                      │
        │                      │ 3. PUBLISH Event    │                      │                      │
        │                      │    to Pub/Sub       │                      │                      │
        │                      │────────────────────>│                      │                      │
        │                      │ `channel:BTCUSDT:1m`│                      │                      │
        │                      │                     │ 4. Forward Message   │                      │
        │                      │                     │─────────────────────>│                      │
        │                      │                     │                      │ 5. Emit Event via WS │
        │                      │                     │                      │─────────────────────>│
        │                      │                     │                      │ `kline_update` event │
        │                      │                     │                      │                      │
        │                      │ 6. If k.x == true   │                      │                      │
        │                      │    (Candle Closed)  │                      │                      │
        │                      │──────────────────────────────────────────────────────────────────>│
        │                      │   [Save Final Candle to Persistent DB (PostgreSQL/MongoDB)]      │
        │                      │                     │                      │                      │