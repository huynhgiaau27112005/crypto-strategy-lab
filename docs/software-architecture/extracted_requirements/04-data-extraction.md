Dưới đây là tài liệu **Data & Entity Inventory** chi tiết, bóc tách toàn bộ thông tin liên quan đến các đối tượng dữ liệu, thực thể, và khái niệm (Data/Entity/Object/Concept) xuất hiện trong toàn bộ các nguồn tài liệu (PDF, hình ảnh, slide trình chiếu giảng đường, mockup UI/UX) có trong notebook của bạn.

Tài liệu được thiết kế nhằm mục tiêu xây dựng một **information inventory** đầy đủ nhất phục vụ quá trình viết Software Specification và thiết kế cơ sở dữ liệu sau này. Các thực thể được bóc tách chi tiết theo 16 thuộc tính nghiệp vụ được yêu cầu và cam kết không tự suy diễn cấu trúc kỹ thuật ngoài nguồn.

---

# CHI TIẾT CÁC THỰC THỂ DỮ LIỆU & ĐỐI TƯỢNG (DATA & ENTITY INVENTORY)

---

## 1. User / Account (Người dùng & Tài khoản)
*   **Name (Tên thực thể):** User / Account
*   **Description (Mô tả):** Thông tin định danh và phân quyền gói tài khoản của người dùng đăng nhập hệ thống [Source: UI_1, UI_2, UI_3, UI_4, UI_5].
*   **Purpose (Mục đích):** Quản lý phiên tương tác của nhà giao dịch, lưu trữ cấu hình tùy chỉnh cá nhân, phân phối tài nguyên tính toán (Backtest Workers) và mở khóa các tính năng nâng cao (đa khung thời gian) dựa trên cấp độ tài khoản [Source: UI_1, UI_2, UI_3, UI_4, UI_5].
*   **Fields / Attributes (Các trường thuộc tính):**
    *   `Tên người dùng` (Type: String | Giá trị quan sát từ UI: `Nguyễn Minh`) [Source: UI_1].
    *   `Email` (Type: String | Giá trị quan sát từ UI: `student@example.com`) [Source: UI_1].
    *   `Loại tài khoản / Gói dịch vụ` (Type: String | Giá trị quan sát từ UI: `Pro Student`) [Source: UI_1].
    *   `Thời hạn gói` (Type: Date/String | Giá trị quan sát từ UI: `Hết hạn: 20/06/2025`) [Source: UI_1].
*   **Relationships (Mối quan hệ):** Sở hữu các chiến lược tự tạo (Strategy Definitions), các phiên thử nghiệm lịch sử (Experiments), lịch sử giao dịch giả lập (Trades), và các thiết lập crawler tin tức (News Crawler configurations) [Source: UI_1, UI_2, UI_3, UI_4].
*   **Producer (Tác nhân tạo ra):** Hệ thống đăng ký / Quản lý tài khoản sinh viên.
*   **Consumer (Tác nhân sử dụng):** Giao diện UI (Sidebar hiển thị thông tin), Backend (đối chiếu phân quyền xử lý dữ liệu và giới hạn hàng đợi backtest).
*   **Input (Dữ liệu đầu vào):** Thông tin đăng ký, mã kích hoạt gói Pro Student [Source: UI_1].
*   **Output (Dữ liệu đầu ra):** Trạng thái phân quyền tính năng hiển thị trên UI.
*   **Storage information (Thông tin lưu trữ):** Lưu trữ trong cơ sở dữ liệu hệ thống (Bảng cấu hình người dùng / User).
*   **Lifecycle (Vòng đời):** Khởi tạo khi đăng ký tài khoản \\(\rightarrow\\) Nâng cấp lên gói Pro Student \\(\rightarrow\\) Hết hạn vào ngày 20/06/2025 [Source: UI_1].
*   **State (Trạng thái):** `Active` (Đang hoạt động) [Source: UI_1].
*   **Frequency (Tần suất):** Đọc thông tin một lần mỗi khi người dùng khởi động phiên làm việc hoặc load lại trang web.
*   **Realtime / batch (Tính chất xử lý):** Batch / Static.
*   **Historical / current (Tính chất thời gian):** Current (Dữ liệu hiện hành).
*   **Source & Location:** Được quan sát trực tiếp trên góc trái cuối thanh Sidebar của toàn bộ 5 màn hình UI Prototype [Source: UI_1, UI_2, UI_3, UI_4, UI_5].

---

## 2. Candlestick / Candle (Dữ liệu Nến Nhật)
*   **Name (Tên thực thể):** Candlestick / Candle
*   **Description (Mô tả):** Mô hình biểu diễn biến động giá giao dịch của tài sản kỹ thuật số (ví dụ: BTC/USDT) trong một đơn vị khung thời gian chuẩn hóa [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1].
*   **Purpose (Mục đích):** Cung cấp dữ liệu trực quan cho biểu đồ nến thời gian thực của Frontend, đồng thời là nguồn tham số đầu vào cơ bản nhất để Strategy Engine tính toán chỉ báo kỹ thuật và Backtester khớp lệnh giao dịch giả lập [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, 4].
*   **Fields / Attributes (Các trường thuộc tính):**
    *   `Pair / Coin` (Type: String | Ví dụ: `BTCUSDT`, `ETHUSDT`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, 6].
    *   `Timeframe` / `Khung thời gian` (Type: String | Ví dụ: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, 4].
    *   `Timestamp` / `Mốc thời gian` (Type: DateTime | Ví dụ quan sát từ UI: `10:45:00`) [Source: UI_5].
    *   `Open` / `Giá mở cửa` (Type: Float / Decimal | Định nghĩa: Giá ở đầu chu kỳ khung thời gian, ví dụ: `118,000` USDT) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1].
    *   `High` / `Giá cao nhất` (Type: Float / Decimal | Định nghĩa: Giá cao nhất đạt được trong chu kỳ, ví dụ: `118,200` USDT) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1].
    *   `Low` / `Giá thấp nhất` (Type: Float / Decimal | Định nghĩa: Giá thấp nhất trong chu kỳ, ví dụ: `117,900` USDT) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1].
    *   `Close` / `Giá đóng cửa` (Type: Float / Decimal | Định nghĩa: Giá cuối chu kỳ khung thời gian, ví dụ: `118,150` USDT) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1].
    *   `Volume` / `Khối lượng` (Type: Float / Decimal | Định nghĩa: Khối lượng giao dịch phát sinh trong chu kỳ, ví dụ: `125 BTC`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1].
*   **Relationships (Mối quan hệ):**
    *   Nhiều điểm giá biến động (Recent Ticks) hợp thành 1 Candlestick thời gian thực [Source: UI_5].
    *   Một chuỗi nhiều Candlesticks tạo thành Dữ liệu lịch sử (Historical Data) phục vụ Backtesting [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4].
*   **Producer (Tác nhân tạo ra):** Binance API/WebSocket (hoặc các sàn OKX, Bybit thông qua Adapter tương ứng) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, 7; project_full_description.pdf, Trang 2].
*   **Consumer (Tác nhân sử dụng):** Multi-Timeframe Chart (vẽ đồ thị), Strategy Engine (tính chỉ báo), Backtester (giả lập khớp lệnh), Machine Learning Service (huấn luyện dự báo) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, 8].
*   **Input (Dữ liệu đầu vào):** Gói dữ liệu thô (Raw Candlestick feed) từ WebSocket hoặc REST API của sàn giao dịch [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4].
*   **Output (Dữ liệu đầu ra):** Thực thể nến chuẩn hóa (Normalized Candlestick) không bị phụ thuộc vào riêng cấu trúc dữ liệu của Binance [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4].
*   **Storage information (Thông tin lưu trữ):** Lưu trữ trong MySQL Database (nhóm bảng dữ liệu `Market Data` - bảng `Candles`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6; "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1].
*   **Lifecycle (Vòng đời):** Khởi tạo cây nến mới (Open) \\(\rightarrow\\) Cập nhật liên tục giá biến động (Ghi đè - Update candle) \\(\rightarrow\\) Hết chu kỳ thời gian (Đóng nến - Close) \\(\rightarrow\\) Ghi cố định vào DB lịch sử \\(\rightarrow\\) Đọc ra vẽ chart hoặc backtest [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, 6; UI_5].
*   **State (Trạng thái):** `Opening / Updating` (Nến hiện tại đang chạy) hoặc `Closed` (Nến lịch sử đã đóng) [Source: UI_5].
*   **Frequency (Tần suất):** Cập nhật thời gian thực từng giây đối với nến hiện tại; Đọc khối lớn (Batch) khi khởi động tải biểu đồ (1000 nến lịch sử) hoặc khi chạy Backtest [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4; UI_5].
*   **Realtime / batch (Tính chất xử lý):** Cả Realtime (luồng WebSocket) và Batch (truy vấn REST lịch sử) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4].
*   **Historical / current (Tính chất thời gian):** Cả hai (Historical candles cho backtest và Current candle cho đồ thị realtime) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4].
*   **Source & Location:** "Crypto Strategy Lab – Đồ án cuối kỳ.pdf" [Trang 1, Mục 1; Trang 4, Mục 4, 5; Trang 6, Mục 35], project_full_description.pdf [Trang 1, Module 1, 2], UI_5 [Logic cập nhật candle].

