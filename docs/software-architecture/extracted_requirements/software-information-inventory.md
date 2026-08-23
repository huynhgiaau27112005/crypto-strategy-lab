# Crypto Strategy Lab - Bản Thống Kê Thông Tin Hệ Thống (Software Information Inventory)

Tài liệu này tổng hợp toàn bộ thông tin về phần mềm **Crypto Strategy Lab** được trích xuất trực tiếp từ các tài liệu và giao diện người dùng (UI) có trong nguồn, phục vụ cho việc xây dựng Software Specification và High-Level Architecture.

Tất cả thông tin được phân loại rõ ràng theo mức độ xác thực:
- **Explicit (Trực tiếp)**: Nguồn nói trực tiếp, rõ ràng.
- **Observed (Quan sát)**: Thông tin quan sát trực tiếp từ hình ảnh, mockup UI/UX.
- **Inferred (Suy luận)**: Có thể suy đoán một cách logic từ nguồn nhưng nguồn không khẳng định trực tiếp (Lưu ý: Không được coi là yêu cầu chính thức).

---

## 1. Bối Cảnh, Mục Tiêu & Kịch Bản Tăng Trưởng

### 1.1. Bối cảnh và Mục tiêu tổng thể
*   **Bối cảnh thị trường**: Thị trường cryptocurrency hoạt động liên tục 24/7. Giá tài sản thay đổi liên tục theo thời gian và thường được biểu diễn bằng biểu đồ nến (Candlestick Chart) chứa: Open, High, Low, Close, Volume [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 1].
*   **Mục tiêu hệ thống**: Xây dựng một nền tảng có khả năng nhận dữ liệu từ Binance, hiển thị biểu đồ realtime tối đa 4 khung thời gian, bổ sung và kết hợp các chiến lược (strategy) phân tích kỹ thuật, backtest trên dữ liệu lịch sử, xếp hạng trên Leaderboard, tự động tìm kiếm tổ hợp tốt hơn, thu thập tin tức và phân tích sentiment bằng Machine Learning, và trực quan hóa (visualize) tín hiệu lên biểu đồ [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2].
*   **Trọng tâm đồ án**: Là **Kiến trúc phần mềm**, khả năng mở rộng, thay đổi và vận hành độc lập giữa các thành phần, không phải là tìm ra strategy đầu tư tốt nhất để kiếm tiền [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 7, Mục 47].

### 1.2. Kịch bản tải và Tăng trưởng hệ thống
*   **Phiên bản hiện tại (Hiện tại)**:
    *   100 người dùng đồng thời [Explicit: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục 2].
    *   20 backtest / giờ [Explicit: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục 2].
    *   1 cặp giao dịch (BTCUSDT) [Explicit: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục 2].
    *   Cấu hình: 1 server + 1 database [Explicit: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục 2].
*   **Kịch bản tăng trưởng (Scale-out)**:
    *   50.000 người dùng đồng thời [Explicit: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục 2].
    *   4 chart realtime / người dùng [Explicit: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục 2].
    *   5.000 lượt đọc Leaderboard / giây [Explicit: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục 2].
    *   100.000 lượt backtest / ngày [Explicit: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục 2].
*   **Tăng trưởng dữ liệu lưu trữ**: Hiện tại database chứa 20 GB dữ liệu, tăng trung bình 2 GB/tháng. Tuy nhiên, hệ thống cần dự phòng kịch bản dữ liệu tăng lên 20 TB và 500 triệu thực nghiệm (experiment) [Explicit: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 2, Tình huống 5].
*   **Ràng buộc tài nguyên MVP**: Nhóm phát triển gồm 4 sinh viên, có thời gian 8 tuần để hoàn thành sản phẩm khả thi tối thiểu (MVP) [Explicit: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 2, Tình huống 6].

---

## 2. Bản Đồ 11 Module Chức Năng Chính

Dựa trên tài liệu hệ thống và bảng thống kê chính thức [Explicit: "project_full_description.pdf", Trang 1, Mục "11 Modules chính & Chức năng"]:

### Module 1: Realtime Market Data
*   **Chức năng**: Lấy dữ liệu giá crypto từ Binance thông qua adapter, đảm bảo frontend không bị gắn cứng (phụ thuộc trực tiếp) với cấu trúc dữ liệu của Binance API [Explicit: "project_full_description.pdf", Trang 1; "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 4].
*   **Chi tiết luồng**: Lấy cả dữ liệu lịch sử (Historical Data - phục vụ cho backtest, tính indicator, huấn luyện ML) và dữ liệu thời gian thực (Realtime Data - cập nhật liên tục cho UI) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 4].
*   **Thiết kế Adapter**: Sử dụng Adapter Pattern (ví dụ: `BinanceAdapter`) để dễ dàng tích hợp thêm các sàn giao dịch khác như OKX, Bybit, Coinbase mà không cần sửa code frontend [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 2, Mục 4; "project_full_description.pdf", Trang 2].

### Module 2: Multi-Timeframe Chart
*   **Chức năng**: Hỗ trợ hiển thị đồng thời tối đa **4 chart** trên một màn hình [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 2, Mục 5; "project_full_description.pdf", Trang 1].
*   **Đặc điểm độc lập**: Mỗi chart có thể thay đổi khung thời gian (timeframe) riêng biệt mà không cần reload toàn bộ hệ thống hoặc ảnh hưởng đến các chart khác (ví dụ: chỉ Chart 1 đổi từ 5m sang 1h khi người dùng đổi cấu hình) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 2, Mục 5].
*   **Khả năng hiển thị (Visualize)**: Biểu đồ nến (Candlestick), Khối lượng (Volume), Đường trung bình (MA), dải Bollinger Bands, vùng hỗ trợ (Support)/kháng cự (Resistance), Tín hiệu mua (Buy Signal)/Bán (Sell Signal), Điểm vào lệnh (Entry), Cắt lỗ (Stop Loss), Chốt lời (Take Profit) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 2, Mục 5].

### Module 3: Strategy Engine
*   **Chức năng**: Là trung tâm xử lý, nhận dữ liệu thị trường (dưới dạng context chứa giá, khối lượng, nến, khung thời gian, chỉ báo, trạng thái thị trường, tin tức...) và trả về tín hiệu giao dịch được chuẩn hóa [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 2, Mục 6].
*   **Đầu ra tín hiệu chuẩn hóa**: BUY, SELL hoặc HOLD [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 2, Mục 6; "project_full_description.pdf", Trang 1].

### Module 4: Strategy Plugin
*   **Chức năng**: Cho phép nhà phát triển bổ sung dễ dàng một strategy mới (ví dụ: MACD) vào Strategy Engine thông qua cơ chế đăng ký (như `register(SupportResistance)` hoặc `StrategyRegistry.register(MACDStrategy)`) thay vì phải sửa cấu trúc code lõi hay cấu trúc rẽ nhánh rườm rà (`if/else`) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 3, Mục 12; Trang 5, Mục 41; "project_full_description.pdf", Trang 1 & Trang 2].
*   **Pattern khuyến nghị**: Strategy, Plugin Architecture, Factory, Registry, Dependency Injection [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 3, Mục 12].

### Module 5: Composite Strategy
*   **Chức năng**: Kết hợp nhiều strategy đơn lẻ thành một chiến lược phức hợp tổng hợp [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang Trang 3, Mục 13; "project_full_description.pdf", Trang 1].
*   **Phương pháp giải quyết mâu thuẫn tín hiệu**: Sử dụng Majority Vote (Biểu quyết đa số) hoặc Weighted Score (Điểm số có trọng số) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 3, Mục 13; Trang 4, Mục 14; "project_full_description.pdf", Trang 1].

### Module 6: Strategy Search Engine
*   **Chức năng**: Tự động tạo và kiểm tra các tổ hợp strategy để tìm ra biến thể tối ưu (tối ưu hóa tham số chỉ báo) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 15; "project_full_description.pdf", Trang 1].
*   **Phương pháp tìm kiếm**:
    *   *Random Search*: Thử ngẫu nhiên các tổ hợp [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 16].
    *   *Domain-guided Search*: Tìm kiếm dựa trên luật nghiệp vụ (Domain rules) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 17].
    *   *Genetic Search / Evolutionary Search*: Thuật toán di truyền, tối hóa qua chọn lọc tự nhiên [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 18; "project_full_description.pdf", Trang 1].

