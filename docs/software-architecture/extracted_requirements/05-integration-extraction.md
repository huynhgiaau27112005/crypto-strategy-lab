Dưới đây là danh sách chi tiết các hệ thống bên ngoài (**External Systems**) và các điểm tích hợp (**Integrations**) của nền tảng **Crypto Strategy Lab**, được bóc tách và đối chiếu chặt chẽ từ toàn bộ tài liệu lý thuyết, sơ đồ khối và mockup giao diện có trong notebook.

Tài liệu này không tự ý suy diễn các giao thức kết nối hoặc công nghệ hạ tầng trừ khi được chỉ rõ trong nguồn tài liệu gốc để đảm bảo tính xác thực cao nhất.

---

# CHI TIẾT CÁC ĐIỂM TÍCH HỢP & HỆ THỐNG BÊN NGOÀI (INTEGRATIONS & EXTERNAL SYSTEMS)

---

## 1. Tích hợp Dữ liệu Thị trường Binance (Binance Market Data Integration)
*   **Source System (Hệ thống gửi):** Sàn giao dịch Binance [1-3]
*   **Target System (Hệ thống nhận):** Binance Adapter \\(\rightarrow\\) Market Data Service \\(\rightarrow\\) Backend \\(\rightarrow\\) Frontend [4, 5]
*   **Purpose (Mục đích):** Thu thập dữ liệu nến lịch sử (Historical Data) để chạy backtesting, tính chỉ báo, huấn luyện ML và truyền phát dữ liệu nến thời gian thực (Realtime Data) của các cặp giao dịch để hiển thị lên biểu đồ nến đa khung thời gian [1, 4].
*   **Data Exchanged (Dữ liệu trao đổi):**
    *   Dữ liệu nến lịch sử và thời gian thực (Candlestick data): Open, High, Low, Close, Volume, Timestamp của các cặp coin (ví dụ: BTC/USDT) theo khung thời gian (1m, 5m, 15m, 1h, 4h, 1d) [1, 4].
    *   Luồng giá khớp lệnh tức thời (Recent Ticks) [UI_5].
*   **Direction (Chiều truyền):** Một chiều, từ Binance \\(\rightarrow\\) Nền tảng Crypto Strategy Lab (Inbound) [4, 5].
*   **Trigger (Tác nhân kích hoạt):**
    *   Khi hệ thống khởi động hoặc người dùng tải lại biểu đồ, Backend gọi API Binance để lấy dữ liệu nến lịch sử [4].
    *   Khi luồng WebSocket realtime được bật, Binance tự động đẩy các tick giá mới liên tục [8, UI_5].