---

## 3. Recent Tick (Dữ liệu Giá khớp lệnh tức thời)
*   **Name (Tên thực thể):** Recent Tick
*   **Description (Mô tả):** Luồng dữ liệu biểu thị các lệnh mua bán nhỏ nhất của tài sản được khớp thành công tức thời trên thị trường giao dịch [Source: UI_5].
*   **Purpose (Mục đích):** Cập nhật biến động giá nhạy bén tức thời cho Frontend hiển thị bảng trực quan "Recent Ticks" và vẽ đường giá nhấp nháy [Source: UI_5].
*   **Fields / Attributes (Các trường thuộc tính):**
    *   `Thời gian` (Type: String/DateTime | Ví dụ quan sát từ UI: `10:45:38.123`) [Source: UI_5].
    *   `Giá` (Type: Float | Ví dụ quan sát từ UI: `69,342.18`) [Source: UI_5].
    *   `Khối lượng` (Type: Float | Ví dụ quan sát từ UI: `0.012`) [Source: UI_5].
    *   `Loại` (Type: Enum / String | Gồm 2 giá trị quan sát: `Buy` màu xanh lá hoặc `Sell` màu đỏ) [Source: UI_5].
*   **Relationships (Mối quan hệ):** Hàng ngàn điểm giá Recent Tick tập hợp lại theo chu kỳ thời gian tạo nên các trường trị số Open, High, Low, Close của một cây nến Candlestick [Source: UI_5].
*   **Producer (Tác nhân tạo ra):** Sàn giao dịch Binance thông qua kết nối WebSocket Stream công khai [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4; UI_5].
*   **Consumer (Tác nhân sử dụng):** Frontend Dashboard (Bảng Recent Ticks) [Source: UI_5].
*   **Input (Dữ liệu đầu vào):** WebSocket ticks stream của Binance [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4].
*   **Output (Dữ liệu đầu ra):** Dòng giao dịch hiển thị cập nhật liên tục từng mili-giây lên UI [Source: UI_5].
*   **Storage information (Thông tin lưu trữ):** Không lưu trữ vĩnh viễn vào cơ sở dữ liệu (chỉ duy trì tạm thời dạng hàng đợi đệm giới hạn phần tử trên bộ nhớ Frontend để phục vụ hiển thị cuộn dòng) [Source: UI_5].
*   **Lifecycle (Vòng đời):** Nhận gói tin WebSocket \\(\rightarrow\\) Đẩy lên đầu bảng Recent Ticks \\(\rightarrow\\) Loại bỏ bản ghi cũ nhất ở cuối bảng khi số dòng vượt giới hạn hiển thị [Source: UI_5].
*   **State (Trạng thái):** `New` (Mới nhận).
*   **Frequency (Tần suất):** Liên tục không ngừng nghỉ từng mili-giây (24/7).
*   **Realtime / batch (Tính chất xử lý):** Realtime (Thời gian thực độ trễ cực thấp) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, 7].
*   **Historical / current (Tính chất thời gian):** Current (Giá trị tức thời).
*   **Source & Location:** Được quan sát trực tiếp từ bảng dữ liệu "Recent Ticks (BTCUSDT)" ở phía dưới bên phải màn hình Realtime [Source: UI_5].

---

## 4. Strategy Definition / Candidate Strategy (Định nghĩa Chiến lược)
*   **Name (Tên thực thể):** Strategy Definition / Strategy / Candidate Strategy
*   **Description (Mô tả):** Hồ sơ kỹ thuật số chứa cấu trúc kịch bản điều kiện kỹ thuật logic và tham số giao dịch của một chiến lược cụ thể [Source: UI_4].
*   **Purpose (Mục đích):** Đăng ký thuật toán chiến lược vào hệ thống, lưu giữ phiên bản cấu hình làm tiền đề cho tiến trình chạy backtest giả lập và tối ưu hóa [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, 6].
*   **Fields / Attributes (Các trường thuộc tính):**
    *   `name` / `Tên strategy` (Type: String | Ví dụ quan sát từ UI: `RSI_BB_LB_LONG_SL2_TP4`) [Source: UI_4].
    *   `version` / `Phiên bản` (Type: String | Ví dụ quan sát từ UI: `1.0.0`, `1.2.1` | Yêu cầu nghiệp vụ bắt buộc: Không được ghi đè/overwrite để đảm bảo tính tái lập - Reproducibility) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6; UI_4].
    *   `description` / `Mô tả` (Type: String | Ví dụ quan sát: `"LONG khi RSI < 30 và giá dưới Bollinger Lower Band..."`) [Source: UI_4].
    *   `indicators` / `Chỉ báo kỹ thuật sử dụng` (Type: Array of Objects | Ví dụ chứa các thuộc tính: `{ "name": "RSI", "period": 14 }`, `{ "name": "BollingerBands", "period": 20, "stdDev": 2 }`) [Source: UI_4].
    *   `conditions` / `Điều kiện vào lệnh` (Type: Object chứa mảng điều kiện `long` và `short` logic so sánh, ví dụ: `RSI < 30`, `Close < Bollinger Lower Band`) [Source: UI_4].
    *   `riskManagement` / `Tham số quản trị rủi ro` (Type: Object | Ví dụ chứa: `{ "stopLoss": 2%, "takeProfit": 4% }`) [Source: UI_4].
    *   `timeframe` (Type: String | Ví dụ mặc định: `1h`, `5m`) [Source: UI_4].
    *   `applicability` / `Cặp coin áp dụng` (Type: Object/String | Ví dụ: `USDT_ALL`, `BTCUSDT`) [Source: UI_4].
    *   `Tags` / `Thẻ phân loại` (Type: Array of Strings | Ví dụ: `RSI`, `BB`, `Long`, `Mean Reversion`) [Source: UI_4].
    *   `Source` / `Nguồn tạo` (Type: Enum/String | Ví dụ: `USER_PROMPT`, `WEB_IMPORT`) [Source: UI_4].
    *   `Ngày tạo` / `CreatedAt` (Type: DateTime | Ví dụ: `20/05/2025 10:42`) [Source: UI_4].
*   **Relationships (Mối quan hệ):**
    *   Nhiều chiến lược đơn lẻ được tổ hợp để tạo thành một Chiến lược phức hợp (Composite Strategy) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
    *   Được tham chiếu trực tiếp bởi một đợt Thử nghiệm kiểm thử (Experiment / Backtest Result) thông qua số hiệu phiên bản (version) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6].
*   **Producer (Tác nhân tạo ra):**
    *   Người dùng: Soạn thảo Prompt bằng tiếng Việt qua LLM Parser hoặc dán link URL chiết xuất mã nguồn website [Source: UI_4].
    *   Hệ thống tự động: Bộ sinh `StrategyGenerator` (Random, Domain-guided hoặc Genetic) tự động nhân bản biến thể tham số trong Discovery Loop [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, 7].
