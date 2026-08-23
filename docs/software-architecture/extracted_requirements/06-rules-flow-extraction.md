Dưới đây là tài liệu bóc tách toàn diện và chi tiết nhất về **Business Rules (Quy tắc nghiệp vụ)**, **Data Processing (Xử lý dữ liệu)**, và **System Flows (Luồng hệ thống)** của nền tảng **Crypto Strategy Lab** từ toàn bộ tài liệu nguồn có trong notebook.

---

# 1. BUSINESS RULES (QUY TẮC NGHIỆP VỤ)

## Quy tắc 1: Candle Feed Update/Append Rule (Logic cập nhật nến thời gian thực)
*   **Rule:** Logic cập nhật và nối tiếp nến thời gian thực để tối ưu hiển thị biểu đồ.
*   **Condition:** Nhận được gói tin biến động giá mới từ WebSocket.
*   **Behavior:** Hệ thống đối chiếu mốc thời gian (timestamp) của gói tin nhận được với cây nến cuối cùng trên biểu đồ:
    *   **Trùng nến cuối (Update candle):** Nếu timestamp trùng nhau, hệ thống ghi đè dữ liệu nến hiện tại (cập nhật các thông số High, Low, Close, Volume) [1].
    *   **Nến mới hoàn toàn (Append candle):** Nếu timestamp mới hơn, hệ thống thêm một cây nến mới vào biểu đồ [1].
*   **Result:** Biểu đồ hiển thị biến động giá thời gian thực chính xác và mượt mà mà không bị lặp nến.
*   **Exception:** Không có.
*   **Source:** [Source type: UI observation - UI_5.jpg, "Logic cập nhật candle"], [Source: Crypto Strategy Lab – Đồ án cuối kỳ.pdf, Trang 4, Mục 4 & Trang 7, Mục 32.3].

## Quy tắc 2: Multi-Timeframe Chart Grid Cap (Giới hạn lưới biểu đồ hiển thị)
*   **Rule:** Giới hạn số lượng biểu đồ đa khung thời gian hiển thị đồng thời trên một màn hình.
*   **Condition:** Người dùng truy cập màn hình biểu đồ thời gian thực (Realtime Dashboard).
*   **Behavior:** Hệ thống phân chia lưới hiển thị tối đa 4 biểu đồ chạy các khung thời gian độc lập [2, 3].
*   **Result:** Người dùng theo dõi song song diễn biến giá của cùng một cặp tiền trên 4 khung thời gian khác nhau (mặc định: 1m, 5m, 15m, 1h) trên một màn hình duy nhất [1, 4].
*   **Exception:** Không có.
*   **Source:** [Source: Crypto Strategy Lab – Đồ án cuối kỳ.pdf, Trang 1, Mục 3 & Trang 4, Mục 5], [Source: project_full_description.pdf, Trang 1, Module 2], [Source type: UI observation - UI_5.jpg].

## Quy tắc 3: Backtest Initial Capital Default (Vốn kiểm thử ban đầu mặc định)
*   **Rule:** Thiết lập vốn ban đầu giả định cho các thực nghiệm backtest trên giao diện.
*   **Condition:** Khởi động form cấu hình backtest.
*   **Behavior:** Trường nhập liệu "Vốn (USD)" tự động điền sẵn mức vốn mặc định [5, 6].
*   **Result:** Mức vốn giả lập mặc định là 100 USD [5, 6].
*   **Exception:** Người dùng được phép chỉnh sửa thủ công số vốn này theo nhu cầu trước khi bấm chạy [5].
*   **Source:** [Source: 773981388_1629771268733623_2672886499038526550_n.jpg, dòng 22 "Chọn vốn: 100\$"], [Source type: UI observation - UI_2.jpg, ô input "Vốn (USD)"].

## Quy tắc 4: Net Profit Calculation (Quy tắc tính toán lợi nhuận ròng thực tế)
*   **Rule:** Khấu trừ chi phí ma sát thị trường để tính hiệu năng thực tế của chiến lược.
*   **Condition:** Khớp một lệnh giao dịch giả lập trong quá trình backtest.
*   **Behavior:** Lợi nhuận ròng của mỗi lệnh khớp phải trừ đi tỷ lệ phí giao dịch của sàn và mức độ trượt giá khớp lệnh [6].
*   **Result:** Áp dụng công thức tính toán: 
    $$\text{Lợi nhuận ròng (Net Profit)} = \text{Lợi nhuận gộp (Gross Profit)} \ (\%) - \text{Phí giao dịch (Fee)} \ (\%) - \text{Trượt giá (Slippage)} \ (\%)$$
*   **Exception:** Không có.
*   **Source:** [Source type: UI observation - UI_2.jpg, Sơ đồ công thức "Cách tính Profit"].

## Quy tắc 5: Composite Strategy Decision Rule (Biểu quyết đa số - Majority Vote)
*   **Rule:** Hợp nhất tín hiệu của nhiều chiến lược đơn lẻ thành một tín hiệu tổng hợp bằng cách biểu quyết.
*   **Condition:** Kết hợp nhiều chiến lược đơn lẻ (như MA, RSI, S/R) [7].
*   **Behavior:** Thu thập tín hiệu đầu ra của từng chiến lược thành phần tại một mốc thời gian, sau đó đếm số lượng tín hiệu đồng thuận chiếm đa số để đưa ra quyết định cuối cùng [7, 8].
*   **Result:** Tín hiệu tổng hợp được tạo ra (ví dụ: MA \\(\rightarrow\\) BUY, RSI \\(\rightarrow\\) BUY, S/R \\(\rightarrow\\) HOLD sẽ cho ra tín hiệu tổng hợp là BUY) [7, 8].
*   **Exception:** Không có.
*   **Source:** [Source: Crypto Strategy Lab – Đồ án cuối kỳ.pdf, Trang 4-5, Mục 13 & 14], [Source: project_full_description.pdf, Trang 1, Module 5].