*   **Frequency (Tần suất):** Realtime (liên tục từng giây/mili-giây 24/7) đối với luồng dữ liệu thời gian thực; On-demand/Batch đối với dữ liệu lịch sử [8, UI_5].
*   **Realtime / batch (Tính chất xử lý):** Cả Realtime (luồng live nến) và Batch (truy vấn nến lịch sử) [4].
*   **Protocol (Giao thức):** WebSocket (cho luồng realtime) và API (cho dữ liệu nến lịch sử, ví dụ request mẫu `GET /price` hiển thị trên tài liệu bài giảng) [8, UI_5].
*   **API (Tên API nếu có):** Binance API, WebSocket API [8, UI_5].
*   **Error behavior (Xử lý lỗi):** Khi xảy ra lỗi mất kết nối ("Connection lost" từ Binance), hệ thống Adapter của Backend phải kích hoạt cơ chế tự động kết nối lại (**Reconnect**) và thử lại (**Retry**) một cách mượt mà để đảm bảo độ tin cậy, không làm gián đoạn hiển thị hay mất dữ liệu nến ("không mất candles") [6, 7].
*   **Dependency (Mức độ phụ thuộc):** Phụ thuộc cốt lõi. Để giảm thiểu rủi ro phụ thuộc chặt, hệ thống sử dụng thiết kế **Adapter Pattern** thông qua lớp `BinanceAdapter` nằm giữa Market Data Service và API Binance, giúp đảm bảo Frontend không bao giờ giao tiếp trực tiếp với API của sàn và dễ dàng thay thế nhà cung cấp [4, 5].
*   **Source & Location:** `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 4, Mục 4 & Trang 7, Mục 32.3, 32.4], `project_full_description.pdf` [Trang 1, Module 1 & Trang 2, Reliability, Adapter Pattern], `UI_5.jpg` [Card Trạng thái kết nối, vùng hiển thị "Nguồn dữ liệu: Binance API + WebSocket"].

---

## 2. Các Adapter Kết nối Sàn Giao dịch Mở rộng (OKX, Bybit, Coinbase Adapters)
*   **Source System (Hệ thống gửi):** OKX, Bybit, Coinbase Exchanges [4]
*   **Target System (Hệ thống nhận):** OKXAdapter, BybitAdapter, CoinbaseAdapter \\(\rightarrow\\) Market Data Service [4, 5]
*   **Purpose (Mục đích):** Các cổng adapter dự phòng/mở rộng được thiết kế sẵn giao diện (interface) chung để sẵn sàng tích hợp thêm nguồn cấp dữ liệu giá từ các sàn OKX, Bybit, Coinbase mà không cần phải can thiệp hay sửa đổi mã nguồn Frontend hiện tại [4, 5].
*   **Data Exchanged (Dữ liệu trao đổi):** Dữ liệu nến giá kỹ thuật (OHLCV) và các sự kiện biến động giá thị trường [1, 4].
*   **Direction (Chiều truyền):** Một chiều, từ sàn giao dịch thứ ba \\(\rightarrow\\) Hệ thống (Inbound) [4].
*   **Realtime / batch (Tính chất xử lý):** Cả Realtime và Batch [4].
*   **Protocol (Giao thức):** Adapter Pattern interface [4, 5].
*   **Source & Location:** `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 4, Mục 4, danh sách "OKXAdapter, BybitAdapter, CoinbaseAdapter"], `project_full_description.pdf` [Trang 2, Adapter Pattern].

---