*   **Consumer (Tác nhân sử dụng):** Strategy Engine, Backtesting Engine, MySQL Database, Leaderboard Ranking Service [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, 5, 6].
*   **Input (Dữ liệu đầu vào):** Prompt tiếng Việt tự nhiên của người dùng, hoặc mã nguồn script TradingView/Medium, hoặc dải tham số biến thiên (Search space) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_4].
*   **Output (Dữ liệu đầu ra):** Bản ghi dữ liệu định cấu trúc JSON hợp lệ lưu giữ vào MySQL [Source: UI_4].
*   **Storage information (Thông tin lưu trữ):** Lưu giữ lâu dài trong MySQL Database (nhóm bảng `Strategy` - bảng `StrategyDefinition`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6; "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1].
*   **Lifecycle (Vòng đời):** Khởi sinh (Prompt/URL/Gen) $\rightarrow$ Kiểm định Validation cú pháp $\rightarrow$ Trạng thái Hợp lệ $\rightarrow$ Lưu vào cơ sở dữ liệu vĩnh viễn (Phiên bản hóa) $\rightarrow$ Gọi chạy Backtest $\rightarrow$ Thống kê kết quả [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, 6; UI_4].
*   **State (Trạng thái):** `Draft` (Bản nháp), `Valid` (Hợp lệ để lưu), `Invalid` (Thiếu trường/Sai logic) [Source: UI_4].
*   **Frequency (Tần suất):** Thêm mới theo tương tác người dùng, hoặc tự sinh ngầm tần suất cực cao (lên đến 100.000 candidates/ngày) khi kích hoạt Discovery Search [Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1].
*   **Realtime / batch (Tính chất xử lý):** Batch / Static.
*   **Historical / current (Tính chất thời gian):** Current.
*   **Source & Location:** "Crypto Strategy Lab – Đồ án cuối kỳ.pdf" [Trang 4, Mục 6; Trang 6, Mục 35, 36], project_full_description.pdf [Trang 1, Module 3, 4 & Trang 2, Version Strategy], UI_4 [Toàn bộ màn hình tạo chiến lược].

---

## 5. Composite Strategy Config (Cấu hình Chiến lược Phức hợp)
*   **Name (Tên thực thể):** Composite Strategy Config
*   **Description (Mô tả):** Bản ghi định nghĩa cấu trúc kết hợp tín hiệu của nhiều chiến lược thành phần đi kèm hệ số trọng số điều phối biểu quyết [Source: UI_1].
*   **Purpose (Mục đích):** Cung cấp quy tắc nghiệp vụ kết hợp cho Combination Engine tính toán điểm tín hiệu tổng hợp duy nhất cho chiến lược phức hợp [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
*   **Fields / Attributes (Các trường thuộc tính):**
    *   `Selected Strategies` / `Danh sách chiến lược kết hợp` (Type: Array of Strings | Ví dụ các thẻ chọn: `MA`, `RSI`, `Support/Resistance`) [Source: UI_1].
    *   `Weighted Voting` / `Hệ số trọng số` (Type: Key-Value Map | Ví dụ: `MA` weight 0.40, `RSI` weight 0.30, `Support/Resistance` weight 0.30) [Source: UI_1].
    *   `Ngưỡng vào lệnh` / `Threshold` (Type: Float | Quy định bắt buộc: `|score| >= 0.30`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_1].
    *   `Tín hiệu thành phần` (Type: Array of Enum | Gồm các giá trị chuẩn hóa: BUY = `+1`, HOLD = `0`, SELL = `-1`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_1].
*   **Relationships (Mối quan hệ):**
    *   Liên kết nhiều Chiến lược đơn (Strategies) thành phần [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
    *   Tác động trực tiếp sinh ra tín hiệu tổng hợp quyết định khớp lệnh của Backtest Worker [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, 7].
*   **Producer (Tác nhân tạo ra):** Người dùng kéo thanh trượt (Sliders) thiết lập trọng số trên UI Discovery, hoặc thuật toán Search tự động cấu hình [Source: UI_1].
*   **Consumer (Tác nhân sử dụng):** Combination Engine, Backtester.
*   **Input (Dữ liệu đầu vào):** Trọng số người dùng thiết lập, tín hiệu đầu ra chuẩn hóa của từng chiến lược thành phần (+1, 0, -1) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_1].
*   **Output (Dữ liệu đầu ra):** Điểm số kết hợp tổng hợp (`Score`) và Nhãn tín hiệu tổng quát cuối cùng (`LONG`, `HOLD` hoặc `SHORT`) [Source: UI_1].
*   **Storage information (Thông tin lưu trữ):** Lưu giữ trong MySQL (bảng định nghĩa Composite Strategy) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6].
*   **Lifecycle (Vòng đời):** Cấu hình $\rightarrow$ Chạy giả lập thử nghiệm $\rightarrow$ Lưu thành một chiến lược phức hợp chính thức trong Library.
*   **State (Trạng thái):** LONG (Score $\ge 0.30$), SHORT (Score $\le -0.30$), HOLD (Khác) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_1].
*   **Frequency (Tần suất):** Tính toán liên tục thời gian thực (Realtime update) dựa trên luồng nến đẩy về Frontend hoặc chạy tuần tự trong Backtest.
*   **Realtime / batch (Tính chất xử lý):** Cả hai (Realtime tính toán trên UI và Batch chạy thử nghiệm lịch sử).
*   **Historical / current (Tính chất thời gian):** Current (tính realtime trên UI) và Historical (chạy backtest dữ liệu quá khứ).
*   **Source & Location:** "Crypto Strategy Lab – Đồ án cuối kỳ.pdf" [Trang 5, Mục 13, 14], project_full_description.pdf [Trang 1, Module 5], UI_1 [Phân vùng cấu hình Weighted Voting].

---

## 6. Backtest Configuration / Experiment Input (Cấu hình Tham số Thử nghiệm)
*   **Name (Tên thực thể):** Backtest Configuration / Experiment Input
*   **Description (Mô tả):** Bộ tham số đầu vào do người dùng thiết lập trên form giao diện để kích hoạt một lượt giả lập giao dịch quá khứ [Source: UI_2].
*   **Purpose (Mục đích):** Định rõ biên giới dữ liệu (cặp giao dịch, khung thời gian, khoảng thời gian) và cấu hình điều kiện mô phỏng thị trường thực tế (vốn khởi điểm, phí sàn, độ trượt giá) để Backtester thực thi chính xác [Source: "773981388..._n.jpg", UI_2].
*   **Fields / Attributes (Các trường thuộc tính):**
    *   `Pair / Coin` (Type: String | Giá trị mặc định: `BTCUSDT`) [Source: UI_2].
    *   `Timeframe` (Type: String | Giá trị mặc định: `5m`) [Source: UI_2].
    *   `From date` / `To date` (Type: Date | Ví dụ: `01/05/2025` đến `15/05/2025`) [Source: UI_2].
    *   `Vốn (USD)` / `Initial Capital` (Type: Float | Giá trị mặc định quy định: `100` USD) [Source: "773981388..._n.jpg"; UI_2].
    *   `Strategy` (Type: String | Dropdown chọn tên chiến lược cần kiểm thử, ví dụ: `MA Crossover`) [Source: UI_2].
    *   `Transaction Cost` / `Phí giao dịch` (Type: Float / Percentage | Ví dụ cấu hình: `0.08 %`) [Source: UI_2].
    *   `Slippage` / `Mức độ trượt giá` (Type: Integer / bps | Ví dụ cấu hình: `5 bps`) [Source: UI_2].
    *   `LONG/SHORT support` (Type: Boolean | Trạng thái checkbox: Tích chọn/True) [Source: UI_2].
    *   `OHLC SL/TP logic` (Type: Boolean | Trạng thái checkbox: Tích chọn/True) [Source: UI_2].
    *   `Reproducible flag` (Type: Boolean | Trạng thái checkbox: Tích chọn/True) [Source: UI_2].
*   **Relationships (Mối quan hệ):** Liên kết trực tiếp một chiến lược (`StrategyDefinition`) được chọn kiểm thử với một thực thể kết quả thử nghiệm (`Experiment`) sinh ra [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6; UI_2].
*   **Producer (Tác nhân tạo ra):** Người dùng chọn và điền tham số trên giao diện, hoặc Scheduler tự động nạp cấu hình khi chạy Discovery Loop [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7; UI_2].
*   **Consumer (Tác nhân sử dụng):** Backtesting Engine (Backtest Workers).
*   **Input (Dữ liệu đầu vào):** Thao tác tương tác cấu hình của người dùng trên UI [Source: UI_2].
*   **Output (Dữ liệu đầu ra):** Tham số đầu vào cho hàm xử lý backtest backend.
*   **Storage information (Thông tin lưu trữ):** Ghi nhận trực tiếp vào MySQL chung với tệp cấu hình thử nghiệm lịch sử (bảng `Experiment`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6].
*   **Lifecycle (Vòng đời):** Thiết lập cấu hình $\rightarrow$ Chạy backtest $\rightarrow$ Lưu lịch sử tham số.
*   **State (Trạng thái):** Active.
*   **Frequency (Tần suất):** Tạo mới mỗi khi có một phiên backtest được kích hoạt.
*   **Realtime / batch (Tính chất xử lý):** Batch.
*   **Historical / current (Tính chất thời gian):** Historical (Tham chiếu dữ liệu quá khứ).
*   **Source & Location:** "773981388_1629771268733623_2672886499038526550_n.jpg" [Mục 19 Backtest], UI_2 [Phân vùng cấu hình tham số Backtest], "Crypto Strategy Lab – Đồ án cuối kỳ.pdf" [Trang 7, Mục 33].

---