### Module 7: Backtesting Engine
*   **Chức năng**: Giả lập các giao dịch trên dữ liệu quá khứ bằng chiến lược được chỉ định và ghi nhận toàn bộ kết quả [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 19].
*   **Đầu ra**: Danh sách chi tiết các lệnh giao dịch (Trades) và các bộ chỉ số hiệu suất [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang Trang 4, Mục 26; "project_full_description.pdf", Trang 1].
*   **Ràng buộc thiết kế**: Việc đánh giá chiến lược (Strategy Evaluation) phải tách biệt hoàn toàn khỏi việc cài đặt logic chiến lược (Strategy Implementation) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 20].

### Module 8: Leaderboard
*   **Chức năng**: Xếp hạng các strategy dựa trên hiệu quả giao dịch sau khi chạy backtest, hỗ trợ các chức năng sắp xếp (sort) và lọc (filter) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 21; "project_full_description.pdf", Trang 1].
*   **Top-K**: Chỉ duy trì hiển thị trên màn hình tối đa K chiến lược tốt nhất (ví dụ: Top K = 10) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 22; "project_full_description.pdf", Trang 2].
*   **Ngưỡng cập nhật (Threshold)**: Một strategy mới được backtest thành công chỉ được đẩy vào Leaderboard nếu điểm số (score) của nó vượt qua điểm của strategy đứng cuối trong Top-K [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4-5, Mục 22; "project_full_description.pdf", Trang 2].

### Module 9: Continuous Strategy Loop
*   **Chức năng**: Vận hành vòng lặp ngầm: Tạo (Generate) -> Backtest -> Đánh giá (Evaluate) -> Xếp hạng (Rank) -> Leaderboard -> Tiếp tục tạo tiếp [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 23; "project_full_description.pdf", Trang 1].
*   **Yêu cầu thiết kế**: Bắt buộc phải có điều kiện dừng (Stop Condition), không để vòng lặp chạy vô hạn dạng `while(true)` không kiểm soát [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 23; "project_full_description.pdf", Trang 2].
*   **Mục tiêu cấu trúc**: Tách biệt rõ ràng các bước trong vòng lặp thành các thành phần độc lập (worker) để có thể khởi chạy song song, pause, resume, xử lý lỗi/retry và dễ quan sát giám sát [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 24].

### Module 10: News Crawler (News Collector)
*   **Chức năng**: Thu thập tin tức liên quan đến coin/pair từ nhiều nguồn khác nhau (RSS, API, Web Crawlers) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 27; "project_full_description.pdf", Trang 1].
*   **Yêu cầu thiết kế**: Tránh gắn chặt crawler với một nguồn dữ liệu cụ thể, tất cả dữ liệu thu thập phải được chuẩn hóa về một định dạng cấu trúc chung (`NewsItem` / `News`) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 28].

### Module 11: Sentiment Analysis
*   **Chức năng**: Sử dụng mô hình Machine Learning (ví dụ: BERT) phân loại tin tức thu thập được thành các nhãn cảm xúc khác nhau [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 29; "project_full_description.pdf", Trang 1 & Trang 2].
*   **Nhãn phân loại**: POSITIVE (Tích cực), NEGATIVE (Tiêu cực), NEUTRAL (Trung lập) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 29; "project_full_description.pdf", Trang 1].
*   **Sử dụng**: Kết quả sentiment có thể lưu trữ kèm điểm tin cậy (confidence score) và được tích hợp trực tiếp vào Strategy Engine như một loại chiến lược giao dịch độc lập (ví dụ: `NewsSentimentStrategy`) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 29-30].

---

## 3. Quy Tắc Nghiệp Vụ, Thuật Toán & Công Thức

### 3.1. Các chỉ báo và chiến lược phân tích kỹ thuật đơn lẻ
1.  **Chiến lược Moving Average (MA)**:
    *   *Định nghĩa*: Giá trị trung bình của giá đóng cửa trong một khoảng thời gian nhất định [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 2, Mục 7].
    *   *Thuật toán giao dịch (Crossover)*: Sử dụng hai đường trung bình MA20 (fastPeriod) và MA50 (slowPeriod). Nếu MA20 cắt lên trên MA50 -> BUY. Nếu MA20 cắt xuống dưới MA50 -> SELL [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 2, Mục 7].
2.  **Chiến lược RSI (Relative Strength Index)**:
    *   *Tham số*: Mặc định period = 14, buyThreshold = 30, sellThreshold = 70. Có thể thay đổi cấu hình thành RSI(14, 25, 75) hoặc RSI(21, 30, 70) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 2-3, Mục 8].
    *   *Thuật toán giao dịch*: Nếu RSI < 30 (quá bán) -> BUY. Nếu RSI > 70 (quá mua) -> SELL [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 2-3, Mục 8].
3.  **Chiến lược Bollinger Bands (BB)**:
    *   *Cơ cấu*: Tạo ba đường gồm Upper Band (Dải trên), Middle Band (Dải giữa) và Lower Band (Dải dưới) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 3, Mục 9].
    *   *Thuật toán giao dịch*:
        *   Cách 1 (Mean Reversion): Giá < Lower Band -> BUY; Giá > Upper Band -> SELL [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 3, Mục 9].
        *   Cách 2 (Breakout): Giá vượt dải Upper Band (Breakout) -> BUY [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 3, Mục 9].
4.  **Chiến lược Support/Resistance (S/R)**:
    *   *Định nghĩa*: Support (Hỗ trợ) là vùng giá mà trước đó đà giảm của tài sản thường dừng lại. Resistance (Kháng cự) là vùng giá mà trước đó đà tăng của tài sản thường gặp khó khăn và đảo chiều [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 3, Mục 10].
    *   *Thuật toán giao dịch*: Giá gần vùng hỗ trợ -> BUY; Giá gần vùng kháng cự -> SELL; Giá vượt kháng cự (Breakout Resistance) -> BUY [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 3, Mục 10].

### 3.2. Thuật toán kết hợp chiến lược (Composite Strategy)
*   **Quy tắc Majority Vote (Đa số biểu quyết)**:
    *   Tín hiệu của chiến lược tổng hợp là tín hiệu nhận được nhiều lượt đồng thuận nhất từ các chiến lược thành viên [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 3, Mục 13].
    *   *Ví dụ*: Trong tổ hợp 3 chiến lược: MA -> BUY, RSI -> BUY, S/R -> HOLD thì kết quả tổng hợp là BUY [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 3, Mục 13].
*   **Quy tắc Weighted Voting (Tính điểm theo trọng số)**:
    *   Mỗi chiến lược thành viên có một trọng số (Weight) riêng [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 14].
    *   Mã hóa tín hiệu giao dịch: BUY = `+1`, HOLD = `0`, SELL = `-1` [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 14].
    *   *Công thức tính điểm tổng hợp (Score)*:
        $$\text{Score} = \sum (\text{Tín hiệu}_i \times \text{Trọng số}_i)$$
    *   *Quy định ngưỡng đưa ra quyết định*:
        *   Nếu $\text{Score} > 0.3$ -> BUY [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 14].
        *   Nếu $\text{Score} < -0.3$ -> SELL [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 14].
        *   Các trường hợp còn lại -> HOLD [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 14].
    *   *Ví dụ thực tế*: Chiến lược MA (Trọng số 0.2) phát tín hiệu BUY (`+1`); RSI (Trọng số 0.3) phát tín hiệu SELL (`-1`); S/R (Trọng số 0.5) phát tín hiệu BUY (`+1`).
        $$\text{Score} = (1 \times 0.2) + (-1 \times 0.3) + (1 \times 0.5) = 0.4$$
        Vì $0.4 > 0.3$ nên tín hiệu tổng hợp cuối cùng là BUY [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 14].