## 3. Thu thập Tin tức Thị trường (News Sources / Channels Integration)
*   **Source System (Hệ thống gửi):** Các nguồn báo chí, tin tức điện tử lớn trên thị trường crypto (như CoinDesk, The Block, Decrypt, Cointelegraph, Bankless, The Defiant) thông qua Website, RSS feed, hoặc News API công khai [21, UI_3].
*   **Target System (Hệ thống nhận):** News Collector / News Crawler Service [21, UI_3].
*   **Purpose (Mục đích):** Tự động đi thu thập các bài viết, tin tức thị trường cryptocurrency liên quan đến các đồng coin đang được lọc (như BTC, ETH, SOL) để phục vụ cho pipeline phân tích tâm lý [6, 21, UI_3].
*   **Data Exchanged (Dữ liệu trao đổi):** Mã nguồn HTML thô của trang tin tức, luồng RSS XML, hoặc tin văn bản, sau đó được Parser chuẩn hóa thành đối tượng `NewsItem` chứa 8 trường thông tin định dạng thống nhất (`id`, `title`, `content`, `source`, `publishedAt`, `crawledAt`, `relatedCoins`, `url`) [21, UI_3].
*   **Direction (Chiều truyền):** Một chiều, từ các trang tin tức \\(\rightarrow\\) News Collector (Inbound) [21, UI_3].
*   **Trigger (Tác nhân kích hoạt):** Người dùng nhấp chọn các nguồn (Website, RSS, HTML) và click nút "Bắt đầu crawl", hoặc hệ thống tự kích hoạt định kỳ dựa theo chu kỳ thiết lập "Auto refresh" [UI_3].
*   **Frequency (Tần suất):** Định kỳ theo mốc thời gian người dùng cấu hình: `1 phút`, `2 phút`, `3 phút`, `4 phút`, hoặc `5 phút` [UI_3].
*   **Realtime / batch (Tính chất xử lý):** Batch-interval (chạy lặp ngầm định kỳ) [UI_3].
*   **Protocol (Giao thức):** RSS, HTML, API [21, 43, UI_3].
*   **Error behavior (Xử lý lỗi):** Được thiết kế tách rời hoàn toàn (decoupled). Nếu News Service hoặc Crawler bị lỗi gián đoạn mạng, luồng hiển thị Biểu đồ giá của hệ thống vẫn hoạt động bình thường, không gây sập ứng dụng [8].
*   **Dependency (Mức độ phụ thuộc):** Tích hợp thông qua lớp trừu tượng `News Provider` chung nhằm tránh việc gắn cứng (hard-code) crawler với một nguồn tin cụ thể, hỗ trợ thay nguồn dễ dàng mà không ảnh hưởng tới logic nghiệp vụ phân tích sentiment phía sau [9].
*   **Source & Location:** `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 1, Mục 2 & Trang 5, Mục 27, 28], `project_full_description.pdf` [Trang 1, Module 10 & Trang 2, Tight Coupling], `UI_3.jpg` [Phân vùng cấu hình Nguồn, bảng Tin tức đầu vào].

---

## 4. Phân tích Cú pháp Chiến lược Ngôn ngữ Tự nhiên (External LLM API for Strategy Parsing)
*   **Source System (Hệ thống gửi):** Giao diện Strategy Engine (Frontend/Backend) [UI_4].
*   **Target System (Hệ thống nhận):** Dịch vụ mô hình ngôn ngữ lớn (LLM Service / External LLM API) [3, UI_4].
*   **Purpose (Mục đích):** Sử dụng trí tuệ nhân tạo để đọc hiểu văn bản prompt mô tả chiến lược giao dịch bằng tiếng Việt của người dùng, phân tích ngữ nghĩa để bóc tách điều kiện kỹ thuật và trả về cấu trúc định nghĩa kịch bản [3, UI_4].
*   **Data Exchanged (Dữ liệu trao đổi):**
    *   *Gửi đi (Request):* Chuỗi văn bản prompt ngôn ngữ tự nhiên tối đa 1000 ký tự (ví dụ: "Khi RSI dưới 30...") [UI_4].
    *   *Nhận về (Response):* Cấu trúc JSON định nghĩa chiến lược giao dịch chuẩn hóa gồm các trường indicator chi tiết, logic conditions (long, short) và tham số riskManagement [UI_4].
*   **Direction (Chiều truyền):** Hai chiều (Bidirectional request-response) [UI_4].
*   **Trigger (Tác nhân kích hoạt):** Người dùng nhấn nút "Phân tích bằng LLM" [UI_4].
*   **Frequency (Tần suất):** Theo yêu cầu (On-demand) của người dùng mỗi khi tạo mới chiến lược.
*   **Realtime / batch (Tính chất xử lý):** Realtime (Xử lý đồng bộ ngay lập tức).
*   **Protocol (Giao thức):** API [UI_4].
*   **Source & Location:** `779956509_2019220255455531_248486056450237423_n.jpg` [Trang 1, dòng 21-22], `UI_4.jpg` [Phân vùng Nhập mô tả strategy, button Phân tích bằng LLM, Card Định nghĩa strategy (JSON)].

---

## 5. Trích xuất Chiến lược từ URL Website liên kết (Website Strategy Script Extractor)
*   **Source System (Hệ thống gửi):** Các nền tảng chia sẻ mã nguồn kịch bản trực tuyến (TradingView, Blogger, Medium, GitHub Gist, Google Docs) [UI_4].
*   **Target System (Hệ thống nhận):** Strategy Engine Extractor [UI_4].
*   **Purpose (Mục đích):** Tự động tải nội dung trang web từ liên kết được cung cấp, quét bóc tách mã nguồn script chiến lược bên trong trang và chuyển dịch logic sang cấu trúc JSON [UI_4].
*   **Data Exchanged (Dữ liệu trao đổi):**
    *   *Gửi đi:* Đường dẫn liên kết URL hợp lệ (ví dụ link script của TradingView) [UI_4].
    *   *Nhận về:* Bản dịch JSON chiến lược hoàn chỉnh [UI_4].
*   **Direction (Chiều truyền):** Một chiều, tải dữ liệu từ trang web đích về hệ thống (Inbound) [UI_4].
*   **Trigger (Tác nhân kích hoạt):** Người dùng nhập link và bấm chọn "Trích xuất từ website" [UI_4].
*   **Frequency (Tần suất):** Theo yêu cầu (On-demand) [UI_4].
*   **Realtime / batch (Tính chất xử lý):** Batch / On-demand.
*   **Source & Location:** `UI_4.jpg` [Phân vùng Nhập URL chiến lược và nút Trích xuất từ website].

---

## 6. Trích xuất HTML Tin tức & Tự sửa lỗi Template bằng AI (LLM News Extractor & Self-Healing Scraper)
*   **Source System (Hệ thống gửi):** News Collector / Crawler Backend [UI_3].
*   **Target System (Hệ thống nhận):** LLM Service / External LLM API [UI_3].
*   **Purpose (Mục đích):** Sử dụng AI để bóc tách cấu trúc HTML thô của trang tin tức đích thành các trường thông tin chuẩn, đồng thời giám sát tỷ lệ lỗi trích xuất để tự động sửa chữa mẫu cấu trúc (Self-healing template) khi trang nguồn thay đổi giao diện [UI_3].
*   **Data Exchanged (Dữ liệu trao đổi):**
    *   *Request bóc tin:* Mã nguồn HTML thô của bài báo \\(\rightarrow\\) LLM \\(\rightarrow\\) Trả về giá trị của các trường thông tin (title, summary, source, time, asset) kèm độ tin cậy (ví dụ đạt `0.92`) [UI_3].
    *   *Request tự sửa lỗi:* Nội dung HTML bị lỗi bóc tách + danh sách trường lỗi \\(\rightarrow\\) LLM \\(\rightarrow\\) Trả về bản mô tả Template bóc tách mới (JSON) phiên bản nháp (draft, ví dụ `v1.4.3 draft`) có điểm tin cậy cao hơn [UI_3].
*   **Direction (Chiều truyền):** Hai chiều (Bidirectional) [UI_3].
*   **Trigger (Tác nhân kích hoạt):**
    *   Kích hoạt bóc tin: Chạy khi có luồng crawl tin mới [UI_3].
    *   Kích hoạt tự sửa lỗi: Tự động kích hoạt chạy ngầm khi tổng tỷ lệ lỗi bóc tách của template hiện hành (tính bằng: % trường trống + % trường sai định dạng) vượt quá ngưỡng **10%** [UI_3].
*   **Frequency (Tần suất):** Chạy liên tục song hành cùng pipeline thu thập tin; tự động tiến hóa sửa đổi template khi cấu trúc trang tin nguồn thay đổi.
*   **Realtime / batch (Tính chất xử lý):** Realtime.
*   **API (Tên API nếu có):** LLM API [UI_3].
*   **Source & Location:** `UI_3.jpg` [Card LLM-assisted Extraction, Card Self-healing extraction hiển thị sơ đồ logic rẽ nhánh tự sửa mẫu khi tổng lỗi đạt 11.9%].

---

## 7. Mô hình Phân tích Sắc thái Tâm lý (Sentiment Analysis BERT Model)
*   **Source System (Hệ thống gửi):** News Service (Tin tức đã được bóc tách và chuẩn hóa) [9, 10].
*   **Target System (Hệ thống nhận):** Sentiment Service / Machine Learning BERT Model [9-11].
*   **Purpose (Mục đích):** Đưa nội dung tin tức qua mô hình Machine Learning phân tích ngữ nghĩa để gắn nhãn phân loại sắc thái cảm xúc tâm lý và tính điểm tin cậy, làm cơ sở định lượng tâm lý đám đông phục vụ chiến lược giao dịch `NewsSentimentStrategy` [21, 22, UI_3].
*   **Data Exchanged (Dữ liệu trao đổi):** Nội dung văn bản chi tiết của tin tức `NewsItem` \\(\rightarrow\\) BERT Model \\(\rightarrow\\) Gán nhãn cảm xúc (`POSITIVE`, `NEGATIVE`, hoặc `NEUTRAL`) kèm điểm số tin cậy (Confidence Score, ví dụ: `0.82`) [21, 22, UI_3].
*   **Direction (Chiều truyền):** News Service \\(\rightarrow\\) BERT Model \\(\rightarrow\\) Lưu kết quả vào Sentiment Database [9, 10].
*   **Trigger (Tác nhân kích hoạt):** Tự động kích hoạt khi có sự kiện `NewsCollected` (tin mới thu thập được lưu vào DB) [5, 12].
*   **Frequency (Tần suất):** Hoạt động liên tục mỗi khi phát hiện tin mới thu thập.
*   **Realtime / batch (Tính chất xử lý):** Realtime [UI_3].
*   **Protocol (Giao thức):** API / Stream [UI_3].
*   **Error behavior (Xử lý lỗi / Anti-pattern):** Nhóm thiết kế tránh hoàn toàn lỗi kết nối cứng (Tight Coupling) trực tiếp từ crawler đến BERT model. Trình crawler chỉ làm nhiệm vụ thu thập tin, còn Sentiment Service chạy độc lập nhận tin để phân tích sắc thái cảm xúc [11, 13].
*   **Dependency (Mức độ phụ thuộc):** Tách biệt nghiệp vụ hoàn toàn, đảm bảo nếu Sentiment Model thay đổi thì Strategy Engine không bị ảnh hưởng logic, và ngược lại [14].
*   **Source & Location:** `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 1, Mục 2 & Trang 5-6, Mục 29, 30 & Trang 7, Mục 34], `project_full_description.pdf` [Trang 1, Module 11 & Trang 2, Tight Coupling], `UI_3.jpg` [Phân vùng Đầu ra phân tích và Tích hợp với Strategy].