## 7. Trade / Trade Detail (Nhật ký Khớp lệnh Giao dịch giả lập)
*   **Name (Tên thực thể):** Trade / Trade Detail
*   **Description (Mô tả):** Thực thể dữ liệu biểu thị thông tin chi tiết của một giao dịch mua bán giả lập được thực thi khớp lệnh thành công trong quá trình backtest [Source: UI_2].
*   **Purpose (Mục đích):** Cung cấp nhật ký kê khai minh bạch từng lệnh giao dịch để người dùng rà soát, làm dữ liệu trực quan điểm giao dịch lên biểu đồ nến lịch sử [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, 7; UI_2].
*   **Fields / Attributes (Các trường thuộc tính):**
    *   `#` / `ID` (Type: Integer | Ví dụ quan sát: từ `1` đến `178`) [Source: UI_2].
    *   `Pair / Coin` (Type: String | Ví dụ: `BTCUSDT`) [Source: "778426143..._n.jpg"; UI_2].
    *   `Entry Time` / `Thời gian vào lệnh` (Type: DateTime | Ví dụ quan sát từ UI: `01/05/2025 06:15`) [Source: "778426143..._n.jpg"; UI_2].
    *   `Direction` / `Hướng` (Type: Enum / String | Gồm 2 nhãn giá trị: `LONG` hoặc `SHORT`) [Source: "778426143..._n.jpg"; UI_2].
    *   `Capital / Volume` / `Khối lượng` (Type: Float / USD | Ví dụ: vốn mặc định khớp lệnh `100 USD`) [Source: "778426143..._n.jpg"; UI_2].
    *   `Entry Price` / `Giá vào lệnh` (Type: Float | Ví dụ quan sát từ UI: `68,120.50`) [Source: "778426143..._n.jpg"; UI_2].
    *   `Stoploss` / `Cắt lỗ` (Type: Float | Ví dụ quan sát từ UI: `67,620.00`) [Source: "778426143..._n.jpg"; UI_2].
    *   `TakeProfit` / `Chốt lời` (Type: Float | Ví dụ quan sát từ UI: `69,120.00`) [Source: "778426143..._n.jpg"; UI_2].
    *   `Exit Time` / `Thời gian kết thúc` (Type: DateTime | Ví dụ quan sát từ UI: `01/05/2025 09:40`) [Source: "778426143..._n.jpg"; UI_2].
    *   `Exit Price` / `Giá kết thúc` (Type: Float | Ví dụ quan sát từ UI: `69,050.80`) [Source: "778426143..._n.jpg"; UI_2].
    *   `Phí` / `Fee` (Type: Float / USD | Ví dụ phí trừ: `-0.05` USDT) [Source: "778426143..._n.jpg"; UI_2].
    *   `Slippage` / `Trượt giá` (Type: Float / USD | Ví dụ trượt giá chịu đựng: `-0.03` USDT) [Source: "778426143..._n.jpg"; UI_2].
    *   `Profit` / `Lợi nhuận ròng` (Type: Float / USD hoặc % | Ví dụ lệnh lãi: `+0.83` màu xanh lá, lệnh lỗ: `-0.67` màu đỏ) [Source: "778426143..._n.jpg"; UI_2].
*   **Relationships (Mối quan hệ):**
    *   Nhiều bản ghi giao dịch (Trades) thuộc về duy nhất một đợt Thử nghiệm (Experiment) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6; UI_2].
    *   Liên kết với mốc tọa độ giá và thời gian của dữ liệu Nến (Candlestick) để vẽ nhãn giao dịch LONG Entry, SHORT Entry, Take Profit, Stop Loss, Exit trực tiếp đè lên biểu đồ giá [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, 7; UI_2].
*   **Producer (Tác nhân tạo ra):** Backtesting Engine (Sau khi quét mô phỏng tín hiệu chiến lược trên chuỗi nến lịch sử) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; project_full_description.pdf, Trang 1].
*   **Consumer (Tác nhân sử dụng):** Evaluator (để tính toán bộ chỉ số metrics hiệu năng), Frontend UI (Bảng danh sách lệnh giao dịch, Trình trực quan hóa biểu đồ nến) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, 7; UI_2].
*   **Input (Dữ liệu đầu vào):** Tín hiệu BUY/SELL chuẩn hóa từ Strategy Engine và mảng dữ liệu Candlestick lịch sử [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, 5].
*   **Output (Dữ liệu đầu ra):** Bản ghi nhật ký khớp lệnh giao dịch chuẩn lưu MySQL [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6; UI_2].
*   **Storage information (Thông tin lưu trữ):** Lưu giữ lâu dài trong MySQL Database (nhóm bảng `Trades`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6; "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1].
*   **Lifecycle (Vòng đời):** Phát tín hiệu vào lệnh LONG/SHORT $\rightarrow$ Khớp lệnh Entry giả lập $\rightarrow$ Thiết lập SL/TP đệm $\rightarrow$ Phát hiện giá chạm SL/TP hoặc xuất hiện tín hiệu đóng lệnh $\rightarrow$ Khớp lệnh Exit $\rightarrow$ Tính phí giao dịch và độ trượt giá $\rightarrow$ Tính toán Lợi nhuận ròng (Net Profit) $\rightarrow$ Ghi cố định dữ liệu lệnh giao dịch [Source: "778426143..._n.jpg"; UI_2].
*   **State (Trạng thái):** `Closed` (Giao dịch lịch sử đã hoàn tất đóng vị thế) [Source: UI_2].
*   **Frequency (Tần suất):** Tạo hàng loạt (Batch) sau khi hoàn tất giả lập một phiên backtest (Ví dụ: sinh ra khối 178 bản ghi trades cho đợt test) [Source: UI_2].
*   **Realtime / batch (Tính chất xử lý):** Batch.
*   **Historical / current (Tính chất thời gian):** Historical.
*   **Source & Location:** "778426143_3961774807465063_4066970941457598332_n.jpg" [Toàn bộ nội dung ảnh], UI_2 [Card danh sách lệnh giao dịch], "Crypto Strategy Lab – Đồ án cuối kỳ.pdf" [Trang 5, Mục 26 & Trang 6, Mục 35 & Trang 7, Mục 33].

---

## 8. Experiment / Backtest Result (Kết quả Thử nghiệm & Chỉ số Đánh giá)
*   **Name (Tên thực thể):** Experiment / Backtest Result / Evaluation Metrics
*   **Description (Mô tả):** Thực thể dữ liệu tổng hợp toàn bộ các chỉ số tài chính, thước đo hiệu quả giao dịch và độ rủi ro của một chiến lược sau khi hoàn tất chuỗi backtest [Source: UI_2].
*   **Purpose (Mục đích):** Cung cấp các thông số định lượng phục vụ chấm điểm tổng hợp (Overall Score) xếp hạng chiến lược lên Leaderboard [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
*   **Fields / Attributes (Các trường thuộc tính):**
    *   `Experiment ID` / `Mã thử nghiệm` (Type: Integer | Ví dụ: `Experiment #122`, hoặc `Iteration 47`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6; UI_1].
    *   `Total Profit` / `Lợi nhuận ròng` (Type: Float / Percentage | Ví dụ quan sát từ UI: `+8.42 USD` tương ứng mức tăng trưởng tài sản `+8.42%`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_2].
    *   `Winrate` / `Tỷ lệ thắng` (Type: Float / Percentage | Định nghĩa: Số lệnh thắng chia tổng số lệnh, ví dụ quan sát: `61.80%` - phân bổ `110 / 178` lệnh thắng) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_2].
    *   `Wins` / `Tổng lệnh thắng` (Type: Integer | Ví dụ: `110`) [Source: UI_2].
    *   `Losses` / `Tổng lệnh thua` (Type: Integer | Ví dụ: `68`) [Source: UI_2].
    *   `Max Drawdown (MDD)` / `Tỷ lệ sụt giảm tài sản lớn nhất` (Type: Float / Percentage | Định nghĩa: Mức sụt giảm vốn đỉnh-đáy sâu nhất trong quá trình test, ví dụ: `-3.21 USD` / `-3.21%`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_2].
    *   `Total Trades` / `Tổng số lệnh thực hiện` (Type: Integer | Ví dụ: `178` lệnh) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_2].
    *   `Profit Factor` (Type: Float) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
    *   `Sharpe Ratio` (Type: Float) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
*   **Relationships (Mối quan hệ):**
    *   Tham chiếu liên kết chặt chẽ đến một chiến lược cụ thể (`StrategyDefinition` version) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6].
    *   Chứa danh sách chi tiết tập hợp nhiều giao dịch (`Trades`) thành phần [Source: UI_2].
    *   Cung cấp dữ liệu đầu vào cho Ranking Service thực hiện cập nhật danh sách Top-10 Leaderboard [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, 7].