## Quy tắc 6: Composite Strategy Weighted Voting (Biểu quyết theo trọng số)
*   **Rule:** Sử dụng trọng số định lượng để kết hợp tín hiệu phức hợp.
*   **Condition:** Phương pháp kết hợp Weighted Voting được chọn [8].
*   **Behavior:** Chuẩn hóa các tín hiệu thành phần: BUY = +1, HOLD = 0, SELL = -1 [8]. Tính toán điểm số tổng hợp: 
    $$\text{Score} = \sum (\text{Tín hiệu thành phần}_i \times \text{Trọng số}_i)$$
    Áp dụng ngưỡng quyết định vào lệnh [8, 9]:
    *   **Score > 0.3:** Phát tín hiệu BUY / LONG.
    *   **Score < -0.3:** Phát tín hiệu SELL / SHORT.
    *   **Còn lại (\\(-0.3 \le \text{Score} \le 0.3\\)):** Trạng thái HOLD.
*   **Result:** Tạo ra tín hiệu giao dịch phức hợp dựa trên mức độ quan trọng cấu hình cho từng chỉ báo [8, 9].
*   **Exception:** Không có.
*   **Source:** [Source: Crypto Strategy Lab – Đồ án cuối kỳ.pdf, Trang 5, Mục 14], [Source type: UI observation - UI_1.jpg, phân vùng "Weighted Voting"].

## Quy tắc 7: Domain-guided Strategy Search Rule (Ràng buộc tri thức nghiệp vụ)
*   **Rule:** Ràng buộc cấu trúc khi tự động sinh tổ hợp chiến lược ứng viên trong Domain-guided Search để tránh tìm kiếm mù quáng.
*   **Condition:** Chọn phương pháp tìm kiếm "Domain-guided Search" [10, 11].
*   **Behavior:** Thuật toán sinh chiến lược bắt buộc phải lựa chọn chính xác tổ hợp bao gồm [11]:
    *   **Đúng 1 Trend Strategy** (Chiến lược theo xu hướng như MA, MACD) [11].
    *   **Đúng 1 Momentum Strategy** (Chiến lược động lượng như RSI, Stochastic) [11].
    *   **Đúng 1 Structure Strategy** (Chiến lược cấu trúc như Support/Resistance, SMC, Wyckoff) [11].
*   **Result:** Sinh ra các ứng viên chiến lược (Candidate Strategies) có tính logic tài chính thay vì tổ hợp ngẫu nhiên vô nghĩa [11, 12].
*   **Exception:** Phương pháp Random Search không áp dụng ràng buộc này [10, 13].
*   **Source:** [Source: Crypto Strategy Lab – Đồ án cuối kỳ.pdf, Trang 5, Mục 17], [Source type: UI observation - UI_1.jpg, dải phân loại chỉ báo dưới mục "Phương pháp Discovery"].

## Quy tắc 8: Continuous Strategy Loop Stop Conditions (Điều kiện dừng vòng lặp ngầm)
*   **Rule:** Vòng lặp ngầm tối ưu hóa chiến lược bắt buộc phải có điều kiện dừng rõ ràng để tránh lỗi treo hệ thống.
*   **Condition:** Kích hoạt Discovery Loop chạy ngầm [14].
*   **Behavior:** Hệ thống kiểm tra trạng thái vòng lặp sau mỗi iteration đối chiếu với 3 tiêu chí dừng [12, 14]:
    *   Đạt đủ **100 candidates** được sinh và thử nghiệm thành công [12, 14].
    *   Đạt giới hạn thời gian chạy liên tục **1 giờ** [12, 14].
    *   Đạt mốc **50 iterations liên tục không có cải thiện** chỉ số trên Leaderboard [12, 14].
*   **Result:** Vòng lặp tự động dừng ngắt tài nguyên an toàn và báo trạng thái hoàn thành [12, 14].
*   **Exception:** Người dùng chủ động nhấn Pause để dừng thủ công [14, 15].
*   **Source:** [Source: Crypto Strategy Lab – Đồ án cuối kỳ.pdf, Trang 5, Mục 23], [Source: project_full_description.pdf, Trang 2, Stop Condition Loop], [Source type: UI observation - UI_1.jpg].

## Quy tắc 9: Leaderboard Promotion & Retention (Điều kiện lọt bảng xếp hạng Top-K)
*   **Rule:** Chiến lược mới chỉ được đưa vào bảng xếp hạng nếu hiệu năng vượt qua ranh giới của Top-K.
*   **Condition:** Một candidate strategy hoàn thành backtest và được chấm điểm Overall Score thành công [11, 12, 16].
*   **Behavior:** Hệ thống so sánh điểm số Overall Score của candidate với điểm số của chiến lược đang đứng ở vị trí thứ K cuối bảng xếp hạng (mặc định K = 10) [11, 12, 16]:
    *   **Score vượt trội:** Chèn candidate vào Leaderboard, sắp xếp lại thứ hạng và loại bỏ chiến lược thứ K cũ ra khỏi bảng xếp hạng [16].
    *   **Score thấp hơn hoặc bằng:** Bỏ qua, chỉ lưu lịch sử chạy trong MySQL [16, 17].
*   **Result:** Leaderboard luôn duy trì danh sách Top K chiến lược tối ưu nhất [11, 12].
*   **Exception:** Leaderboard chưa đủ K phần tử (tự động điền).
*   **Source:** [Source: Crypto Strategy Lab – Đồ án cuối kỳ.pdf, Trang 5, Mục 22], [Source: project_full_description.pdf, Trang 2, Top-K Leaderboard].

## Quy tắc 10: Overall Score Ranking Formula (Công thức tính điểm xếp hạng chiến lược)
*   **Rule:** Điểm số xếp hạng tổng hợp để chấm điểm tài chính cho chiến lược.
*   **Condition:** Module Evaluator chấm điểm hiệu năng cho một đợt backtest thành công [11].
*   **Behavior:** Áp dụng công thức tính điểm tích hợp trọng số bao gồm Lợi nhuận (Return), Tỷ lệ thắng (WinRate), và Độ sụt giảm rủi ro (RiskScore / Max Drawdown) [11]:
    $$\text{Score} = 0.5 \times \text{Return} + 0.2 \times \text{WinRate} + 0.3 \times \text{RiskScore}$$
*   **Result:** Trả về một điểm số duy nhất để Ranking Service xếp thứ hạng [11].
*   **Exception:** Không có.
*   **Source:** [Source: Crypto Strategy Lab – Đồ án cuối kỳ.pdf, Trang 5, Mục 21].