---

## 8. Hàng đợi Phân phối Công việc Backtest (Kafka / RabbitMQ Message Queue)
*   **Source System (Hệ thống gửi):** Strategy Generator / Strategy Search Engine (Bộ điều phối tiến trình tự động tối ưu hóa) [13, 15, 16].
*   **Target System (Hệ thống nhận):** Backtest Workers Pool (Nhóm các máy chủ chạy giả lập backtest song song) [13, 15, 16].
*   **Purpose (Mục đích):** Đóng vai trò là hạ tầng trung gian xếp hàng và phân phối đồng đều hàng ngàn kịch bản chiến lược cần kiểm thử xuống cho các worker xử lý song song, giải quyết bài toán hiệu năng (Scalability) khi quy mô tăng từ 10 lên 100.000 candidates [13, 16, 17].
*   **Data Exchanged (Dữ liệu trao đổi):** Thông tin cấu hình và tệp JSON định nghĩa chiến lược ứng viên (Candidate Strategy) cần chạy kiểm thử giả lập [15, 16].
*   **Direction (Chiều truyền):** Generator \\(\rightarrow\\) Job Queue \\(\rightarrow\\) Workers (Outbound phân phối) [15, 16].
*   **Trigger (Tác nhân kích hoạt):** Kích hoạt chạy khi người dùng bấm chọn "START SEARCH" trong giao diện tối ưu hóa chiến lược [UI_1].
*   **Frequency (Tần suất):** Tần suất cực cao khi Discovery loop hoạt động.
*   **Realtime / batch (Tính chất xử lý):** Xử lý hàng đợi bất đồng bộ (Asynchronous Batch Jobs).
*   **Protocol (Giao thức):** Kafka / RabbitMQ [13].
*   **Error behavior (Xử lý lỗi):** Hỗ trợ cơ chế tự động thực hiện thử lại (Retry) khi worker gặp sự cố chết giữa chừng, đảm bảo không sập loop và cho phép người dùng Pause (tạm dừng) hoặc Resume (tiếp tục) vòng lặp tùy ý [13, 18].
*   **Dependency (Mức độ phụ thuộc):** Decouple hoàn toàn thuật toán tìm kiếm chiến lược khỏi trình thực thi kiểm thử Backtester [7, 16].
*   **Source & Location:** `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 5, Mục 24 & Trang 7, Mục 31, 33], `project_full_description.pdf` [Trang 1, Module 9 & Trang 2, Scalability, Performance].

---

## 9. Cơ sở Dữ liệu Lưu trữ Hệ thống (MySQL Persistent Database)
*   **Source System (Hệ thống gửi):** Các Services cốt lõi của Backend (Market Data, Strategy, Experiment, Trades, News, Leaderboard) [19].
*   **Target System (Hệ thống nhận):** Hệ quản trị cơ sở dữ liệu MySQL [11, 19].
*   **Purpose (Mục đích):** Lưu trữ bền vững toàn bộ dữ liệu lịch sử nến, các định nghĩa chiến lược theo phiên bản, nhật ký giao dịch backtest, dữ liệu tin tức và kết quả bảng xếp hạng [19].
*   **Data Exchanged (Dữ liệu trao đổi):** Các bản ghi dữ liệu có cấu trúc của hệ thống [19].
*   **Protocol (Giao thức):** MySQL [13].
*   **Error behavior (Anti-pattern cần tránh):** Tuyệt đối không thiết kế cho lớp tính toán chiến lược (RSIStrategy) truy cập, đọc viết trực tiếp vào MySQL database. Strategy phải nhận dữ liệu cần thiết thông qua một lớp trừu tượng (abstraction) thích hợp do Backend cung cấp [11, 13, 20].
*   **Source & Location:** `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 6, Mục 35], `project_full_description.pdf` [Trang 2, Direct DB Access].