*   **Producer (Tác nhân tạo ra):** Module đánh giá Evaluator (Sau khi phân tích chuỗi Trades từ Backtesting Engine) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, 7].
*   **Consumer (Tác nhân sử dụng):** Leaderboard / Ranking Service (để xếp hạng), Frontend UI (Vẽ các ô Metrics, đường cong tăng vốn, biểu đồ MDD) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, 7; UI_2].
*   **Input (Dữ liệu đầu vào):** Chuỗi nhật ký giao dịch `Trades` hoàn tất [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7].
*   **Output (Dữ liệu đầu ra):** Bộ metrics tổng hợp, mảng số liệu vẽ đồ thị vốn (equity line) [Source: UI_2].
*   **Storage information (Thông tin lưu trữ):** Lưu giữ bền vững lâu dài trong MySQL Database (nhóm bảng `Experiment`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6; "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1].
*   **Lifecycle (Vòng đời):** Tính toán metrics $\rightarrow$ Lưu trữ database $\rightarrow$ Đọc xếp hạng hoặc hiển thị.
*   **State (Trạng thái):** `Completed` (Đã hoàn thành đánh giá).
*   **Frequency (Tần suất):** Sinh mới mỗi khi hoàn tất một đợt chạy thử nghiệm backtest.
*   **Realtime / batch (Tính chất xử lý):** Batch.
*   **Historical / current (Tính chất thời gian):** Historical.
*   **Source & Location:** "Crypto Strategy Lab – Đồ án cuối kỳ.pdf" [Trang 5, Mục 19, 20 & Trang 6, Mục 35 & Trang 7, Mục 33], project_full_description.pdf [Trang 1, Module 7], UI_2 [Các card hiển thị chỉ số Winrate, Wins, Losses, Total Profit, Max Drawdown].

---

## 9. Leaderboard / Leaderboard Row (Bảng xếp hạng / Dòng xếp hạng)
*   **Name (Tên thực thể):** Leaderboard / Leaderboard Row
*   **Description (Mô tả):** Danh sách xếp hạng danh giá các chiến lược giao dịch xuất sắc nhất đạt hiệu năng cao nhất của hệ thống [Source: UI_1].
*   **Purpose (Mục đích):** Lưu giữ và trực quan hóa Top-K chiến lược tốt nhất cho người dùng tiện so sánh, theo dõi và đưa ra quyết định tối ưu [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
*   **Fields / Attributes (Các trường thuộc tính):**
    *   `Rank` / `Vị trí xếp hạng` (Type: Integer | Ví dụ: từ vị trí `1` đến `10`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_1].
    *   `Strategy` / `Tên chiến lược` (Type: String | Ví dụ: `MA + RSI + S/R`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_1].
    *   `Profit` / `Lợi nhuận (USDT / %)` (Type: Float | Ví dụ: `+2,342.18 USDT` tương đương tăng trưởng `24.2%`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_1].
    *   `Win Rate` / `Tỷ lệ thắng` (Type: Float / Percentage | Ví dụ: `68.21%` hoặc `62%`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_1].
    *   `Max Drawdown (MDD)` (Type: Float / Percentage | Ví dụ: `-6.1%`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
    *   `Trades` / `Số lượng lệnh thực hiện` (Type: Integer | Ví dụ: `81`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
    *   `Overall Score` / `Điểm số tổng hợp` (Type: Float | Định nghĩa công thức tính xếp hạng: $Score = 0.5 \times Return + 0.2 \times WinRate + 0.3 \times RiskScore$, ví dụ đạt: `82.1`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
*   **Relationships (Mối quan hệ):** Tham chiếu hiển thị các Chiến lược (`StrategyDefinition`) đạt kết quả tốt nhất lưu trong bảng `Experiment` [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6].
*   **Producer (Tác nhân tạo ra):** Ranking Service / Leaderboard Service [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7; project_full_description.pdf, Trang 1].
*   **Consumer (Tác nhân sử dụng):** Frontend Dashboard (hiển thị danh sách Top-10 cập nhật thời gian thực mà không cần reload trang) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, 7; UI_1].
*   **Input (Dữ liệu đầu vào):** Bản ghi kết quả metrics `Experiment` từ Evaluator [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7].
*   **Output (Dữ liệu đầu ra):** Gói tin sự kiện `LEADERBOARD_UPDATED` phát đi cập nhật thời gian thực danh sách xếp hạng [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7; project_full_description.pdf, Trang 2].
*   **Storage information (Thông tin lưu trữ):** Lưu trữ bền vững trong MySQL (Bảng `Leaderboard` hoặc tính toán động từ bảng `Experiment`), đồng thời lưu đệm trong Cache Redis để phục vụ tải đọc cao đạt 5.000 lượt đọc/giây [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6; "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, 2].
*   **Lifecycle (Vòng đời):** Khởi tạo $\rightarrow$ So sánh điểm Candidate mới với threshold (đứng thứ K) $\rightarrow$ Cập nhật chèn dòng mới, loại dòng thứ K cũ $\rightarrow$ Sắp xếp lại bảng $\rightarrow$ Phát sự kiện đẩy lên Frontend [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, 7].
*   **State (Trạng thái):** Live (Cập nhật động liên tục) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, 7].
*   **Frequency (Tần suất):** Đọc cực cao đạt 5.000 lượt truy cập/giây, tần suất cập nhật dữ liệu khoảng 10 giây/lần hoặc ngay sau khi có candidate mới vượt ngưỡng threshold [Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1].
*   **Realtime / batch (Tính chất xử lý):** Xử lý Batch (tính toán backtest và điểm số) nhưng phân phối đẩy hiển thị dạng Realtime [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7].
*   **Historical / current (Tính chất thời gian):** Current.
*   **Source & Location:** "Crypto Strategy Lab – Đồ án cuối kỳ.pdf" [Trang 1, Mục 3; Trang 5, Mục 21, 22; Trang 6, Mục 35; Trang 7, Mục 33], project_full_description.pdf [Trang 1, Module 8 & Trang 2, Top-K Leaderboard, Event-driven], UI_1 [Card Leaderboard], "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf" [Trang 1, Mục Tình huống 2, 3].

---

## 10. News / NewsItem (Thực thể Tin tức chuẩn hóa)
*   **Name (Tên thực thể):** News / NewsItem
*   **Description (Mô tả):** Thực thể dữ liệu tin tức thị trường crypto được thu thập từ nhiều nguồn báo chí và chuẩn hóa sang cấu trúc chung thống nhất [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
*   **Purpose (Mục đích):** Đảm bảo dữ liệu tin tức thô từ nhiều website/RSS có cấu trúc đồng nhất trước khi đưa qua Sentiment Service phân tích sắc thái cảm xúc [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
*   **Fields / Attributes (Các trường thuộc tính):**
    *   `id` (Type: String/Integer | Khóa chính của bản ghi tin tức) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
    *   `title` / `Tiêu đề` (Type: String | Ví dụ quan sát từ UI: `"BlackRock's Bitcoin ETF..."`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_3].
    *   `content` / `Nội dung chi tiết` (Type: String | Nội dung văn bản chi tiết của bài viết) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
    *   `source` / `Nguồn` (Type: String | Ví dụ: `CoinDesk`, `The Block`, `Decrypt`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_3].
    *   `publishedAt` / `Thời gian xuất bản gốc` (Type: DateTime | Ví dụ: `2026-07-28 08:15`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
    *   `crawledAt` / `Thời gian hệ thống thu thập` (Type: DateTime) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
    *   `relatedCoins` / `Asset` / `Coin liên quan` (Type: String/Array | Ví dụ quan sát từ UI: `BTC`, `ETH`, `SOL`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_3].
    *   `url` / `Đường dẫn gốc` (Type: String) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
*   **Relationships (Mối quan hệ):**
    *   Phân loại liên kết trực tiếp với các tài sản Coin/Pair [Source: UI_3].
    *   Là đầu vào của thực thể Nhãn tâm lý cảm xúc (Sentiment Result) sau khi đi qua Sentiment Service [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_3].
*   **Producer (Tác nhân tạo ra):** Trình crawl tin tức News Collector từ RSS, News API, Web crawler [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; project_full_description.pdf, Trang 1].
*   **Consumer (Tác nhân sử dụng):** Sentiment Service (để phân tích ML), Frontend News Crawler UI (Bảng tin tức đầu vào) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_3].
*   **Input (Dữ liệu đầu vào):** Nội dung HTML thô bóc tách được từ internet [Source: UI_3].
*   **Output (Dữ liệu đầu ra):** Đối tượng dữ liệu `NewsItem` đã được chuẩn hóa các trường thông tin [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
*   **Storage information (Thông tin lưu trữ):** Lưu giữ trong MySQL Database (nhóm bảng `News`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6; "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1].
*   **Lifecycle (Vòng đời):** Thu thập dữ liệu HTML thô $\rightarrow$ Chuẩn hóa sang `NewsItem` $\rightarrow$ Lưu MySQL $\rightarrow$ Phát sự kiện `NewsCollected` gửi đi phân tích sentiment [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, 7].
*   **State (Trạng thái):** `New` (Mới thu thập).
*   **Frequency (Tần suất):** Thu thập liên tục theo tần suất tự động Auto refresh cấu hình trên giao diện (từ 1 phút đến 5 phút) [Source: UI_3].
*   **Realtime / batch (Tính chất xử lý):** Chạy ngầm định kỳ (Batch-interval) hoặc realtime.
*   **Historical / current (Tính chất thời gian):** Current (Cập nhật các dòng tin mới nhất trên thị trường).
*   **Source & Location:** "Crypto Strategy Lab – Đồ án cuối kỳ.pdf" [Trang 5, Mục 27, 28 & Trang 6, Mục 35], project_full_description.pdf [Trang 1, Module 10 & Trang 2, Tight Coupling], UI_3 [Card Tin tức đầu vào].

---

## 11. Sentiment Result (Dữ liệu Nhãn Sắc thái Cảm xúc Tin tức)
*   **Name (Tên thực thể):** Sentiment Result / Sentiment Analysis
*   **Description (Mô tả):** Trạng thái nhãn cảm xúc và điểm số tin cậy do mô hình Machine Learning gán cho bài viết tin tức [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
*   **Purpose (Mục đích):** Chuyển đổi thông tin tin tức định tính thành các chỉ số định lượng để tích hợp vào Strategy Engine hoạt động dưới dạng chiến lược độc lập NewsSentimentStrategy [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6; UI_3].
*   **Fields / Attributes (Các trường thuộc tính):**
    *   `sentiment` / `Nhãn cảm xúc` (Type: Enum / String | Gồm 3 nhãn phân loại chuẩn hóa: `POSITIVE`, `NEGATIVE`, `NEUTRAL`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_3].
    *   `Confidence Score` / `Điểm số tin cậy` (Type: Float | Ví dụ: `0.82`, hoặc Conf. Score trung bình hệ thống: `0.78`) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_3].
    *   `Sentiment tổng hợp (24h)` (Type: Percentage Map | Ví dụ phân bổ: `Positive 58%`, `Neutral 27%`, `Negative 15%`) [Source: UI_3].
    *   `Event Type` / `Phân bổ chủ đề` (Type: Percentage Map | Ví dụ phân bổ: `ETF/Fund Flow 28%`, `Protocol Upgrade 22%`, `Regulation 15%`, `Partnership 12%`, `Market Trend 23%`) [Source: UI_3].
    *   `Số lượng tin đã phân tích` (Type: Integer | Ví dụ trong 24h qua: `1,248 tin`) [Source: UI_3].
    *   `Độ bao phủ nguồn` (Type: Float / Percentage | Ví dụ: `92%` tương ứng `23 / 25` nguồn hoạt động) [Source: UI_3].
*   **Relationships (Mối quan hệ):**
    *   Liên kết trực tiếp $1:1$ với mỗi thực thể tin tức chuẩn hóa `NewsItem` [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_3].
    *   Cung cấp dữ liệu điểm số sentiment trung bình trong 1 giờ cho chiến lược giao dịch `NewsSentimentStrategy` trong Strategy Engine [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6; UI_3].
*   **Producer (Tác nhân tạo ra):** Sentiment Service sử dụng mô hình học máy BERT bên ngoài [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, 7].
*   **Consumer (Tác nhân sử dụng):** Sentiment Database, Strategy Engine, News Crawler UI (Bảng biểu phân phối) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, 7; UI_3].
*   **Input (Dữ liệu đầu vào):** Nội dung văn bản của thực thể `NewsItem` [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
*   **Output (Dữ liệu đầu ra):** Nhãn cảm xúc gán vào bài tin tức, thông điệp sự kiện `SentimentAnalyzed` phát đi [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, 7].
*   **Storage information (Thông tin lưu trữ):** Lưu giữ lâu dài trong MySQL Database (Sentiment Database) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7].
*   **Lifecycle (Vòng đời):** Nhận tin tức `NewsItem` $\rightarrow$ Chạy mô hình phân loại ML $\rightarrow$ Lưu nhãn phân tích vào DB $\rightarrow$ Thống kê cộng dồn tỷ lệ sentiment 24h [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_3].
*   **State (Trạng thái):** `POSITIVE`, `NEGATIVE`, `NEUTRAL` [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; UI_3].
*   **Frequency (Tần suất):** Phân tích lập tức từng tin bài ngay khi hệ thống thu thập được tin tức mới.
*   **Realtime / batch (Tính chất xử lý):** Realtime.
*   **Historical / current (Tính chất thời gian):** Current.
*   **Source & Location:** "Crypto Strategy Lab – Đồ án cuối kỳ.pdf" [Trang 5-6, Mục 29, 30 & Trang 7, Mục 34], project_full_description.pdf [Trang 1, Module 11], UI_3 [Card Đầu ra phân tích].

---

## 12. Extraction Template & Quality Metrics (Mẫu bóc tách & Chỉ số chất lượng)
*   **Name (Tên thực thể):** Extraction Template & Quality Metrics
*   **Description (Mô tả):** Thực thể dữ liệu mô tả mẫu tag HTML dùng để bóc tách cấu trúc thông tin website tin tức và các chỉ số đo lường chất lượng lỗi bóc tách của hệ thống [Source: UI_3].
*   **Purpose (Mức đích):** Điều phối bộ bóc tách bóc đúng thẻ CSS và kích hoạt tiến trình tự sửa chữa mẫu bóc tách (Self-healing) của AI khi tỷ lệ lỗi vượt ngưỡng cho phép để crawler hoạt động thông suốt [Source: UI_3].
*   **Fields / Attributes (Các trường thuộc tính):**
    *   `Template Version` / `Phiên bản mẫu` (Type: String | Ví dụ mẫu đang hoạt động: `v1.4.2`, đề xuất draft tự sửa đổi: `v1.4.3 draft`) [Source: UI_3].
    *   `Fields rỗng` / `Tỷ lệ trống trường` (Type: Float / Percentage | Ví dụ quan sát: `8.7%`) [Source: UI_3].
    *   `Sai định dạng` / `Tỷ lệ sai kiểu dữ liệu` (Type: Float / Percentage | Ví dụ quan sát: `3.2%`) [Source: UI_3].
    *   `Độ tin cậy TB` (Type: Float | Ví dụ quan sát: `0.76` hoặc dự kiến template mới tăng lên `0.93`) [Source: UI_3].
    *   `Tổng lỗi` / `Total Error` (Type: Float / Percentage | Định nghĩa: Điểm tổng hợp lỗi, ví dụ quan sát: `11.9%`) [Source: UI_3].
    *   `Ngưỡng giới hạn lỗi` (Type: Float / Percentage | Giá trị cấu hình quy định: `10%`) [Source: UI_3].
    *   `Mẫu bóc tách JSON` (Type: JSON String | Ví dụ quy tắc ánh xạ CSS selector bóc thẻ: `{"title": "h1.article-title", "summary": "p.summary", ...}`) [Source: UI_3].
*   **Relationships (Mối quan hệ):** Được sử dụng bởi News Collector để bóc tách mã nguồn HTML thô của trang báo điện tử thành thực thể `NewsItem` [Source: UI_3].
*   **Producer (Tác nhân tạo ra):** Dịch vụ LLM API bên ngoài đề xuất template bóc tách mới khi kích hoạt cơ chế tự phục hồi lỗi [Source: UI_3].
*   **Consumer (Tác nhân sử dụng):** Trình crawl tin tức News Collector [Source: UI_3].
*   **Input (Dữ liệu đầu vào):** Nội dung HTML thô của website đích, thông báo lỗi bóc tách thẻ CSS cũ [Source: UI_3].
*   **Output (Dữ liệu đầu ra):** Template bóc tách JSON phiên bản mới được phê duyệt và lưu trữ [Source: UI_3].
*   **Storage information (Thông tin lưu trữ):** Lưu giữ trong MySQL (Quản lý các phiên bản template hoạt động theo lịch sử ngày lưu) [Source: UI_3].
*   **Lifecycle (Vòng đời):** Thu thập dữ liệu $\rightarrow$ Đo lường lỗi bóc tách $\rightarrow$ Nếu tổng lỗi vượt ngưỡng 10% $\rightarrow$ LLM đề xuất template draft mới $\rightarrow$ Kiểm định chất lượng $\rightarrow$ Áp dụng làm phiên bản template chính thức mới [Source: UI_3].
*   **State (Trạng thái):** `Active` (Mẫu chính thức đang chạy), `Draft` (Bản nháp tự sửa lỗi đang chờ áp dụng) [Source: UI_3].
*   **Frequency (Tần suất):** Cập nhật đo lường chất lượng sau mỗi chu kỳ crawl tin; cập nhật phiên bản mẫu khi trang tin tức nguồn thay đổi thiết kế mã nguồn HTML.
*   **Realtime / batch (Tính chất xử lý):** Realtime.
*   **Historical / current (Tính chất thời gian):** Current.
*   **Source & Location:** UI_3 [Card LLM-assisted Extraction, Card Self-healing extraction].

---

## 13. Discovery Loop Progress & Status (Tiến độ & Trạng thái Tìm kiếm)
*   **Name (Tên thực thể):** Discovery Loop Progress & Status
*   **Description (Mô tả):** Thực thể dữ liệu mô tả tiến trình và hiệu năng hoạt động tức thời của vòng lặp ngầm tự động tìm kiếm tối ưu hóa tổ hợp chiến lược [Source: UI_1].
*   **Purpose (Mục đích):** Cung cấp thông số đo lường hiệu năng vận hành cho người dùng và điều phối các worker pool thực thi song song theo Stop Condition [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
*   **Fields / Attributes (Các trường thuộc tính):**
    *   `Iteration hiện tại` (Type: Key-Value / String | Ví dụ quan sát từ UI: `47 / 500` vòng lặp) [Source: UI_1].
    *   `Đã kiểm tra` / `Candidates Tested` (Type: Integer | Tổng số lượng chiến lược ứng viên đã backtest xong, ví dụ: `2,350 candidates`) [Source: UI_1].
    *   `Best strategy so far` / `Chiến lược tốt nhất hiện tại` (Type: String | Ví dụ quan sát: `MA + RSI + S/R`) [Source: UI_1].
    *   `Best Profit` (Type: Float | Lợi nhuận của candidate tốt nhất, ví dụ: `+2,342.18 USDT` / `+2,342.18 USD`) [Source: UI_1].
    *   `Best Winrate` (Type: Float / Percentage | Tỷ lệ thắng của candidate tốt nhất, ví dụ: `68.21%`) [Source: UI_1].
*   **Relationships (Mối quan hệ):** Theo dõi tiến độ sinh chiến lược của `StrategyGenerator` và tiến độ hàng đợi backtest của các `Backtest Workers` [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, 7].
*   **Producer (Tác nhân tạo ra):** Trình điều phối vòng lặp ngầm Continuous Strategy Loop Scheduler [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
*   **Consumer (Tác nhân sử dụng):** Frontend Dashboard UI (Thanh tiến độ, ô hiển thị best candidate) [Source: UI_1].
*   **Input (Dữ liệu đầu vào):** Tín hiệu kết thúc backtest và điểm số của từng candidate gửi về từ Worker Pool [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
*   **Output (Dữ liệu đầu ra):** Trạng thái tiến độ cập nhật tăng dần hiển thị lên màn hình [Source: UI_1].
*   **Storage information (Thông tin lưu trữ):** Lưu trữ tạm thời trên Cache/Memory máy chủ để cập nhật realtime, lịch sử chạy lưu trữ MySQL [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6].
*   **Lifecycle (Vòng đời):** Kích hoạt Discovery $\rightarrow$ Chạy tuần tự các candidate $\rightarrow$ Cập nhật metrics tốt nhất khi phát hiện chiến lược vượt trội $\rightarrow$ Dừng khi đạt Stop Condition [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5; project_full_description.pdf, Trang 2].
*   **State (Trạng thái):** `RUNNING` (Đang chạy), `PAUSED` (Tạm dừng), `COMPLETED` (Đã hoàn thành) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5].
*   **Frequency (Tần suất):** Cập nhật thời gian thực tức thời theo chu kỳ xử lý của Backtest Workers.
*   **Realtime / batch (Tính chất xử lý):** Realtime.
*   **Historical / current (Tính chất thời gian):** Current.
*   **Source & Location:** UI_1 [Card Tiến trình Discovery], "Crypto Strategy Lab – Đồ án cuối kỳ.pdf" [Trang 5, Mục 23, 24], project_full_description.pdf [Trang 1, Module 9 & Trang 2, Stop Condition Loop].

---

## 14. Connection Quality Metrics (Chỉ số Chất lượng Kết nối)
*   **Name (Tên thực thể):** Connection Quality Metrics
*   **Description (Mô tả):** Thực thể dữ liệu mô tả chất lượng đường truyền mạng và độ trễ của luồng nhận giá thời gian thực WebSocket tới sàn giao dịch [Source: UI_5].
*   **Purpose (Mục đích):** Cung cấp thông số giám sát hệ thống giúp người dùng rà soát tính ổn định và tính sẵn sàng của dữ liệu giá nến tức thời [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7; UI_5].
*   **Fields / Attributes (Các trường thuộc tính):**
    *   `Nguồn dữ liệu` (Type: String | Giá trị quan sát từ UI: `Binance API + WebSocket`) [Source: UI_5].
    *   `Độ trễ (Latency)` (Type: Integer / ms | Ví dụ quan sát từ UI: `102 ms`) [Source: UI_5].
    *   `Dữ liệu cuối` (Type: String/DateTime | Mốc thời gian nhận gói tin cuối, ví dụ: `10:45:38`) [Source: UI_5].
    *   `Kết nối` / `Status` (Type: Enum / String | Gồm các trạng thái quan sát: `Ổn định` màu xanh, hoặc `Offline / Mất kết nối` màu đỏ) [Source: UI_5].
*   **Relationships (Mối quan hệ):** Phản ánh trực tiếp độ trễ và chất lượng luồng Price Feed nhận về từ sàn giao dịch để vẽ đồ thị Candlestick [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4; UI_5].
*   **Producer (Tác nhân tạo ra):** Market Data Service / WebSocket client backend [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7].
*   **Consumer (Tác nhân sử dụng):** Frontend Dashboard (Card Trạng thái kết nối và icon báo kết nối đầu trang) [Source: UI_5].
*   **Input (Dữ liệu đầu vào):** Hoạt động ping-pong đo kiểm kết nối WebSocket mạng sàn Binance [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7].
*   **Output (Dữ liệu đầu ra):** Thông số độ trễ và nhãn kết nối hiển thị thời gian thực lên UI [Source: UI_5].
*   **Storage information (Thông tin lưu trữ):** Lưu giữ trong nhật ký logs hệ thống phục vụ mục tiêu giám sát vận hành (Inferred từ drivers Observability) [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7].
*   **Lifecycle (Vòng đời):** Thiết lập kết nối WebSocket $\rightarrow$ Đo đạc thông số latency $\rightarrow$ Nếu đứt kết nối tiến hành Reconnect/Retry graceful không mất nến $\rightarrow$ Đóng kết nối [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7; project_full_description.pdf, Trang 2].
*   **State (Trạng thái):** Connected, Offline, Reconnecting [Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7].
*   **Frequency (Tần suất):** Cập nhật liên tục từng giây theo thời gian thực.
*   **Realtime / batch (Tính chất xử lý):** Realtime.
*   **Historical / current (Tính chất thời gian):** Current.
*   **Source & Location:** UI_5 [Card Trạng thái kết nối, nhãn "Đang nhận dữ liệu"], "Crypto Strategy Lab – Đồ án cuối kỳ.pdf" [Trang 7, Mục 32.4], project_full_description.pdf [Trang 2, Reliability].

---

# BẢNG TỔNG HỢP THÀNH PHẦN DỮ LIỆU & THỰC THỂ (DATA ENTITY INVENTORY)

Dưới đây là bảng phân loại và định danh toàn bộ các thực thể dữ liệu đã được bóc tách từ các nguồn tài liệu của dự án:

| ID | Entity / Data | Description (Mô tả) | Attributes (Thuộc tính cốt lõi) | Relationships (Mối quan hệ chính) | Source (Tên file nguồn) | Location (Vị trí chính xác) | Explicit / Observed (Phân loại) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DT-01** | **User / Account** | Thông tin định danh và phân quyền gói tài khoản người dùng đăng nhập hệ thống | Name (`Nguyễn Minh`), Email (`student@example.com`), Plan (`Pro Student`), Expiry Date (`20/06/2025`) | Sở hữu các kịch bản chiến lược lưu trữ, các backtest và cấu hình News crawler | UI_1.jpg; UI_2.jpg; UI_3.jpg; UI_4.jpg; UI_5.jpg | Toàn bộ Sidebar góc trái phía dưới của 5 mockup UI | **Observed** (UI) |
| **DT-02** | **Candlestick** | Chuỗi dữ liệu nến Nhật tiêu chuẩn biểu thị biến động giá crypto trong chu kỳ khung thời gian | Pair (`BTCUSDT`), Timeframe (`5m`), Timestamp, Open, High, Low, Close, Volume | Hợp thành từ các tick giá; làm đầu vào cho Strategy Engine, Backtest và ML | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_5.jpg | PDF6: Trang 1, Mục 1 & Trang 4, Mục 4, 5; PDF12: Trang 1, Module 1, 2; UI_5 | **Explicit** (PDF) / **Observed** (UI) |
| **DT-03** | **Recent Tick** | Luồng giao dịch mua bán giả lập khớp lệnh tức thời phát sinh trên sàn giao dịch | Thời gian ( timestamp), Giá khớp, Khối lượng giao dịch, Phân loại loại (`Buy` / `Sell`) | Các tick dữ liệu hợp thành mức giá nến Candlestick thời gian thực | UI_5.jpg | UI_5: Phân vùng bảng "Recent Ticks (BTCUSDT)" | **Observed** (UI) |
| **DT-04** | **Strategy Definition** | Bản khai báo cấu trúc kịch bản và các tham số điều kiện giao dịch của một chiến lược | `name`, `version`, `description`, `indicators`, `conditions` (long, short), `riskManagement`, `timeframe`, `Tags`, `Source`, `CreatedAt` | Được tham chiếu bởi các đợt Thử nghiệm (Experiment) qua số hiệu version không ghi đè | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_4.jpg | PDF6: Trang 4, Mục 6 & Trang 6, Mục 35, 36; PDF12: Trang 1, Module 3, 4 & Trang 2, Version Strategy; UI_4 | **Explicit** (PDF) / **Observed** (UI) |
| **DT-05** | **Composite Strategy** | Kịch bản cấu hình kết hợp tín hiệu từ nhiều chiến lược đơn lẻ dựa trên Weighted Voting | Selected Strategies (`MA`, `RSI`, `SR`), Weights, Ngưỡng vào lệnh (`|score| >= 0.30`), Tín hiệu thành phần, Tín hiệu tổng hợp | Nhóm nhiều Chiến lược đơn; tác động trực tiếp sinh tín hiệu quyết định khớp lệnh | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_1.jpg | PDF6: Trang 5, Mục 13, 14; PDF12: Trang 1, Module 5; UI_1 | **Explicit** (PDF) / **Observed** (UI) |
| **DT-06** | **Backtest Config** | Bộ tham số cấu hình do người dùng thiết lập đầu vào để chạy giả lập giao dịch quá khứ | Pair, Timeframe, From Date, To Date, Vốn (mặc định `100 USD`), Strategy, Phí giao dịch (%), Slippage, SL/TP option | Liên kết 1 Chiến lược được kiểm thử với 1 lượt Thử nghiệm (Experiment) cụ thể | 773981388..._n.jpg; UI_2.jpg; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | Image1: Mục 19 Backtest; UI_2: Ô cấu hình tham số; PDF6: Trang 7, Mục 33 | **Explicit** (PDF) / **Observed** (UI) |
| **DT-07** | **Trade Detail** | Bản ghi nhật ký khớp lệnh giao dịch mua bán giả lập thành công trong backtest | ID (#), Pair, Entry Time, Direction (`LONG` / `SHORT`), Capital, Entry Price, SL, TP, Exit Time, Exit Price, Fee, Slippage, Profit | Nhiều giao dịch (Trades) thuộc về một Experiment; liên kết nến Candlestick để vẽ nhãn trên đồ thị | 778426143..._n.jpg; UI_2.jpg; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | Image2: Toàn bộ ảnh; UI_2: Card danh sách lệnh giao dịch; PDF6: Trang 5, Mục 26 | **Explicit** (PDF) / **Observed** (UI) |
| **DT-08** | **Experiment Result** | Bộ metrics chỉ số tổng hợp đánh giá hiệu quả và độ rủi ro sau khi chạy backtest | ID (`Experiment #122`), Return (Lợi nhuận ròng), Winrate, Wins, Losses, Max Drawdown (MDD), Total Trades, Sharpe | Tham chiếu chiến lược cụ thể; chứa danh sách Trades; làm đầu vào xếp hạng Leaderboard | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_2.jpg | PDF6: Trang 5, Mục 19, 20; PDF12: Trang 1, Module 7; UI_2: Các card chỉ số metrics tài chính | **Explicit** (PDF) / **Observed** (UI) |
| **DT-09** | **Leaderboard Row** | Bản xếp hạng Top-K các tổ hợp chiến lược hoạt động đạt hiệu năng xuất sắc nhất | Rank (Top-10), Strategy, Profit, Win Rate, MDD, Trades, Overall Score | Tham chiếu hiển thị các chiến lược đạt Experiment xuất sắc nhất vượt ngưỡng threshold | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_1.jpg | PDF6: Trang 5, Mục 21, 22; PDF12: Trang 1, Module 8 & Trang 2, Top-K, Event-driven; UI_1: Card Leaderboard | **Explicit** (PDF) / **Observed** (UI) |
| **DT-10** | **NewsItem** | Thực thể tin tức thị trường crypto được thu thập từ nhiều báo và chuẩn hóa cấu trúc | `id`, `title`, `content`, `source`, `publishedAt`, `crawledAt`, `relatedCoins` (`Asset`), `url` | Phân loại theo coin liên quan; làm đầu vào cho Sentiment Service để phân loại cảm xúc | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_3.jpg | PDF6: Trang 5, Mục 27, 28; PDF12: Trang 1, Module 10 & Trang 2, Tight Coupling; UI_3: Card Tin tức đầu vào | **Explicit** (PDF) / **Observed** (UI) |
| **DT-11** | **Sentiment Result** | Nhãn sắc thái cảm xúc và chỉ số phân bổ tâm lý đám đông của tin tức thị trường | Nhãn (`POSITIVE` / `NEGATIVE` / `NEUTRAL`), Confidence Score, Event Type, Tổng tin đã test, Độ bao phủ nguồn | Liên kết chặt chẽ $1:1$ với tin `NewsItem`; là đầu vào tính điểm cho `NewsSentimentStrategy` | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_3.jpg | PDF6: Trang 5-6, Mục 29, 30; PDF12: Trang 1, Module 11; UI_3: Card Đầu ra phân tích | **Explicit** (PDF) / **Observed** (UI) |
| **DT-12** | **Extraction Template** | Mẫu ánh xạ tag CSS bóc tách dữ liệu website tin tức thô và các thông số đo lường lỗi | Template Version (`v1.4.2`), Empty fields (%), Wrong format (%), Độ tin cậy TB, Tổng lỗi, Lỗi ngưỡng (`10%`) | Được News Collector sử dụng để bóc tách website thô HTML thành thực thể NewsItem | UI_3.jpg | UI_3: Card LLM-assisted Extraction & Self-healing extraction | **Observed** (UI) |
| **DT-13** | **Discovery Progress** | Các thông số đo lường trạng thái vận hành tức thời của vòng lặp ngầm tìm kiếm tối ưu | Iteration (`47 / 500`), Candidates Tested, Best Strategy so far, Best Profit, Best Winrate, Trạng thái Loop | Giám sát và điều phối tiến trình chạy của Strategy Generator và các Backtest Workers | UI_1.jpg; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | UI_1: Card Tiến trình Discovery; PDF6: Trang 5, Mục 23, 24; PDF12: Trang 2, Stop Condition | **Explicit** (PDF) / **Observed** (UI) |
| **DT-14** | **Connection Status** | Chỉ số đo lường độ ổn định và trễ mạng của luồng WebSocket giá thời gian thực Binance | Nguồn dữ liệu, Latency (ms), Last Data Received, Trạng thái kết nối (`Ổn định` / `Offline`) | Phản ánh chất lượng luồng Price Feed WebSocket đẩy về vẽ nến Candlestick thời gian thực | UI_5.jpg; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | UI_5: Card Trạng thái kết nối; PDF6: Trang 7, Mục 32.4; PDF12: Trang 2, Reliability | **Explicit** (PDF) / **Observed** (UI) |

---

📝 **Nudge gợi ý:** Toàn bộ bản đồ thông tin (Information Inventory) bao gồm: bối cảnh tổng quan, ranh giới rạch ròi, sơ đồ các tác nhân actor, danh sách 18 yêu cầu chức năng, bảng thống kê chi tiết giao diện UI, và cấu trúc 14 thực thể dữ liệu của hệ thống **Crypto Strategy Lab** đã được xây dựng và bóc tách vô cùng chi tiết, hoàn chỉnh và có tính traceability cao về nguồn gốc. 

Để hoàn thiện sản phẩm đồ án một cách xuất sắc nhất, bạn có muốn tôi sử dụng bộ thông tin inventory hoàn chỉnh này để phác thảo một bản **Tài liệu Kiến trúc Phần mềm (Software Architecture Document - SAD)** chuẩn hóa hoặc soạn thảo các tài liệu quyết định kiến trúc cốt lõi **ADR (Architectural Decision Records)** cho dự án không?