### 3.3. Thuật toán tìm kiếm (Search Algorithm)
*   **Random Search**: Lựa chọn ngẫu nhiên các chiến lược và bộ tham số chỉ báo để tạo ra các ứng viên (candidate), sau đó đưa đi backtest [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 16].
*   **Domain-guided Search (Tìm kiếm có dẫn dắt nghiệp vụ)**:
    *   Áp dụng quy tắc nghiệp vụ để hạn chế không gian tìm kiếm ngẫu nhiên, nâng cao chất lượng ứng viên [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 17].
    *   *Quy tắc kết hợp*: Mỗi composite strategy bắt buộc phải chọn chính xác: **1 Trend Strategy** + **1 Momentum Strategy** + **1 Structure Strategy** [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 17].
    *   *Ràng buộc*: Không được kết hợp các chiến lược có cùng đặc tính bổ trợ cho nhau (ví dụ: không kết hợp 3 chiến lược xu hướng như MA10 + MA20 + MA50) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 17].

### 3.4. Chiến lược tích hợp News Sentiment
*   **Tin tức mẫu (Ví dụ)**:
    *   "Bitcoin surges after institutional adoption..." -> Sentiment: POSITIVE [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 29].
    *   "Major exchange suffers security breach..." -> Sentiment: NEGATIVE [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 29].
    *   "Bitcoin network upgrade scheduled..." -> Sentiment: NEUTRAL [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 29].
*   **Quy tắc giao dịch của NewsSentimentStrategy**:
    *   Lưu trữ kết quả sentiment dưới dạng nhãn cảm xúc kèm score (ví dụ: POSITIVE, score: 0.82) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 29].
    *   Tính giá trị sentiment trung bình trong vòng 1 giờ (Average sentiment) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 30].
    *   *Ngưỡng kích hoạt*:
        *   Nếu Average sentiment trong 1 giờ > 0.7 -> BUY [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 30].
        *   Nếu Average sentiment trong 1 giờ < -0.7 -> SELL [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 30].

---

## 4. Các Thuộc Tính Chất Lượng & Drivers Kiến Trúc