---

## 10. Bộ đệm Lưu trữ Tốc độ cao (Redis Cache)
*   **Source/Target System:** Redis Cache [13, 16].
*   **Purpose (Mục đích):** Lưu đệm dữ liệu nóng cho hệ thống, phục vụ truy vấn tốc độ cao (ví dụ: phục vụ hiển thị bảng xếp hạng Leaderboard với tần suất đọc cực lớn) [13].
*   **Protocol (Giao thức):** Redis [13].
*   **Source & Location:** `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 7, Mục 31 / danh sách công nghệ đề xuất ở trang 7].

---

## 11. Hệ thống Truyền tin Bất đồng bộ (Event-Driven Broker / Event Bus)
*   **Source System (Hệ thống gửi):** Các Module thành phần phát sinh trạng thái mới (ví dụ: Backtest Worker, News Collector, Sentiment Service) [5, 12].
*   **Target System (Hệ thống nhận):** Các Module đăng ký lắng nghe sự kiện tương ứng (ví dụ: Ranking Service, Leaderboard Service, UI) [5, 12].
*   **Purpose (Mục đích):** Thiết lập mô hình truyền tin bất đồng bộ theo kiến trúc hướng sự kiện (Event-Driven Architecture) nhằm loose coupling (giảm liên kết cứng) tối đa giữa các module trong hệ thống [5, 12, 19].
*   **Data Exchanged (Dữ liệu trao đổi):** Các gói tin Event chứa thông tin chi tiết của sự kiện phát sinh:
    *   `MarketPriceUpdated`: Khi giá biến động [19].
    *   `CandleClosed`: Khi cây nến chính thức đóng [19].
    *   `StrategyGenerated`: Khi có một chiến lược ứng viên được sinh ra [19].
    *   `BacktestStarted` / `BacktestCompleted`: Tiến độ backtest [19].
    *   `StrategyEvaluatedEvent`: Trình Worker backtest xong phát ra, chứa metrics hiệu năng để Ranking Service tự nhận và chấm điểm xếp hạng mà không cần Worker gọi trực tiếp code Leaderboard [12, 19].
    *   `LeaderboardUpdated` / `LEADERBOARD_UPDATED`: Sự kiện đẩy xuống Frontend cập nhật bảng xếp hạng thời gian thực không cần reload trang [5, 12, 19].
    *   `NewsCollected`: Khi tin thô được chuẩn hóa [19].
    *   `SentimentAnalyzed`: Khi tin tức đã được gán nhãn xong sắc thái cảm xúc [19].
*   **Direction (Chiều truyền):** Đa chiều (Publish / Subscribe pattern) [5, 12].
*   **Trigger (Tác nhân kích hoạt):** Khi một module hoàn thành công đoạn xử lý hoặc ghi nhận thay đổi trạng thái thực thể [12].
*   **Protocol (Giao thức):** Event-driven [5, 12].
*   **Source & Location:** `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 5, Mục 25 & Trang 7, Mục 34], `project_full_description.pdf` [Trang 2, Event-driven].