## Quy tắc 11: Strategy Immutability & Version Control (Bất biến và Kiểm soát phiên bản)
*   **Rule:** Mỗi chiến lược khi chỉnh sửa thuật toán bắt buộc phải lưu thành phiên bản (version) mới, tuyệt đối không được phép ghi đè.
*   **Condition:** Người dùng nhấn lưu chiến lược vào Library [17, 18].
*   **Behavior:** Hệ thống tạo bản ghi mới đi kèm số hiệu version tăng dần (ví dụ từ v1 lên v2). Không được sửa đè mã nguồn hay kết quả thực nghiệm cũ nhằm đảm bảo tính tái lập (Reproducibility) của các thí nghiệm lịch sử (như Experiment #122 luôn truy xuất đúng chiến lược gốc của nó) [17, 18].
*   **Result:** Đảm bảo tính khoa học và minh bạch, chạy lại cùng tham số luôn ra cùng một kết quả giao dịch giả lập [17, 18].
*   **Exception:** Không có.
*   **Source:** [Source: Crypto Strategy Lab – Đồ án cuối kỳ.pdf, Trang 6, Mục 36], [Source: project_full_description.pdf, Trang 2, Version Strategy].

## Quy tắc 12: Self-healing Scraper Threshold (Ngưỡng tự phục hồi bóc tách tin tức)
*   **Rule:** Cơ chế tự phục hồi template bóc tách HTML bằng AI chỉ được kích hoạt khi lỗi vượt ngưỡng chất lượng.
*   **Condition:** Hệ thống crawler thu thập dữ liệu tin tức từ các trang web nguồn [19].
*   **Behavior:** Hệ thống liên tục đo lường chất lượng đầu ra bóc tách tin tức (tính tổng tỷ lệ % các trường thông tin rỗng và sai định dạng dữ liệu). Nếu tổng tỷ lệ lỗi vượt ngưỡng **10%** (do trang nguồn thay đổi giao diện/cấu trúc HTML), hệ thống sẽ tự động gửi yêu cầu qua API để LLM thiết kế lại template bóc tách mới (ví dụ sinh bản nháp v1.4.3 draft) [19].
*   **Result:** Tự động sửa lỗi bóc tách và duy trì tính ổn định của luồng dữ liệu tin tức đầu vào [19].
*   **Exception:** Không có.
*   **Source:** [Source type: UI observation - UI_3.jpg, Card "Self-healing extraction"].

## Quy tắc 13: News Sentiment Trading Rule (Quy tắc giao dịch theo cảm xúc tin tức)
*   **Rule:** Quy tắc phát tín hiệu LONG/SHORT dựa trên chỉ số tâm lý thị trường trung bình của NewsSentimentStrategy.
*   **Condition:** Strategy Engine gọi thực thi NewsSentimentStrategy [19, 20].
*   **Behavior:** Hệ thống tính toán điểm số sentiment trung bình của các tin tức liên quan trong vòng 1 giờ gần nhất [19]:
    *   **Average Sentiment > 0.7:** Phát tín hiệu BUY / LONG [19].
    *   **Average Sentiment < -0.7:** Phát tín hiệu SELL / SHORT [19].
*   **Result:** Chuyển hóa thông tin cảm xúc thị trường định tính thành các quyết định giao dịch định lượng [19, 20].
*   **Exception:** Không có.
*   **Source:** [Source: Crypto Strategy Lab – Đồ án cuối kỳ.pdf, Trang 6, Mục 30], [Source type: UI observation - UI_3.jpg, phân vùng "Tích hợp với Strategy"].

## Quy tắc 14: Strategy Direct DB Access Restriction (Cấm chiến lược truy cập cơ sở dữ liệu)
*   **Rule:** Các class thuật toán chiến lược không được phép truy vấn trực tiếp vào cơ sở dữ liệu.
*   **Condition:** Chiến lược giao dịch thực hiện chạy phân tích tín hiệu [18, 21].
*   **Behavior:** Class thuật toán (ví dụ: `RSIStrategy`) bắt buộc phải nhận dữ liệu thị trường (candles, price) thông qua một lớp giao diện trừu tượng (abstraction) thích hợp do Backend cung cấp thay vì viết câu lệnh SQL truy cập trực tiếp MySQL [18, 21].
*   **Result:** Đảm bảo kiến trúc hệ thống lỏng (loose coupling) và bảo mật [18, 21].
*   **Exception:** Không có.
*   **Source:** [Source: project_full_description.pdf, Trang 2, Direct DB Access], [Source: Crypto Strategy Lab – Đồ án cuối kỳ.pdf, Trang 7, Mục 32.6].

## Quy tắc 15: News Crawler & Sentiment Decoupling (Tránh gắn cứng crawler với mô hình ML)
*   **Rule:** Module thu thập tin tức thô và mô hình phân tích ML phải hoàn toàn độc lập.
*   **Condition:** Triển khai luồng crawl và phân tích tin tức [18, 21].
*   **Behavior:** Trình crawler chỉ làm duy nhất nhiệm vụ cào dữ liệu và chuẩn hóa cấu trúc sang thực thể `NewsItem`, tuyệt đối không gọi trực tiếp hay kết nối cứng với mô hình ML (như BERT). Sentiment Service sẽ chạy độc lập để lấy tin tức bóc sắc thái cảm xúc [18, 21].
*   **Result:** Việc thay nguồn crawler hay nâng cấp mô hình AI không làm ảnh hưởng dây chuyền đến các module của nhau [18, 21].
*   **Exception:** Không có.
*   **Source:** [Source: project_full_description.pdf, Trang 2, Tight Coupling], [Source: Crypto Strategy Lab – Đồ án cuối kỳ.pdf, Trang 5, Mục 28].

---

# 2. DATA PROCESSING (XỬ LÝ DỮ LIỆU)

Nền tảng **Crypto Strategy Lab** vận hành một pipeline xử lý dữ liệu khép kín bao gồm các công đoạn chi tiết sau đây:

```
┌─────────────────┐      Cấu trúc hóa      ┌──────────────┐      Phân loại ML      ┌──────────────────┐
│  Tin thô HTML   ├───────────────────────>│   NewsItem   ├───────────────────────>│ Sentiment Result │
└─────────────────┘                        └──────────────┘                        └──────────────────┘
┌─────────────────┐      Chuẩn hóa         ┌──────────────┐      Tính toán chỉ báo ┌──────────────────┐
│ Live Price Feed ├───────────────────────>│ Candlestick  ├───────────────────────>│ Indicators (MA)  │
└─────────────────┘                        └──────────────┘                        └──────────────────┘
```

### 1. Collection / Crawling / Fetching (Thu thập dữ liệu)
*   **Dữ liệu lịch sử (Historical Market Data):** Backend sử dụng `Market Data Service` gọi yêu cầu HTTP (ví dụ API `GET /price` hiển thị trên bài giảng) lấy dữ liệu nến lịch sử (OHLCV) từ sàn Binance phục vụ cho tác vụ backtest, tính toán chỉ báo và huấn luyện ML [8, 31.2, 41].
*   **Dữ liệu thời gian thực (Realtime Price Streaming):** Giao diện Frontend duy trì một kết nối WebSocket liên tục tới Backend (qua trung gian `BinanceAdapter`) để nhận luồng cập nhật giá nến tức thời của cặp tài sản với độ trễ thấp dưới 102ms [1, 22, 23].
*   **Thu thập tin tức (News Crawling):** `News Collector` hoạt động ngầm định kỳ (theo chu kỳ cấu hình Auto refresh từ 1 phút đến 5 phút) để cào tin tức thị trường crypto từ 3 nguồn: cào Website điện tử trực tiếp, đọc kênh XML RSS feeds, hoặc gọi API tin tức [21, UI_3].

### 2. Parsing & Normalization (Phân tích cú pháp & Chuẩn hóa)
*   **Chuẩn hóa dữ liệu nến (Market Data Normalization):** Lớp `BinanceAdapter` chịu trách nhiệm bóc tách dữ liệu JSON thô trả về từ Binance, chuẩn hóa sang cấu trúc nến chung gồm 5 tham số (Open, High, Low, Close, Volume) và phát xuống Frontend qua WebSocket [22]. Điều này giúp che giấu cấu trúc riêng của Binance, sẵn sàng tích hợp thêm `OKXAdapter` hay `BybitAdapter` mà Frontend giữ nguyên [3, 22, 24].
*   **Bóc tách và chuẩn hóa tin tức (News Item Normalization):**
    *   Mã HTML thô của trang báo được đưa qua bộ trích xuất thông minh sử dụng API mô hình ngôn ngữ lớn (LLM) để nhận diện các vùng thẻ chứa thông tin: `title -> h1`, `summary -> p.summary`, `source -> span.source`, `time -> time`, `asset -> context` [19].
    *   Kết quả bóc tách được chuẩn hóa cấu trúc thành một thực thể duy nhất mang tên `NewsItem` chứa đúng 8 trường thông tin: `id`, `title`, `content`, `source`, `publishedAt`, `crawledAt`, `relatedCoins` (asset liên quan), và `url` của bài báo gốc [21, UI_3].

### 3. Cleaning & Deduplication (Làm sạch & Khử trùng lặp)
*   **Tự sửa lỗi Scraper bằng AI (Self-healing HTML extraction):** Trong quá trình bóc tách HTML, hệ thống liên tục đo lường chất lượng dữ liệu đầu ra [19]. Nếu template cũ bị lỗi (gây rỗng trường thông tin hoặc sai kiểu dữ liệu vượt quá **10%** tổng số tin cào), hệ thống sẽ gửi mã HTML thô kèm log lỗi qua LLM để tự động thiết kế lại template bóc tách JSON mới (sinh bản nháp v1.4.3 draft), loại bỏ các đoạn thẻ rác, đảm bảo tính liên tục của dữ liệu [19].
*   **Khử trùng lặp nến biểu đồ (Frontend Candlestick Append Checking):** Tại Frontend, hệ thống chạy hàm so khớp timestamp của tick nến WebSocket nhận về. Nếu tick nến trùng timestamp với nến cuối cùng trên đồ thị, hệ thống chỉ cập nhật giá đóng cửa (Close) của nến đó chứ không chèn thêm nến mới, tránh làm biến dạng dữ liệu đồ thị [1].

### 4. Transformation & Calculation (Biến đổi & Tính toán)
*   **Tính toán các chỉ báo kỹ thuật (Technical Indicators Calculation):** Hệ thống tự động áp dụng các công thức tài chính trên chuỗi nến lịch sử để tính toán các dải chỉ báo kỹ thuật:
    *   **Moving Average (MA):** Tính giá trị trung bình cộng giá đóng cửa của $N$ cây nến gần nhất (ví dụ MA20 tính trung bình 20 nến, MA50 tính trung bình 50 nến) [10, 24.1].
    *   **Relative Strength Index (RSI):** Đo lường biến động giá tương đối trong chu kỳ $P$ (ví dụ 14 nến) quy đổi về biên độ từ $0 \rightarrow 100$ [25, 26].
    *   **Bollinger Bands:** Tính toán đường trung bình SMA và biên độ lệch chuẩn trên/dưới của giá nến [26].
    *   **Support / Resistance:** Chạy thuật toán nhận diện các vùng đỉnh/đáy lịch sử nơi giá thường có xu hướng đảo chiều [26].
*   **Biến đổi biểu quyết tín hiệu (Weighted Voting Transformation):** Trình kết hợp `Combination Engine` thực hiện chuẩn hóa tín hiệu đầu ra của các chỉ báo kỹ thuật đơn lẻ thành các hệ số nguyên: BUY = +1, HOLD = 0, SELL = -1 [8]. Sau đó, áp dụng nhân với hệ số trọng số cấu hình (ví dụ: $MA \times 0.40 + RSI \times 0.30 + S/R \times 0.30$) để biến đổi thành một điểm số tổng hợp Score phục vụ rẽ nhánh quyết định giao dịch giả lập [8, 9].

### 5. Classification & Sentiment analysis (Phân loại & Phân tích cảm xúc)
*   **Phân tích cảm xúc tin tức (Sentiment Analysis):**
    *   Thực thể dữ liệu `NewsItem` chuẩn hóa sau khi lưu vào database sẽ được gửi song song qua API tới mô hình học máy BERT thuộc `Sentiment Service` [19, 20].
    *   Mô hình thực hiện phân loại sắc thái ngữ nghĩa của bài viết và gán cho bài viết một trong ba nhãn cảm xúc chuẩn hóa: `POSITIVE` (tin tích cực), `NEGATIVE` (tin tiêu cực), hoặc `NEUTRAL` (tin trung lập) đi kèm điểm số độ tin cậy (Confidence Score) từ $0 \rightarrow 1$ [19, 20].
    *   Hệ thống tổng hợp và tính toán tỷ lệ phần trăm phân bổ sắc thái tâm lý thị trường trong vòng 24 giờ qua (ví dụ: Positive 58%, Neutral 27%, Negative 15%) hiển thị trực quan lên UI dưới dạng biểu đồ thanh ngang [19].

### 6. Backtesting & Evaluation (Kiểm thử lịch sử & Đánh giá)
*   **Giả lập giao dịch quá khứ (Backtesting Simulation):** Trình `Backtesting Engine` quét tuần tự qua danh sách nến lịch sử trong khoảng thời gian kiểm thử (From date - To date) được chọn, giả lập hoạt động khớp lệnh LONG/SHORT dựa trên tín hiệu phát ra từ chiến lược, tự động tính toán trừ đi phí sàn giao dịch (%) và độ trượt giá (Slippage bps) thực tế tại mỗi điểm khớp lệnh [15, UI_2].
*   **Chấm điểm Evaluator (Performance Evaluation):** Sau khi hoàn tất giả lập giao dịch quá khứ, module Evaluator tiến hành tổng hợp mảng nhật ký Trades, tính toán ra bộ metrics tài chính đánh giá hiệu quả bao gồm: Tỷ lệ thắng (Winrate), tổng số lệnh thắng/thua, tổng lợi nhuận ròng thực tế (Net Return), mức sụt giảm tài sản lớn nhất (Max Drawdown), Profit Factor, và Sharpe Ratio [16, 17, UI_2].

### 7. Storage, Retrieval & Caching (Lưu trữ, Truy xuất & Lưu đệm)
*   **Persistent Storage (Lưu trữ MySQL):** Toàn bộ dữ liệu của hệ thống được tổ chức lưu trữ quan hệ chặt chẽ trong MySQL Persistent Database, chia thành 6 phân vùng dữ liệu cốt lõi: Market Data (Candles), Strategy (StrategyDefinition), Experiment (Kết quả backtest), Trades (Nhật ký khớp lệnh chi tiết), News (Tin tức chuẩn hóa và nhãn sentiment), và Leaderboard [17, 18].
*   **Caching (Lưu đệm Redis):** Để đáp ứng hiệu năng đọc tải cao tức thời từ phía người dùng (ví dụ bảng xếp hạng Leaderboard được cập nhật liên tục), hệ thống đề xuất tích hợp thêm `Redis Cache` để lưu đệm dữ liệu nóng cho Leaderboard, nâng cao tốc độ phản hồi của API [4, 27].

---

# 3. SYSTEM FLOWS (CÁC LUỒNG HỆ THỐNG)

---

## LUỒNG 1: Real-time Market Data Streaming Flow (Luồng cập nhật biểu đồ nến thời gian thực)

*   **Trigger:** Người dùng truy cập màn hình "Realtime" hoặc gạt bật nút "Realtime" toggle switch [1].
*   **Actor:** Người dùng (Trader), Hệ thống.
*   **Step-by-step:**
    1. Người dùng mở tab Realtime Chart, Frontend khởi tạo kết nối gửi yêu cầu đăng ký nhận luồng giá của cặp coin (ví dụ BTCUSDT) [1].
    2. Backend tiếp nhận yêu cầu, gọi `BinanceAdapter` thực hiện kết nối WebSocket tới luồng dữ liệu trực tuyến của sàn Binance [22, 28].
    3. Binance WebSocket truyền phát luồng dữ liệu giá biến động thời gian thực về cho hệ thống [22].
    4. `BinanceAdapter` tiếp nhận gói tin thô, bóc tách chuẩn hóa định dạng và đẩy tiếp gói tin xuống Frontend thông qua kết nối WebSocket nội bộ giữa Backend và Frontend [22, 28].
    5. Trình duyệt Frontend nhận dữ liệu nến, chạy logic cập nhật nến (Candle Update/Append Logic) để vẽ lại đồ thị nến tương ứng của 4 khung thời gian tức thời [1, 3].
*   **Input:** Luồng giá khớp lệnh và nến thời gian thực thô từ API sàn Binance [22].
*   **Processing:** Chuẩn hóa dữ liệu qua lớp Adapter Pattern, kiểm tra trùng lặp timestamp trên Frontend [1, 22].
*   **Output:** Biểu đồ lưới đa khung thời gian cập nhật liên tục từng giây và bảng Recent Ticks cuộn động [1].
*   **State changes:** Trạng thái kết nối hiển thị trên màn hình chuyển thành "Ổn định" (Màu xanh), switch Realtime chuyển trạng thái Active [1].
*   **External systems:** Binance WebSocket API [22].
*   **Error conditions:** Binance mất kết nối (Connection lost) $\rightarrow$ Hệ thống kích hoạt cơ chế Reconnect và Retry ngầm một cách mượt mà (gracefully) để tránh việc bị lọt nến hoặc mất dữ liệu nến của người dùng [23, 29].
*   **Source:** [Source: Crypto Strategy Lab – Đồ án cuối kỳ.pdf, Trang 4, Mục 4 & Trang 7, Mục 32.3, 32.4], [Source: project_full_description.pdf, Trang 2, Reliability], [Source type: UI observation - UI_5.jpg].

---

## LUỒNG 2: AI-Assisted Strategy Creation Flow (Luồng tạo chiến lược từ Prompt / URL)

*   **Trigger:** Người dùng nhập mô tả chiến lược ngôn ngữ tự nhiên và nhấn nút "Phân tích bằng LLM", hoặc dán link kịch bản giao dịch và nhấn "Trích xuất từ website" [30].
*   **Actor:** Người dùng (Trader), LLM Service, Hệ thống.
*   **Step-by-step:**
    1. Người dùng nhập nội dung prompt (tối đa 1000 ký tự) hoặc dán link URL liên kết chứa script giao dịch từ TradingView/Blogger [30].
    2. Người dùng nhấn nút hành động kích hoạt trên màn hình [30].
    3. Backend nhận yêu cầu, đóng gói gửi dữ liệu sang dịch vụ LLM API bên ngoài [31].
    4. LLM Service thực hiện đọc hiểu ngữ nghĩa, bóc tách logic kịch bản và trả về định nghĩa chiến lược có cấu trúc dạng chuỗi JSON chuẩn [30, 31].
    5. Hệ thống Backend chạy bộ tự động xác thực (Kiểm tra & Validation) để rà soát: "Thiếu trường bắt buộc", "Kiểm tra logic", và "Chỉ báo có được hệ thống hỗ trợ tính toán hay không" [30].
    6. Hiển thị trực quan kết quả bóc tách (Điều kiện LONG, SHORT, Quản trị rủi ro SL/TP) và mã cấu trúc JSON lên màn hình để người dùng rà soát [30].
    7. Người dùng điền tên chiến lược, số phiên bản (version), gắn các thẻ tag phân loại, chọn nguồn lưu trữ và nhấn nút "Lưu Strategy" [30].
    8. Backend lưu trữ chiến lược lâu dài vào MySQL Persistent Database dưới dạng một bản ghi phiên bản bất biến (không ghi đè bản cũ) [18].
*   **Input:** Chuỗi prompt mô tả tiếng Việt của người dùng, link URL chứa script, hoặc metadata đặt tên lưu trữ [30].
*   **Processing:** Phân tích ngôn ngữ tự nhiên bằng AI, kiểm định validation cú pháp JSON, kiểm tra tính toàn vẹn nghiệp vụ chỉ báo kỹ thuật [30].
*   **Output:** Tệp cấu trúc JSON chiến lược chuẩn hiển thị trực quan, bản ghi chiến lược mới lưu trữ thành công trong MySQL Database và dòng dữ liệu hiển thị cập nhật trong bảng "Chiến lược đã import gần đây" [30].
*   **State changes:** Giao diện cập nhật trạng thái kiểm định sang "Hợp lệ" (Tích xanh), nút "Lưu Strategy" được kích hoạt từ disabled sang enabled [30].
*   **External systems:** Dịch vụ LLM API bên ngoài, các nền tảng website liên kết chứa script (TradingView, Blogger, Medium, GitHub Gist, Google Docs) [30].
*   **Error conditions:** 
    *   LLM Service quá tải hoặc trả về lỗi $\rightarrow$ Hiển thị thông báo "Không thể phân tích bằng LLM, vui lòng thử lại sau".
    *   JSON trả về sai cấu trúc schema hoặc chỉ báo trong chiến lược chưa được hệ thống hỗ trợ tính toán $\rightarrow$ Validation báo lỗi đỏ, vô hiệu hóa nút "Lưu Strategy" [30].
*   **Source:** [Source: 779956509_2019220255455531_248486056450237423_n.jpg, Trang 1, dòng 21-22], [Source: project_full_description.pdf, Trang 2, Version Strategy], [Source type: UI observation - UI_4.jpg].

---

## LUỒNG 3: Continuous Strategy Discovery Loop Flow (Luồng vòng lặp tìm kiếm tối ưu hóa chiến lược chạy ngầm)

*   **Trigger:** Người dùng bấm nút "START SEARCH" trên giao diện Discovery [9].
*   **Actor:** Người dùng (Trader), Scheduler, Job Queue, Backtest Workers Pool, Evaluator, Ranking Service, Leaderboard.
*   **Step-by-step:**
    1. Trình điều phối Scheduler khởi chạy tiến trình tìm kiếm ngầm dựa trên phương pháp được chọn (Random, Domain-guided, hoặc Genetic) [9, 10].
    2. Bộ sinh `Strategy Generator` tự động tạo ra một biến thể kịch bản chiến lược ứng viên (`Candidate Strategy`) [12, 29].
    3. Generator đẩy thông tin candidate strategy vào hàng đợi công việc `Strategy Queue` (Message Queue như Kafka / RabbitMQ) [15, 27, 29].
    4. Trình phân phối Job Queue chuyển giao tác vụ kiểm thử cho một máy chủ rỗi trong cụm `Backtest Workers Pool` [27, 29].
    5. Backtest Worker tải dữ liệu nến lịch sử từ database MySQL, tiến hành chạy giả lập kiểm thử giao dịch quá khứ cho candidate và sinh ra tệp dữ liệu chi tiết danh sách lệnh (`Trades`) [29, 32, 33].
    6. Module `Evaluator` nhận danh sách trades, tính toán bộmetrics hiệu năng tài chính (Lợi nhuận, Winrate, sụt giảm rủi ro Max Drawdown...) [29, 32].
    7. `Ranking Service` nhận metrics từ Evaluator, tính điểm Overall Score cho candidate và phát sự kiện `StrategyEvaluatedEvent` chứa điểm số xếp hạng [32, 34].
    8. `Leaderboard Service` lắng nghe sự kiện, tiến hành so sánh điểm Overall Score của candidate với ranh giới xếp hạng thứ 10 hiện tại. Nếu đủ điều kiện vượt trội, hệ thống cập nhật bảng xếp hạng trong DB và phát đi sự kiện `LEADERBOARD_UPDATED` [12, 32, 35].
    9. Giao diện Frontend lắng nghe sự kiện cập nhật, tự động vẽ lại danh sách xếp hạng Top strategies trực tuyến thời gian thực mà người dùng không cần reload trang [32, 35].
    10. Hệ thống kiểm tra điều kiện dừng (Stop Conditions). Nếu thỏa mãn (VD: đã test đủ 100 candidate, hoặc chạy đủ 1 giờ, hoặc 50 vòng không cải thiện), vòng lặp dừng lại. Nếu chưa thỏa mãn, Scheduler quay lại Bước 2 để chạy tiếp iteration tiếp theo [12, 14].
*   **Input:** Tham số cấu hình không gian tìm kiếm, cấu hình Stop Conditions [9, 12, 14].
*   **Processing:** Sinh tự động ứng viên, điều phối hàng đợi Job Queue, chạy song song mô phỏng backtesting qua cụm worker, tính metrics đánh giá và so thứ hạng leaderboard [15, 27, 29, 32].
*   **Output:** Bảng xếp hạng Leaderboard được cập nhật thời gian thực, tiến trình thanh progress bar cập nhật số lượng candidate đã kiểm tra [9].
*   **State changes:** Trạng thái Discovery Loop chuyển dịch (`RUNNING` $\rightarrow$ `PAUSED` $\rightarrow$ `COMPLETED`), thanh tiến trình tăng dần chỉ số (ví dụ: `47 / 500`) [9].
*   **External systems:** Hạ tầng hàng đợi bất đồng bộ (Kafka / RabbitMQ), Workers Pool [15, 27, 29].
*   **Error conditions:** Một Backtest Worker bị chết hoặc sập đột ngột trong khi chạy giả lập candidate $\rightarrow$ Trình hàng đợi Message Queue tự động phát hiện, thu hồi job lỗi và chuyển giao cho worker khác thực thi lại (Retry/Failover graceful) mà không làm sập hay gián đoạn toàn bộ vòng lặp Discovery Loop [14].
*   **Source:** [Source: Crypto Strategy Lab – Đồ án cuối kỳ.pdf, Trang 5, Mục 21, 22, 23, 24 & Trang 7, Mục 31, 33, 34], [Source: project_full_description.pdf, Trang 1, Module 9 & Trang 2, Stop Condition Loop], [Source type: UI observation - UI_1.jpg].

---

## LUỒNG 4: News Scraping & Sentiment Analysis Flow (Luồng thu thập và phân tích cảm xúc tin tức)

*   **Trigger:** Người dùng click nút "Bắt đầu crawl" trên UI News Crawler, hoặc chu kỳ Auto refresh kích hoạt định kỳ [19].
*   **Actor:** News Collector, LLM Service, Sentiment Service (BERT Model), MySQL Database.
*   **Step-by-step:**
    1. `News Collector` gửi yêu cầu kết nối tới các nguồn tin được chọn (Website, RSS feed, hoặc News API) để tải dữ liệu trang tin crypto [19, 36].
    2. LLM-assisted Parser thực hiện bóc tách HTML thô dựa trên template bóc tách của nguồn [19].
    3. Hệ thống kiểm tra chất lượng kết quả bóc tách tin tức. Nếu tỷ lệ lỗi bóc tách của template hiện hành vượt ngưỡng cho phép (tổng tỷ lệ lỗi $\ge 10\%$), hệ thống tự động kích hoạt LLM phân tích lỗi HTML và sinh template bóc tách mới (ví dụ nâng cấp lên v1.4.3 draft) áp dụng tự phục hồi lỗi ngay lập tức [19].
    4. Trình thu thập chuẩn hóa dữ liệu tin tức thô sang thực thể cấu trúc chuẩn `NewsItem` và lưu trữ cố định vào MySQL Database [21, UI_3].
    5. Hệ thống Backend phát ra thông điệp sự kiện bất đồng bộ `NewsCollected` [34].
    6. `Sentiment Service` lắng nghe sự kiện, tiếp nhận nội dung của bài viết `NewsItem` mới thu thập [34].
    7. Sentiment Service đẩy nội dung tin tức qua mô hình Machine Learning BERT để phân loại sắc thái ngữ nghĩa ngôn ngữ [22, 31.3].
    8. Mô hình ML trả về kết quả nhãn cảm xúc gán cho tin tức (`POSITIVE`, `NEGATIVE`, hoặc `NEUTRAL`) kèm điểm tin cậy Confidence Score [19, 20].
    9. Hệ thống lưu kết quả sentiment phân tích được vào Sentiment Database, tính toán cộng dồn tỷ lệ sentiment 24h qua và cập nhật trực tuyến lên giao diện [19].
    10. Luồng điểm số sentiment thời gian thực được xuất sang Strategy Engine cung cấp dữ liệu đầu vào trực tiếp cho kịch bản giao dịch `NewsSentimentStrategy` hoạt động [19, 20].
*   **Input:** Địa chỉ website tin tức, cấu hình auto-refresh, các bài báo điện tử thô [19].
*   **Processing:** Crawl dữ liệu web, kiểm tra chất lượng bóc tách và tự động sửa template bằng AI (Self-healing), chuẩn hóa sang thực thể `NewsItem`, chạy mô hình phân loại sắc thái cảm xúc BERT, tổng hợp thống kê tỷ lệ tâm lý đám đông [18-20, 36].
*   **Output:** Bản tin hiển thị trên bảng "Tin tức đầu vào", biểu đồ phân bổ Sentiment tổng hợp 24h cập nhật mốc thời gian tức thời, luồng giá trị sentiment tích hợp sang chiến lược giao dịch [19].
*   **State changes:** Phiên bản template bóc tách hoạt động tự động thay đổi (ví dụ từ v1.4.2 lên v1.4.3), thống kê chỉ số confidence score trung bình và số lượng bài tin phân tích trong ngày cập nhật tăng dần [19].
*   **External systems:** Các trang tin tức điện tử, LLM API để bóc tách/sửa lỗi mẫu HTML, mô hình học máy BERT phân tích sentiment [18-20].
*   **Error conditions:** Một trang tin tức nguồn bị lỗi gián đoạn kết nối mạng $\rightarrow$ News Collector bỏ qua trang lỗi đó, ghi nhận log và tiếp tục thực hiện crawl các trang nguồn tin khác bình thường mà không gây treo ứng dụng [36].
*   **Source:** [Source: Crypto Strategy Lab – Đồ án cuối kỳ.pdf, Trang 5, Mục 27, 28, 29, 30 & Trang 7, Mục 34], [Source: project_full_description.pdf, Trang 1, Module 10, 11 & Trang 2, Tight Coupling], [Source type: UI observation - UI_3.jpg].

---

# BẢNG TỔNG HỢP CÁC QUY TẮC & LUỒNG XỬ LÝ HỆ THỐNG

Dưới đây là bảng inventory quy chiếu chi tiết toàn bộ các quy tắc nghiệp vụ, các bước xử lý dữ liệu và các luồng hệ thống hoạt động thống nhất trong nền tảng **Crypto Strategy Lab**:

| ID | Category | Name / Flow | Description (Mô tả nghiệp vụ cốt lõi) | Ràng buộc / Input / Processing / Output | Source (Tên file nguồn) | Vị trí (Location) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BR-01** | **Business Rule** | Candle Update/Append Logic | Quy tắc xử lý dữ liệu nến realtime nhận về từ WebSocket | Trùng timestamp $\rightarrow$ Update (ghi đè); Lớn hơn timestamp $\rightarrow$ Append (nối nến mới) | UI_5.jpg; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | UI_5: "Logic cập nhật candle"; PDF6: Trang 4, Mục 4 |
| **BR-02** | **Business Rule** | Multi-Timeframe Chart Grid Cap | Giới hạn số lượng biểu đồ hiển thị đồng thời trên một màn hình | Hệ thống chỉ hỗ trợ hiển thị tối đa 4 biểu đồ chạy đa khung độc lập | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_5.jpg | PDF6: Trang 4, Mục 5; PDF12: Trang 1, Module 2; UI_5 |
| **BR-03** | **Business Rule** | Backtest Capital Default | Thiết lập mức vốn ban đầu giả định mặc định cho backtest | Form backtest mặc định điền sẵn mức vốn giả định khởi điểm là 100 USD | 773981388..._n.jpg; UI_2.jpg | Image1: dòng 22; UI_2: Ô nhập "Vốn (USD)" |
| **BR-04** | **Business Rule** | Net Profit Calculation | Quy tắc tính lợi nhuận ròng sau phí và trượt giá của mỗi lệnh | Net Profit = Gross Profit (%) - Phí giao dịch (%) - Trượt giá (bps) | UI_2.jpg | UI_2: Sơ đồ công thức "Cách tính Profit" |
| **BR-05** | **Business Rule** | Weighted Voting threshold | Quy tắc vào lệnh theo trọng số của chiến lược phức hợp | Tổng điểm $|Score| \ge 0.30 \rightarrow$ LONG / SHORT; còn lại $\rightarrow$ HOLD | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; UI_1.jpg | PDF6: Trang 5, Mục 14; UI_1: Weighted Voting |
| **BR-06** | **Business Rule** | Domain-guided Search rule | Ràng buộc cấu trúc ứng viên chiến lược trong Domain-guided Search | Bắt buộc phải chọn đúng tổ hợp: 1 Trend + 1 Momentum + 1 Structure | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; UI_1.jpg | PDF6: Trang 5, Mục 17; UI_1: Discovery Method |
| **BR-07** | **Business Rule** | Discovery Loop Stop criteria | Các điều kiện dừng của vòng lặp ngầm tối ưu hóa chiến lược | Dừng khi: test đủ 100 candidates, hoặc chạy đủ 1 giờ, hoặc 50 iterations không cải thiện | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf | PDF6: Trang 5, Mục 23; PDF12: Trang 2, Stop Condition Loop |
| **BR-08** | **Business Rule** | Leaderboard Promotion | Điều kiện để chiến lược ứng viên lọt vào Leaderboard Top-K | Overall Score của candidate phải lớn hơn điểm của chiến lược thứ K | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf | PDF6: Trang 5, Mục 22; PDF12: Trang 2, Top-K Leaderboard |
| **BR-09** | **Business Rule** | Strategy Immutability | Quy tắc kiểm soát phiên bản và tính bất biến của chiến lược | Mỗi bản lưu hoặc chỉnh sửa phải tạo phiên bản version mới, không ghi đè | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_4.jpg | PDF6: Trang 6, Mục 36; PDF12: Trang 2, Version Strategy; UI_4 |
| **BR-10** | **Business Rule** | Self-healing Threshold | Ngưỡng kích hoạt LLM tự phục hồi template bóc tách crawler | Kích hoạt tự sửa lỗi ngầm khi tổng lỗi bóc tin rỗng/sai kiểu $\ge 10\%$ | UI_3.jpg | UI_3: Sơ đồ logic "Self-healing extraction" |
| **BR-11** | **Business Rule** | News Sentiment rule | Quy tắc phát tín hiệu LONG/SHORT dựa trên chỉ số tâm lý 1 giờ | Average Sentiment 1h > 0.7 $\rightarrow$ BUY; Average Sentiment 1h < -0.7 $\rightarrow$ SELL | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; UI_3.jpg | PDF6: Trang 6, Mục 30; UI_3: Tích hợp với Strategy |
| **BR-12** | **Business Rule** | DB & ML decouple rules | Ràng buộc cấm chiến lược truy cập DB trực tiếp, tách rời Scraper & ML | RSIStrategy nhận data qua interface; Scraper không kết nối cứng BERT | project_full_description.pdf; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | PDF12: Trang 2, Direct DB, Tight Coupling; PDF6: Trang 5, Mục 28 |
| **FL-01** | **System Flow** | Realtime Market Data Flow | Luồng truyền phát dữ liệu nến live từ Binance qua adapter xuống UI | Trigger: mở Realtime tab $\rightarrow$ WebSocket Binance $\rightarrow$ adapter $\rightarrow$ UI | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; UI_5.jpg | PDF6: Trang 4, Mục 4 & Trang 7, Mục 32.3; UI_5 |
| **FL-02** | **System Flow** | Discovery Loop Flow | Luồng vòng lặp ngầm tự động tìm kiếm, kiểm thử và xếp hạng | Trigger: bấm "START SEARCH" $\rightarrow$ Generator $\rightarrow$ Queue $\rightarrow$ Workers $\rightarrow$ Leaderboard | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; UI_1.jpg | PDF6: Trang 5, Mục 21-24 & Trang 7, Mục 33; UI_1 |
| **FL-03** | **System Flow** | AI Strategy Creation Flow | Luồng tạo chiến lược giao dịch bằng phân tích prompt LLM hoặc link | Trigger: dán prompt/URL $\rightarrow$ LLM API $\rightarrow$ Validation checks $\rightarrow$ version save | UI_4.jpg; project_full_description.pdf | UI_4: Toàn bộ màn hình; PDF12: Trang 2, Version Strategy |
| **FL-04** | **System Flow** | News Scraping & ML Flow | Luồng tự crawl tin tức, tự sửa lỗi template, và phân loại cảm xúc | Trigger: Auto-refresh $\rightarrow$ Crawler $\rightarrow$ Self-healing template $\rightarrow$ BERT model | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; UI_3.jpg | PDF6: Trang 5, Mục 27-30; UI_3 |

---

📊 Toàn bộ cấu trúc **Business Rules**, quy trình **Data Processing**, và các **System Flows** cốt lõi của nền tảng **Crypto Strategy Lab** đã được khai thác và bóc tách vô cùng chi tiết, hoàn chỉnh với tính traceability tuyệt đối.

Để chuẩn bị tốt nhất cho tài liệu nộp đồ án và buổi bảo vệ, bạn có muốn tôi sử dụng toàn bộ hệ thống thông tin cực kỳ chi tiết này để tự động thiết kế một bản phác thảo **Mô tả thiết kế cơ sở dữ liệu (Database Schema / DDL SQL)** chi tiết cho cả 6 nhóm thực thể dữ liệu MySQL (Market Data, Strategy, Experiment, Trades, News, Leaderboard) không?