Hệ thống phải đáp ứng 7 thuộc tính chất lượng phần mềm (Architectural Drivers) [Explicit: "project_full_description.pdf", Trang 1-2, Mục "7 Architectural Drivers"; "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5-6, Mục 32]:

1.  **Modifiability (Khả năng thay đổi/mở rộng)**:
    *   Có thể thêm chiến lược mới (ví dụ: MACD Strategy) mà không phải sửa đổi cấu trúc của 20 module khác [Explicit: "project_full_description.pdf", Trang 1; "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 32.1].
    *   Thêm Market Data Provider mới (Ví dụ: chuyển từ Binance sang Binance + OKX) mà hoàn toàn không phải viết lại frontend [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 41].
2.  **Scalability (Khả năng mở rộng tải)**:
    *   Khi quy mô tăng từ 10 strategy lên tới 100.000 candidate strategy, kiến trúc hệ thống cần tích hợp thêm cơ chế Job Queue và nhiều Workers để xử lý không đồng bộ, thay vì xử lý tuần tự hoặc chặn kết nối (blocking API) [Explicit: "project_full_description.pdf", Trang 2; "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 32.2].
3.  **Realtime (Thời gian thực)**:
    *   Đảm bảo độ trễ thấp nhất có thể cho đường truyền dữ liệu: `Market Data -> Indicator -> Strategy -> UI` [Explicit: "project_full_description.pdf", Trang 2; "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 32.3].
4.  **Reliability (Độ tin cậy)**:
    *   Nếu kết nối đến Binance WebSocket bị mất (disconnect), hệ thống phải có cơ chế tự động kết nối lại (reconnect), thử lại (retry) và đảm bảo không bị mất nến (candles) lịch sử trong quá trình mất kết nối [Explicit: "project_full_description.pdf", Trang 2; "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5-6, Mục 32.4].
    *   Nếu News Service hoặc các module phụ khác bị lỗi (fault), các thành phần chính khác như đồ thị trực quan (Chart) vẫn phải hoạt động bình thường (Failure Isolation) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang Trang 5, Mục 41].
5.  **Performance (Hiệu năng)**:
    *   Khi có 1.000 chiến lược cần backtest, hệ thống cần xử lý song song thông qua worker pool thay vì xử lý tuần tự (sequential) để rút ngắn thời gian xử lý [Explicit: "project_full_description.pdf", Trang 2; "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6, Mục 32.5].
6.  **Maintainability (Khả năng bảo trì)**:
    *   Strategy Search không được phụ thuộc chặt vào việc cài đặt Backtesting (ví dụ: thay đổi thuật toán Random Search sang Genetic Search thì Backtester và Evaluator vẫn được giữ nguyên không đổi) [Explicit: "project_full_description.pdf", Trang 2; "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6, Mục 32.6].
7.  **Observability (Khả năng quan sát)**:
    *   Hệ thống cần cung cấp bảng điều khiển (monitoring) hiển thị trạng thái vận hành trực quan: Vòng lặp đang chạy hay dừng? Đã thử nghiệm bao nhiêu strategy? Thời gian chạy backtest mất bao lâu? Có bao nhiêu job bị lỗi? Chiến lược nào đang dẫn đầu Top 1? [Explicit: "project_full_description.pdf", Trang 2; "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6, Mục 32.7].

---

## 5. Cấu Trúc Dữ Liệu & Event-Driven Architecture

### 5.1. Định nghĩa cấu trúc dữ liệu lưu trữ
Dựa trên tài liệu hệ thống, các thực thể chính trong Database cần thiết kế bao gồm [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 35-36 & Trang 5, Mục 38]:

1.  **Market Data / Candles**: Lưu trữ dữ liệu đồ thị nến lịch sử.
    *   *Trường dữ liệu*: `Candles`, `Pair`, `Timeframe`, `Timestamp`, `Open`, `High`, `Low`, `Close`, `Volume`.
2.  **Strategy**: Lưu trữ thông tin định nghĩa chiến lược.
    *   *Trường dữ liệu*: `StrategyDefinition`, `Parameters`, `Version`, `CreatedAt`.
    *   *Yêu cầu*: Mỗi strategy bắt buộc phải có thông tin version cụ thể (ví dụ: `v1.0.0`, `v1.2.1`), không được ghi đè (overwrite) để đảm bảo khả năng tái lập kết quả (Reproducibility) của các thực nghiệm cũ.
3.  **Experiment / Combination**: Lưu trữ lịch sử chạy tối ưu hóa và thực nghiệm.
    *   *Trường dữ liệu*: `Combination`, `Dataset`, `Timeframe`, `Parameters`, `Result`.
4.  **Trades**: Lưu trữ lịch sử giao dịch giả lập từ Backtest.
    *   *Trường dữ liệu*: `Entry`, `Exit`, `Profit`, `Strategy`.
5.  **News**: Lưu trữ thông tin tin tức thu thập và kết quả Sentiment.
    *   *Trường dữ liệu*: `Title`, `Content`, `Source`, `PublishedAt`, `RelatedCoin`, `Sentiment`.
6.  **Leaderboard**: Lưu trữ bảng xếp hạng. Có hai phương án lưu trữ được đề xuất:
    *   *Phương án 1*: Lưu trữ dữ liệu trực tiếp trong database.
    *   *Phương án 2*: Tính toán động (dynamic calculation) trực tiếp từ bảng Experiment Results.

### 5.2. Các Event trong Event-Driven Architecture
Hệ thống sử dụng kiến trúc hướng sự kiện để giảm sự phụ thuộc lẫn nhau (loose coupling) giữa các module. Các sự kiện chính được định nghĩa gồm [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 34 & Trang 5, Mục 37; "project_full_description.pdf", Trang 2]:

*   `MarketPriceUpdated`: Sự kiện khi có cập nhật giá mới từ thị trường.
*   `CandleClosed`: Sự kiện khi một cây nến kết thúc phiên.
*   `StrategyGenerated`: Sự kiện khi một chiến lược ứng viên được tạo mới từ bộ sinh.
*   `BacktestStarted`: Sự kiện khi quá trình backtest một chiến lược bắt đầu.
*   `BacktestCompleted`: Sự kiện khi quá trình backtest một chiến lược hoàn tất.
*   `StrategyEvaluated` (hoặc `StrategyEvaluatedEvent`): Được phát ra bởi Backtest Worker sau khi đánh giá xong hiệu suất của chiến lược ứng viên. Hệ thống xếp hạng (Ranking Service) sẽ lắng nghe event này để xử lý xếp hạng.
*   `LeaderboardUpdated` (hoặc `LeaderboardUpdatedEvent`): Phát ra sau khi Ranking Service cập nhật xong bảng xếp hạng. Frontend lắng nghe event này để tự động cập nhật bảng xếp hạng trên UI theo thời gian thực mà không cần người dùng reload trang.
*   `NewsCollected`: Sự kiện khi thu thập thành công tin tức mới.
*   `SentimentAnalyzed`: Sự kiện khi hoàn tất phân tích sentiment cho một tin tức.

---

## 6. Các Anti-patterns & Ràng Buộc Kiến Trúc

### 6.1. 5 Anti-patterns cần tránh tuyệt đối
Để đảm bảo chất lượng đồ án, nhóm phát triển không được vi phạm 5 anti-pattern sau [Explicit: "project_full_description.pdf", Trang 1-2, Mục "5 Anti-patterns cần tránh"; "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6, Mục 44]:

1.  **God Service (Dịch vụ vạn năng)**:
    *   *Sai*: Thiết kế một service duy nhất (ví dụ: `TradingService`) đảm nhận tất cả nhiệm vụ: gọi Binance API, tính chỉ báo RSI, cào tin tức, chạy backtest, xếp hạng.
    *   *Đúng*: Tách biệt rõ ràng các mối bận tâm (concerns) thành các module/service riêng biệt.
2.  **Hard-coded Strategy (Cài đặt cứng chiến lược)**:
    *   *Sai*: Viết các lệnh điều kiện lồng nhau cứng nhắc dạng: `if MA && RSI ... else if MA && Bollinger ...`.
    *   *Đúng*: Sử dụng mẫu thiết kế Plugin Pattern kết hợp với Registry để quản lý chiến lược một cách linh hoạt.
3.  **Frontend Logic (Đẩy nghiệp vụ cho frontend)**:
    *   *Sai*: Để mã nguồn phía Client (React/Vue) trực tiếp tính toán logic chiến lược, tính toán profit/loss hoặc tự chạy backtest.
    *   *Đúng*: Toàn bộ logic nghiệp vụ nặng phải được xử lý ở Backend, Frontend chỉ đóng vai trò hiển thị và trực quan hóa kết quả.
4.  **Direct DB Access (Truy cập DB trực tiếp từ chiến lược)**:
    *   *Sai*: Viết code trực tiếp cho class chiến lược (ví dụ: `RSIStrategy`) truy vấn dữ liệu từ MySQL.
    *   *Đúng*: Các chiến lược chỉ được phép nhận dữ liệu đầu vào cần thiết thông qua các tầng trừu tượng (abstraction layer) thích hợp được định nghĩa sẵn.
5.  **Tight Coupling (Gắn kết quá chặt chẽ)**:
    *   *Sai*: Gắn cứng crawler tin tức trực tiếp với mô hình phân tích ML (ví dụ: `NewsConverter` trực tiếp gọi mô hình BERT).
    *   *Đúng*: Crawler chỉ làm nhiệm vụ thu thập tin tức, sau đó Sentiment Service mới lấy tin tức đó ra để xử lý phân tích độc lập.

---

## 7. Chi Tiết Quan Sát Từ Giao Diện Người Dùng (UI/UX)

Qua quan sát trực tiếp 5 ảnh chụp màn hình giao diện thực tế của hệ thống Crypto Strategy Lab, thu thập được các thông tin giao diện và tham số nghiệp vụ chi tiết sau:

### 7.1. Màn hình "Discovery" (Quan sát từ UI_1.jpg)
*   **Thanh Menu trái**: Chứa logo hệ thống "Crypto Strategy Lab", danh sách tab chức năng: *Realtime*, *Strategy Engine*, *Discovery* (đang active màu xanh), *Backtest*, *News Crawler*, *Settings*. Hiển thị thông tin tài khoản: "Nguyễn Minh" kèm nhãn "Pro Student" có ngày hết hạn "20/06/2025".
*   **Cột "Strategy đơn"**: Danh sách các chiến lược có sẵn gồm:
    *   RSI (Đo động lượng và xác định vùng quá mua/quá bán).
    *   MA (Theo xu hướng bằng đường trung bình động).
    *   Bollinger Bands (Đo độ biến động và phát hiện phá vỡ dải).
    *   Support / Resistance (Xác định vùng hỗ trợ và kháng cự quan trọng).
    *   SMC (Phân tích cấu trúc thị trường theo Smart Money Concepts) - *Ghi chú: Đang có biểu tượng khóa, có thể yêu cầu tài khoản nâng cao*.
    *   Wyckoff (Nhận diện giai đoạn tích lũy và phân phối) - *Ghi chú: Đang có biểu tượng khóa*.
    *   Nút bấm "+ Tạo strategy mới" ở dưới cùng.
*   **Cột "Strategy kết hợp"**:
    *   Khung chọn các chiến lược muốn kết hợp với chip hiển thị: `MA`, `RSI`, `Support / Resistance`.
    *   Gợi ý kết hợp nhanh gồm các nút: `MA + RSI`, `RSI + Bollinger`, `MA + RSI + S/R`.
    *   **Bảng "Weighted Voting (Tín hiệu tổng hợp)"**:
      *   Chiến lược `MA (20, 50)` có thanh trượt trọng số đặt ở `0.40`, tín hiệu phát ra là Mũi tên lên màu xanh (BUY).
      *   Chiến lược `RSI (14)` có thanh trượt trọng số đặt ở `0.30`, tín hiệu phát ra là Mũi tên lên màu xanh (BUY).
      *   Chiến lược `Support / Resistance` có thanh trượt trọng số đặt ở `0.30`, tín hiệu phát ra là dấu gạch ngang (HOLD).
    *   **Khung hiển thị "Tín hiệu tổng hợp hiện tại"**: Gồm 3 trạng thái:
      *   **LONG**: Điểm số `0.62`, hiển thị mũi tên lên màu xanh lá (Đang được kích hoạt/highlight).
      *   **HOLD**: Điểm số `-0.08`, hiển thị dấu gạch ngang màu xám.
      *   **SHORT**: Điểm số `-0.54`, hiển thị mũi tên xuống màu đỏ.
      *   *Quy định*: Ngưỡng vào lệnh được thiết kế là: $|score| \ge 0.30$.
      *   Có đèn trạng thái "Cập nhật realtime" (chấm xanh lá cây).
    *   Hai nút bấm lớn ở chân cột: "Lưu strategy kết hợp" (màu viền xanh) và "Backtest ngay" (nút đầy màu xanh).
*   **Cột "Loop Discovery"**:
    *   Sơ đồ quy trình trực quan: `Generate` (Tạo biến thể strategy) -> `Backtest` (Kiểm tra hiệu suất trên lịch sử) -> `Evaluate` (Đánh giá theo chỉ số) -> `Rank` (Xếp hạng các strategy) -> `Leaderboard` (Hiển thị top strategy).
    *   **Leaderboard (Top strategies)**: Bảng xếp hạng gồm các cột Rank (hiển thị cúp vàng, bạc, đồng cho top 3), Strategy, Profit (USDT), Winrate. Các dòng dữ liệu gồm:
        1.  `MA + RSI + S/R` | `+2,342.18` | `68.21%`
        2.  `RSI + Bollinger` | `+1,864.76` | `64.73%`
        3.  `MA + RSI` | `+1,512.33` | `62.19%`
        4.  `MA + RSI + Bollinger` | `+1,102.47` | `59.48%`
        5.  `S/R + Bollinger` | `+987.15` | `57.63%`
    *   **Khung "Phương pháp Discovery"**: Cho phép lựa chọn qua radio button gồm:
        *   `Random Search` (Sinh ngẫu nhiên các biến thể) -> đang chọn.
        *   `Domain-guided Search` (Tìm kiếm dựa trên kiến thức và ràng buộc).
        *   `Genetic Search` (Tiến hóa qua chọn lọc và lai ghép).
    *   **Khung "Tiến trình Discovery"**:
        *   Thanh tiến trình Iteration hiện tại: `47 / 500`.
        *   Số lượng thực nghiệm đã chạy: "Đã kiểm tra 2,350 candidates".
        *   "Best strategy so far": hiển thị tên chiến lược `MA + RSI + S/R`, Profit đạt `+2,342.18 USDT`, Winrate đạt `68.21%`.

### 7.2. Màn hình "Backtest" (Quan sát từ UI_2.jpg)
*   **Các trường dữ liệu đầu vào**:
    *   Cặp coin giao dịch (Pair / Coin): `BTCUSDT` (hỗ trợ chọn từ dropdown).
    *   Khung thời gian (Timeframe): `5m` (dropdown).
    *   Thời gian bắt đầu (From date): `01/05/2025` (chọn lịch).
    *   Thời gian kết thúc (To date): `15/05/2025` (chọn lịch).
    *   Vốn khởi điểm (USD): `100` (ô nhập).
    *   Chiến lược kiểm thử (Strategy): `MA Crossover` (dropdown).
    *   Phí giao dịch (Transaction Cost): `0.08%` (ô nhập).
    *   Trượt giá (Slippage): `5 bps` (ô nhập).
*   **"Biểu đồ Backtest (BTCUSDT · 5m)"**:
    *   Vùng đồ thị nến có vẽ các đường chỉ báo kỹ thuật: `MA(20)` có giá trị `69,135.45`, `MA(50)` có giá trị `68,912.73`.
    *   Có hiển thị 2 đường chấm đứt nét biểu diễn: "Hỗ trợ" màu xanh lá cây tại mức giá `67,800.00` và "Kháng cự" màu đỏ tại mức giá `70,200.00`.
    *   Có nhãn Volume hiển thị khối lượng giao dịch dưới dạng cột (ví dụ: `1.24K`).
    *   **Các nhãn chỉ báo tín hiệu giao dịch trực tiếp trên biểu đồ nến**: Hiển thị các điểm vào/ra lệnh trực quan bằng nhãn mũi tên: "SHORT Entry", "LONG Entry", "Take Profit", "Stop Loss", "Exit".
*   **Bảng "Danh sách lệnh giao dịch"**:
    *   Bảng phân trang (mặc định hiển thị 10 dòng, cho phép cấu hình số lượng hiển thị, ví dụ: 10 dòng/trang). Có thông báo "1-10 của 178 lệnh".
    *   Các cột thông tin gồm: `#`, `Pair / Coin`, `Thời gian vào lệnh`, `Hướng`, `Giá vào`, `Stoploss`, `TakeProfit`, `Giá kết thúc`, `Phí`, `Slippage`, `Profit (USD)`.
    *   *Chi tiết dữ liệu dòng 1*: `#1` | `BTCUSDT` | `01/05/2025 06:15` | `LONG` | `68,120.50` | `67,620.00` | `69,120.00` | `69,050.80` | `-0.05` | `-0.03` | `+0.83`
    *   *Chi tiết dữ liệu dòng 3*: `#3` | `BTCUSDT` | `01/05/2025 12:25` | `LONG` | `68,600.10` | `68,100.00` | `69,600.00` | `67,980.00` | `-0.05` | `-0.03` | `-0.67`
*   **Khung chỉ số hiệu suất dưới biểu đồ**:
    *   **Winrate**: `61.80%` (biểu thị dưới dạng vòng tròn tiến trình, chi tiết là 110 lệnh thắng / 178 tổng lệnh).
    *   **Wins**: `110` (Tổng lệnh thắng).
    *   **Losses**: `68` (Tổng lệnh thua).
    *   **Total Profit**: `+8.42 USD` (kèm biểu đồ đường xu hướng tăng trưởng lợi nhuận, giá trị cụ thể là `+8.42%`).
    *   **Max Drawdown**: `-3.21 USD` (tỷ lệ là `-3.21%`).
    *   **Total Trades**: `178` (`100%`).
*   **Khung "Cách tính Profit"**: Biểu diễn bằng công thức trực quan:
    $$\text{Gross Profit} - \text{Fee (Phí giao dịch 0.08%)} - \text{Slippage (Trượt giá 5 bps)} = \text{Net Profit (Lợi nhuận ròng thực tế)}$$
*   **Khung "Giả định Backtest"**: Chứa 3 hộp kiểm (checkbox) đã được chọn:
    *   `[x] Hỗ trợ cả LONG và SHORT`
    *   `[x] Xử lý SL/TP theo giá thực tế (OHLC)`
    *   `[x] Kết quả có thể tái lập (reproducible)`

### 7.3. Màn hình "News Crawler" (Quan sát từ UI_3.jpg)
*   **Khung chọn cấu hình Crawl**:
    *   *Nguồn (Source)*: Gồm 3 nút chọn đa mục: `Website` (đang chọn), `RSS` (đang chọn), `HTML` (chưa chọn).
    *   *Pair (Asset)*: Danh sách tài sản cần theo dõi, hiển thị chip chọn: `BTC`, `ETH`, `SOL`.
    *   *Auto refresh*: Tần suất tự động làm mới, đang chọn `1 phút` (các tùy chọn khác: 2 phút, 3 phút, 4 phút, 5 phút).
    *   Có nút "Cấu hình nguồn" và "Bắt đầu crawl" (màu xanh dương).
*   **Bảng "Tin tức đầu vào"**: Hiển thị thời gian cập nhật gần nhất: `10:45:18`. Có nút "Xem tất cả tin tức ->".
    *   Bảng chứa các cột: Asset (hiển thị logo và ký hiệu coin, ví dụ: BTC, ETH, SOL), Tiêu đề, Nguồn, Thời gian.
    *   *Dòng tin thứ 1*: BTC | "BlackRock's Bitcoin ETF sees $200M inflows as BTC holds above $69K" | CoinDesk | 10:40.
    *   *Dòng tin thứ 2*: ETH | "Ethereum Pectra testnet upgrade live, developers eye final launch" | The Block | 10:32.
*   **Khung "LLM-assisted Extraction (Trích xuất dữ liệu bằng LLM)"**:
    *   Sơ đồ quy trình:
        1.  *HTML thô*: Hiển thị một khung code HTML thô (ví dụ: `<html> <head> ... <body> <div class="article"> <h1>BlackRock's Bitcoin ETF...</h1> </div> ...`).
        2.  *LLM hiểu tag HTML*: Hiển thị danh sách các trường nhận diện được từ HTML: `title -> <h1>`, `summary -> <p class="summary">`, `source -> <span class="source">`, `time -> <time>`, `asset -> context`.
        3.  *Sinh Extraction Template*: Khung sinh ra cấu trúc định dạng JSON mẫu để trích xuất dữ liệu tự động (ví dụ: `{"title": "h1.article-title", "summary": "p.summary", "source": "span.source", "time": "time", "asset": "meta[content][asset]"}`). Hiển thị chỉ số đánh giá: `Độ tin cậy: 0.92`, `Fields: 5`, `Score: 0.92`.
        4.  *Lưu version template*: Hiển thị nhãn `Template: v1.4.2` kèm trạng thái "Hiện tại" màu xanh lá. Dưới hiển thị danh sách các phiên bản cũ đã lưu để quản lý: `v1.4.1` (10:32 · 18/05/2025), `v1.4.0` (09:10 · 18/05/2025), `v1.3.9` (16:22 · 16/05/2025). Có nút "Xem tất cả".
*   **Khung "Self-healing extraction (Tự động sửa lỗi template)"**:
    *   Nhãn trạng thái toggle "Tự động bật" (đang bật).
    *   Sơ đồ khối thuật toán tự sửa lỗi: `Validate kết quả` -> `Kiểm tra tỷ lệ lỗi > ngưỡng` -> Nếu "Có" -> chuyển sang `LLM sửa template` -> chuyển sang `Lưu version mới`. Nếu "Không" -> `Đã xuất bản thành công`.
    *   *Các chỉ số hiện tại*: `Fields rỗng: 8.7%`, `Sai định dạng: 3.2%`, `Độ tin cậy TB: 0.76`, `Tổng lỗi: 11.9%` (được bôi đỏ vì vượt ngưỡng 10%).
    *   *Luồng xử lý tự sửa lỗi (Self-healing)*: Vì tổng lỗi đạt `11.9% > 10%` nên hệ thống đi theo nhánh "Có" -> `LLM sửa template` sinh bản nháp `v1.4.3 (draft)`. Giúp giảm tỷ lệ lỗi dự kiến từ `11.9% -> 4.1%`, tăng độ tin cậy lên `0.93`. Có nút bấm "Áp dụng ngay".
*   **Khung "Đầu ra phân tích"**: Cập nhật lúc `10:45`.
    *   **Sentiment tổng hợp (24h)**: Thanh tiến trình 3 màu: `POSITIVE: 58%` (màu xanh lá), `NEUTRAL: 27%` (màu xám), `NEGATIVE: 15%` (màu đỏ).
    *   **Event Type (Top)**: Thống kê tỷ lệ loại sự kiện: `ETF / Fund Flow: 28%`, `Protocol Upgrade: 22%`, `Regulation: 15%`, `Partnership: 12%`, `Market Trend: 23%`.
    *   **Các chỉ số khác**: `Confidence Score (TB): 0.78`, `Số lượng tin đã phân tích (24h): 1,248`, `Độ bao phủ nguồn: 92%`, `Nguồn hoạt động: 23 / 25`.
*   **Khung "Tích hợp với Strategy"**:
    *   Hiển thị sơ đồ luồng dữ liệu tích hợp: `News Sentiment (Real-time)` -> `API/Stream` -> `Tín hiệu vào lệnh` hoặc `Hoặc sử dụng trực tiếp` -> Chiến lược mẫu `NewsSentimentStrategy`.

### 7.4. Màn hình "Strategy Engine" (Quan sát từ UI_4.jpg)
*   **Khung "Nhập mô tả strategy"**:
    *   Ô nhập văn bản mô tả chiến lược bằng ngôn ngữ tự nhiên. Đoạn văn bản mẫu hiện tại: *"Khi RSI dưới 30 và giá nằm dưới Bollinger Lower Band thì LONG. Stop loss 2%, take profit 4%."* (Số lượng ký tự: `97/1000`).
    *   Có nút "Phân tích bằng LLM" (màu xanh) và nút "Xóa" (icon thùng rác).
*   **Khung "Nhập URL chiến lược"**:
    *   Ô nhập link liên kết. Link mẫu hiện tại: `https://www.tradingview.com/script/abc123-example/`. Có dòng ghi chú: "Hỗ trợ: TradingView, Blogger, Medium, GitHub Gist, Docs...".
    *   Nút bấm "Trích xuất từ website".
*   **Khung "Strategy đã phân tích"**: Hiển thị kết quả LLM bóc tách các trường:
    *   *Điều kiện LONG*: `RSI (14) < 30` và `Giá đóng cửa nằm dưới Bollinger Lower Band (20, 2)`.
    *   *Điều kiện SHORT*: `RSI (14) > 70` và `Giá đóng cửa nằm trên Bollinger Upper Band (20, 2)`.
    *   *Quản trị rủi ro*: `Stop Loss: 2%` và `Take Profit: 4%`.
    *   *Khung thời gian*: `1h (mặc định)`.
    *   *Áp dụng cho cặp*: `Tất cả cặp USDT (Có thể tùy chọn)`.
*   **Khung "Định nghĩa strategy (JSON)"**: Hiển thị mã nguồn JSON được sinh tự động chứa các tham số của chiến lược cấu trúc dạng:
    ```json
    {
      "name": "RSI_BB_LB_LONG_SL2_TP4",
      "version": "1.0.0",
      "description": "...",
      "indicators": [
        { "name": "RSI", "period": 14 },
        { "name": "BollingerBands", "period": 20, "stdDev": 2 }
      ],
      "conditions": { ... },
      "riskManagement": {
        "stopLoss": { "type": "percent", "value": 2 },
        "takeProfit": { "type": "percent", "value": 4 }
      }
    }
    ```
    Có nút "Sao chép" ở góc trên cùng bên phải.
*   **Khung "Kiểm tra & Validation"**: Hiển thị danh sách checkmark kiểm tra tính đúng đắn trước khi lưu:
    *   `[x] Thiếu trường bắt buộc`: Không có (hiển thị tích xanh).
    *   `[x] Kiểm tra logic`: Logic hợp lệ (hiển thị tích xanh).
    *   `[x] Chỉ báo hỗ trợ`: Tất cả chỉ báo được hỗ trợ (hiển thị tích xanh).
    *   *Trạng thái*: "Hợp lệ để lưu vào thư viện" (hiển thị nhãn xanh lá cây).
*   **Khung "Lưu vào Strategy Library"**: Chứa các trường nhập thông tin:
    *   Name: `RSI_BB_LB_LONG_SL2_TP4`
    *   Version: `1.0.0`
    *   Tags: hiển thị các tag được chọn gồm `RSI`, `Bollinger`, `Mean Reversion`, `Long`.
    *   Source (Nguồn chiến lược): dropdown hiển thị chọn `USER_PROMPT`.
    *   Nút bấm lớn ở dưới cùng: "Lưu Strategy" (màu xanh dương).
*   **Khung "Chiến lược đã import gần đây"**: Có nút "Xem tất cả >". Bảng danh sách gồm các cột: Tên strategy, Source, Ngày tạo, Version, Tags, Trạng thái, Hành động.
    *   *Dòng 1*: `RSI_BB_LB_LONG_SL2_TP4` | `USER_PROMPT` | `20/05/2025 10:42` | `1.0.0` | `RSI`, `BB`, `Long` | Hợp lệ (chấm xanh) | nút Play / Options.
    *   *Dòng 2*: `MACD_Cross_TrendFollow` | `WEB_IMPORT` | `19/05/2025 16:30` | `1.2.1` | `MACD`, `Trend`, `Swing` | Hợp lệ (chấm xanh) | nút Play / Options.

### 7.5. Màn hình "Realtime" (Quan sát từ UI_5.jpg)
*   **Khung cấu hình bộ lọc Đồ thị**:
    *   Chọn cặp giao dịch (Pair / Coin): `BTCUSDT` (dropdown).
    *   Khung thời gian (Timeframe): hiển thị danh sách nút chọn nhanh: `1m` (đang chọn), `5m` (đang chọn), `15m` (đang chọn), `1h` (đang chọn), `4h` (chưa chọn).
    *   Nút gạt toggle `Realtime` (đang ở trạng thái Bật màu xanh). Bên cạnh có thông báo "Đang nhận dữ liệu" kèm chấm xanh lá cây nhấp nháy.
*   **Giao diện 4 Đồ thị đồng thời**: Hiển thị chi tiết 4 khung đồ thị nến:
    1.  *Khung 1*: `BTCUSDT · 1m` | Giá hiện tại: `69,342.18` (tăng `+0.28%`). Có dán nhãn tín hiệu `BUY` màu xanh lá cây. Đường trung bình động vẽ trên đồ thị là `MA(20) 69,315.45`.
    2.  *Khung 2*: `BTCUSDT · 5m` | Giá hiện tại: `69,342.18` (tăng `+0.28%`). Có dán nhãn tín hiệu `BUY`. Đường trung bình động vẽ trên đồ thị là `MA(20) 69,182.73`.
    3.  *Khung 3*: `BTCUSDT · 15m` | Giá hiện tại: `69,342.18` (tăng `+0.28%`). Có dán nhãn tín hiệu `BUY`. Đường trung bình động vẽ trên đồ thị là `MA(20) 68,912.35`.
    4.  *Khung 4*: `BTCUSDT · 1h` | Giá hiện tại: `69,342.18` (giảm `-0.15%`). Có dán nhãn tín hiệu `SELL` màu đỏ. Đường trung bình động vẽ trên đồ thị là `MA(20) 68,215.66`.
    *   Mỗi đồ thị nến đều hiển thị biểu đồ khối lượng Volume ở dưới chân và có 2 nút chức năng nhỏ: "Load 1000 nến lịch sử" và "Cập nhật realtime" (chấm xanh lá cây).
*   **Khung "Logic cập nhật candle"**: Giải thích nguyên lý cập nhật nến bằng sơ đồ trực quan:
    *   *Trùng nến cuối -> Update candle*: Nếu nến nhận được có cùng thời gian với nến cuối hiện tại -> Thực hiện Update (ghi đè giá trị).
    *   *Nến mới hoàn toàn -> Append candle*: Nếu nến nhận được có thời gian lớn hơn nến cuối hiện tại -> Thực hiện Append (thêm nến mới vào danh sách).
*   **Khung "Trạng thái kết nối"**:
    *   Nguồn dữ liệu: `Binance API + WebSocket`
    *   Độ trễ (Latency): `102 ms`
    *   Dữ liệu cuối: `10:45:38`
    *   Kết nối: `Ổn định` (hiển thị chấm xanh lá cây).
*   **Khung "Recent Ticks (BTCUSDT)"**: Danh sách các tick giao dịch khớp lệnh tức thời gồm các trường: Thời gian, Giá, Khối lượng, Loại (Buy/Sell).
    *   *Tick 1*: `10:45:38.123` | `69,342.18` | `0.012` | `Buy`
    *   *Tick 2*: `10:45:38.087` | `69,342.17` | `0.005` | `Buy`
    *   *Tick 3*: `10:45:38.051` | `69,342.15` | `0.010` | `Sell`
    *   *Tick 4*: `10:45:38.015` | `69,342.16` | `0.007` | `Sell`
    *   *Tick 5*: `10:45:37.979` | `69,342.14` | `0.020` | `Sell`
*   **Khung "Chú thích"**:
    *   Khối màu xanh lá cây: Nến tăng (Close > Open).
    *   Khối màu đỏ: Nến giảm (Close < Open).
    *   Đường nét màu xanh dương: MA(20) - Đường trung bình động 20.
    *   Biểu đồ cột màu đỏ nhạt: Volume - Khối lượng giao dịch.
    *   Nhãn BUY (màu xanh lá): Tín hiệu Mua.
    *   Nhãn SELL (màu đỏ): Tín hiệu Bán.

---

## 8. Các Điểm Khác Biệt & Mâu Thuẫn Giữa Các Nguồn

Trong quá trình phân tích các nguồn dữ liệu trong notebook, phát hiện một số điểm khác biệt về tham số hoặc thiết kế kỹ thuật giữa các tài liệu. Nhằm đảm bảo tính khách quan và đầy đủ, tài liệu này giữ nguyên cả hai luồng thông tin để phục vụ cho các quyết định thiết kế kiến trúc sau này:

### 8.1. Khung thời gian (Timeframes) hỗ trợ trên hệ thống
*   **Nguồn 1: Tài liệu đồ án cuối kỳ** ("Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Mục 3 & Mục 5) phát biểu:
    *   Hệ thống hiển thị đồng thời 4 biểu đồ với khung thời gian mặc định ban đầu là: `5m`, `15m`, `1h`, `4h`.
    *   Người dùng có thể thay đổi độc lập khung thời gian của các chart theo quy tắc chuyển đổi: `5m -> 1m`, `15m -> 30m`, `1h -> 2h`, `4h -> 1d`.
*   **Nguồn 2: Hình ảnh chụp bài giảng thực tế** (Ảnh slide giảng đường `773981388..._n.jpg`) ghi nhận:
    *   Cấu hình đồ thị nến mặc định hiển thị: `BTCUSDT - 5m`, `BTCUSDT - 15m`, `BTCUSDT - 1h`, `BTCUSDT - 4h`.
    *   Quy tắc chuyển đổi khung thời gian hỗ trợ: `5m -> 1m`, `15m -> 30m`, `1h -> 2h`, `4h -> 1d`.
*   **Nguồn 3: Đồ họa giao diện thực tế của hệ thống** (Mockup UI Đồ thị thời gian thực `UI_5.jpg`) hiển thị:
    *   Hệ thống cung cấp một hàng nút bấm chọn nhanh các khung thời gian ở trên cùng bao gồm: `1m`, `5m`, `15m`, `1h`, `4h`.
    *   4 đồ thị hiển thị đồng thời trên màn hình tương ứng với các khung thời gian đang được kích hoạt là: `BTCUSDT · 1m`, `BTCUSDT · 5m`, `BTCUSDT · 15m`, `BTCUSDT · 1h`.

### 8.2. Tham số và Đầu vào - Đầu ra của quá trình Backtest
*   **Nguồn 1: Hình ảnh chụp bài giảng thực tế** (Ảnh slide giảng đường `773981388..._n.jpg` và `778426143..._n.jpg`):
    *   *Tham số đầu vào Backtest*: Gồm 4 trường thông tin: "Chọn pair/coin", "Chọn thời gian test: from-to", "Chọn vốn: 100$", "Chọn strategy: đơn/đa".
    *   *Các cột dữ liệu đầu ra bảng kết quả*: Gồm 9 cột thông tin: `Pair/Coin`, `Thời gian vào lệnh`, `Hướng: LONG/SHORT`, `Khối lượng: USD`, `Giá vào lệnh`, `Stoploss`, `TakeProfit`, `Giá kết thúc`, `Profit`.
*   **Nguồn 2: Đồ họa giao diện thực tế của hệ thống** (Mockup UI Backtest `UI_2.jpg`):
    *   *Tham số đầu vào Backtest*: Gồm 8 trường thông tin chi tiết hơn: `Pair / Coin`, `Timeframe`, `From date`, `To date`, `Vốn (USD)`, `Strategy`, `Transaction Cost`, `Slippage`.
    *   *Các cột dữ liệu đầu ra bảng kết quả*: Gồm 11 cột thông tin phong phú hơn: `#`, `Pair / Coin`, `Thời gian vào lệnh`, `Hướng`, `Giá vào`, `Stoploss`, `TakeProfit`, `Giá kết thúc`, `Phí`, `Slippage`, `Profit (USD)`.

### 8.3. Không gian tìm kiếm tối ưu hóa chiến lược (Search Space)
*   **Nguồn 1: Tài liệu đồ án cuối kỳ** ("Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Mục 17 & Mục 37) phát biểu:
    *   Hệ thống bắt buộc phải cài đặt thuật toán tối thiểu là `Random Search` để tìm kiếm và tối ưu tham số chiến lược phức hợp từ các chiến lược đơn lẻ: `MA`, `RSI`, `Bollinger Bands`, `Support/Resistance`.
*   **Nguồn 2: Đồ họa giao diện thực tế của hệ thống** (Mockup UI Discovery `UI_1.jpg`):
    *   Hệ thống hiển thị trực quan 3 thuật toán tìm kiếm bao gồm: `Random Search` (đang chọn), `Domain-guided Search` (lựa chọn qua tri thức nghiệp vụ) và `Genetic Search` (lập trình di truyền).
    *   Không gian các chiến lược đơn lẻ hỗ trợ tìm kiếm hiển thị thêm 2 chiến lược nâng cao là `SMC` (Smart Money Concepts) và `Wyckoff` (mặc dù hai chiến lược này đang bị hiển thị biểu tượng khóa).

---

## 9. Phân Loại Chi Tiết Hệ Thống Thông Tin (Explicit, Observed, Inferred)

Để hỗ trợ việc chuyển đổi trực tiếp tài liệu này thành Software Specification, dưới đây là bảng phân loại chi tiết các thông tin thu thập được theo 3 nhóm thuộc tính:

### 9.1. Nhóm thông tin Explicit (Nguồn khẳng định trực tiếp)
*   **Yêu cầu nghiệp vụ cốt lõi**:
    *   Hệ thống phải nhận dữ liệu từ Binance và hỗ trợ hiển thị biểu đồ realtime tối đa 4 khung thời gian [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1].
    *   Hệ thống phải hỗ trợ tối thiểu 4 chiến lược đơn lẻ: MA, RSI, Bollinger Bands, Support/Resistance [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6, Mục 37; "project_full_description.pdf", Trang 1].
    *   Phải hỗ trợ cơ chế tổ hợp chiến lược Composite Strategy [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang Trang 3, Mục 13; "project_full_description.pdf", Trang 1].
    *   Hệ thống phải vận hành một vòng lặp ngầm Continuous Strategy Loop có stop condition được thiết kế kiểm soát chặt chẽ [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 23; "project_full_description.pdf", Trang 2].
    *   Kết quả backtest phải được xếp hạng và quản lý thông qua cấu trúc bảng xếp hạng Top-K Leaderboard [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 21-22; "project_full_description.pdf", Trang 2].
    *   Mỗi chiến lược lưu trong thư viện bắt buộc phải gắn version chi tiết để phục vụ khả năng tái lập thực nghiệm (Reproducibility) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 36; "project_full_description.pdf", Trang 2].
    *   Phải thu thập tin tức, phân loại sentiment thành POSITIVE, NEGATIVE, NEUTRAL và có khả năng ứng dụng kết quả sentiment làm một chiến lược giao dịch độc lập [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4-5, Mục 29-30; "project_full_description.pdf", Trang 1].
*   **Ràng buộc phi chức năng**:
    *   Hệ thống phải tách biệt việc đánh giá chiến lược (Strategy Evaluation) khỏi logic cài đặt chiến lược (Strategy Implementation) [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 20].
    *   Frontend không được phụ thuộc trực tiếp vào cấu trúc dữ liệu của Binance API, yêu cầu thiết kế qua adapter trừu tượng [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 4; "project_full_description.pdf", Trang 2].
    *   Tránh thiết kế coupling quá chặt chẽ giữa crawler tin tức và mô hình phân tích ML [Explicit: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6, Mục 44; "project_full_description.pdf", Trang 2].

### 9.2. Nhóm thông tin Observed (Quan sát từ UI Mockup & Ảnh chụp bài giảng)
*   **Yêu cầu giao diện (UI) và Tính năng**:
    *   Hệ thống hỗ trợ cơ chế tự động tạo chiến lược (Strategy Engine) bằng cách cho phép người dùng nhập mô tả ngôn ngữ tự nhiên hoặc dán link website chiến lược (ví dụ từ TradingView, Blogger, Medium, GitHub Gist, Docs), sau đó phân tích qua LLM để sinh cấu trúc JSON chiến lược và lưu vào thư viện [Observed: `779956509..._n.jpg` / UI_4.jpg].
    *   Hệ thống News Crawler tích hợp cơ chế tự động sinh template trích xuất tin tức từ HTML thô thông qua trợ giúp của LLM (LLM-assisted Extraction) có hỗ trợ quản lý lịch sử phiên bản template [Observed: UI_3.jpg].
    *   Tin tức thu thập hỗ trợ cơ chế tự phát hiện lỗi trích xuất vượt ngưỡng và tự động gọi LLM để sửa chữa và nâng cấp template (Self-healing extraction) [Observed: UI_3.jpg].
    *   Đồ thị hiển thị đồ họa chi tiết cho phép load tối thiểu 1000 nến lịch sử và hiển thị trạng thái kết nối Binance bao gồm độ trễ (latency) và thời gian dữ liệu cuối cùng khớp tick [Observed: UI_5.jpg].
    *   Hệ thống phân chia tài khoản sử dụng thành nhiều gói đăng ký dịch vụ (ví dụ gói hiện tại là "Pro Student" có ngày hết hạn cụ thể) [Observed: UI_1.jpg].

### 9.3. Nhóm thông tin Inferred (Suy luận logic - Không dùng làm Yêu cầu chính thức)
*   **Hạ tầng lưu trữ và Cơ sở dữ liệu**:
    *   *Suy luận*: Do database hiện tại chỉ có 20 GB dữ liệu nhưng hệ thống cần dự phòng kịch bản dữ liệu tăng lên 20 TB và 500 triệu thực nghiệm, hệ thống có thể cần áp dụng kiến trúc cơ sở dữ liệu phân tán, sharding dữ liệu theo mã coin/giao dịch hoặc lưu trữ nến lịch sử trên các Database chuyên dụng cho chuỗi thời gian (Time-series Database) thay vì lưu toàn bộ trong hệ quản trị cơ sở dữ liệu quan hệ MySQL truyền thống [Inferred từ: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Tình huống 5].
*   **Cơ chế phân tải và Chuyển phát tin nhắn**:
    *   *Suy luận*: Để đáp ứng kịch bản tải tăng trưởng 50.000 người dùng đồng thời, hệ thống chắc chắn phải triển khai cụm Load Balancer phân tải trước nhiều application server, đồng thời sử dụng giải pháp WebSocket kết hợp với các Message Broker phân tán (như Kafka, RabbitMQ hoặc giải pháp Redis Pub/Sub) để chuyển phát cập nhật thị trường thời gian thực đến đúng kết nối của từng người dùng [Inferred từ: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Tình huống 1].
*   **Băng thông truyền tải và Tải tĩnh**:
    *   *Suy luận*: Đối với dữ liệu tĩnh của hệ thống (HTML, CSS, JavaScript, logo, chart library) và bảng xếp hạng Leaderboard chung cho tất cả người dùng, việc đưa lên CDN (Content Delivery Network) cache tại các vùng biên (edge) trong một vài giây sẽ giúp giảm thiểu đáng kể băng thông truyền tải và giảm tải xử lý trực tiếp cho các application server chính [Inferred từ: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Tình huống 2].
*   **Cơ chế Cache và Invalid**:
    *   *Suy luận*: Với tần suất đọc Leaderboard lên tới 5.000 request/giây trong khi dữ liệu chỉ thay đổi khoảng 10 giây/lần, hệ thống cần triển khai tầng Cache lưu trữ trung gian (như Redis) nằm giữa Leaderboard API và Database để tăng tốc độ phản hồi và giảm tải truy vấn cho Database. Cache key có thể thiết kế theo định dạng `leaderboard:BTCUSDT:5m:top10` kèm thời gian sống (TTL) khoảng vài giây [Inferred từ: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Tình huống 3].
*   **Xử lý Backtest hàng loạt không đồng bộ**:
    *   *Suy luận*: Với kịch bản chạy tối ưu hóa strategy tìm kiếm sinh ra lượng ứng viên lớn (100.000 candidate strategies, mỗi backtest chạy mất khoảng 2 giây), API Backend không thể xử lý đồng bộ trực tiếp. Hệ thống bắt buộc phải đẩy các yêu cầu tối ưu hóa vào hàng đợi công việc (Message Queue), sau đó phân phát cho một cụm các tiến trình xử lý ngầm (Backtest Workers/Worker Pool) tiêu thụ và tính toán song song, đảm bảo tính co giãn độc lập giữa máy chủ web API và máy chủ xử lý tác vụ tính toán nặng [Inferred từ: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Tình huống 4].
*   **Xếp hạng chiến lược tổng hợp nâng cao**:
    *   *Suy luận*: Với các chiến lược nâng cao như SMC, Wyckoff hoặc các chỉ báo khối lượng nâng cao như ATR, Stochastic, hệ thống Strategy Engine có thể tích hợp chúng thông qua các cấu trúc dữ liệu mở rộng mà không làm thay đổi luồng xử lý tín hiệu BUY/SELL/HOLD chung của Engine [Inferred từ: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 3, Mục 11 & Trang 5, Mục 38].