---

# BẢNG TỔNG HỢP CÁC ĐIỂM TÍCH HỢP HỆ THỐNG (EXTERNAL SYSTEMS & INTEGRATIONS INVENTORY)

| ID | Integration Name | From (Nguồn) | To (Đích) | Purpose (Mục đích) | Data Exchanged (Dữ liệu truyền) | Protocol / Method (Giao thức) | Source (Tên file nguồn) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **INT-01** | Realtime & Historical Market Data | Binance | Market Data Service / Backend | Cung cấp luồng giá realtime và dữ liệu nến lịch sử cho hệ thống | Candlestick price data (OHLCV) & Recent ticks | WebSocket & API (GET /price) | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_5.jpg |
| **INT-02** | Modular Exchange Adapters | OKX, Bybit, Coinbase | Market Data Service | Thiết lập Adapter mở rộng dễ dàng thêm sàn giao dịch mới | Candlestick / market price data | Adapter interface | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf |
| **INT-03** | News Crawling Pipeline | News Websites, RSS, News API | News Collector / News Service | Tự động đi crawl tin tức thị trường cryptocurrency từ nhiều nguồn | HTML thô, XML RSS feeds \\(\rightarrow\\) chuẩn hóa thành `NewsItem` | RSS, HTML, API | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_3.jpg |
| **INT-04** | Natural Language Prompt Parsing | System Backend / Frontend | External LLM API | AI đọc hiểu văn bản prompt mô tả kịch bản để tự sinh JSON chiến lược | Văn bản mô tả (Prompt) $\rightarrow$ Cấu trúc JSON Strategy | LLM Service API | 779956509..._n.jpg; UI_4.jpg |
| **INT-05** | Website Strategy Script Extraction | External sites (TradingView, Blogger, Gist...) | Strategy Engine / Extractor | Bóc tách logic kịch bản giao dịch trực tiếp từ liên kết dán vào | Link URL $\rightarrow$ Scraped script $\rightarrow$ parsed JSON Strategy | HTTP request / HTML scraper | UI_4.jpg |
| **INT-06** | AI News Scraper & Self-Healing | News Crawler / News Collector | External LLM API | AI bóc tách HTML thô; tự động sinh template mới khi tỷ lệ lỗi bóc tách $\ge 10\%$ | Raw HTML $\rightarrow$ fields; error details $\rightarrow$ draft template JSON | LLM API | UI_3.jpg |
| **INT-07** | ML Sentiment Analysis Model | News Crawler / News Service | Sentiment Service / BERT Model | Chạy mô hình ML phân sắc thái cảm xúc tin tức crypto | Văn bản tin tức $\rightarrow$ Nhãn cảm xúc + Confidence score | BERT / ML Service API | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_3.jpg |
| **INT-08** | Backtest Job Queue | Strategy Search Engine | Backtest Workers Pool | Phân phối các kịch bản chiến lược ứng viên chạy thử nghiệm song song | Bản ghi kịch bản Strategy candidate & job metadata | Kafka / RabbitMQ | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf |
| **INT-09** | Relational Database Persistent | Backend Services | MySQL Database | Lưu giữ lâu bền toàn bộ bộ dữ liệu cấu trúc của hệ thống | Nến lịch sử, Strategies, Experiments, Trades, News, Sentiment | MySQL | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf |
| **INT-10** | High Performance Cache | Leaderboard / Backend | Redis Cache | Lưu đệm dữ liệu bảng xếp hạng và số liệu nóng truy cập lớn | Sắp xếp ranks, metrics tài chính chiến lược | Redis | Crypto Strategy Lab – Đồ án cuối kỳ.pdf |
| **INT-11** | Event-Driven Broker | Backend Modules | Various Subscribers / Frontend | Giảm coupling giữa các module hệ thống bằng truyền sự kiện bất đồng bộ | Events (e.g. CandleClosed, StrategyEvaluated, LeaderboardUpdated) | Event-driven | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf |

---

🔍 Tôi có thể phân tích sâu hơn về các **Kịch bản Thất bại tích hợp (Integration Failure Scenarios)** dựa theo yêu cầu kiến trúc Reliability, ví dụ: quy trình chi tiết Reconnect và Retry của hệ thống khi Binance bị disconnect đột ngột mà không bị mất nến lịch sử, hoặc cơ chế xử lý lỗi khi LLM API bị gián đoạn ngắt quãng không phản hồi để chuẩn bị kỹ càng cho buổi bảo vệ đồ án. Bạn có muốn tôi phác thảo tiếp phần này không?