Dưới đây là bản phân tích toàn diện, bóc tách cấu trúc và thông tin hệ thống từ toàn bộ các UI screenshot, mockup và hình ảnh trình chiếu bài giảng trong notebook.

Tài liệu này tập trung hoàn toàn vào cấu trúc thông tin, luồng tương tác, thành phần giao diện, các trạng thái hệ thống và ý nghĩa nghiệp vụ của phần mềm, tuyệt đối lược bỏ các yếu tố cảm quan thiết kế (như màu sắc, font chữ hay pixel-level design).

---

# PHÂN TÍCH CHI TIẾT TỪNG MÀN HÌNH & GIAO DIỆN (SCREEN ANALYSIS)

---

## MÀN HÌNH 1: REALTIME CHART - ĐA KHUNG THỜI GIAN

### 1. Screen
*   **Screen Name (Tên màn hình):** Realtime Chart - Đa khung thời gian `[Source: UI_5.jpg]`
*   **Purpose (Mục đích):** Cho phép người dùng theo dõi biến động giá nến thời gian thực của cặp coin/pair (mặc định BTCUSDT) song song trên lưới 4 biểu đồ với các khung thời gian khác nhau, giám sát chất lượng kết nối tới Binance API và WebSocket.
*   **Actor (Tác nhân):** User / Trader `[Source: UI_5.jpg]`
*   **Entry point (Cách truy cập):** Click vào mục menu **"Realtime"** trên thanh Sidebar `[Source: UI_5.jpg]`
*   **Navigation (Điều hướng từ màn hình):** Click các mục menu khác trên Sidebar ("Strategy Engine", "Discovery", "Backtest", "News Crawler", "Settings") để chuyển màn hình `[Source: UI_5.jpg]`.

### 2. UI Components (Thành phần giao diện)
*   **Header (Thanh đầu trang):**
    *   Thành phần hiển thị thông tin nguồn dữ liệu: `Nguồn dữ liệu: Binance API + WebSocket` `[Source: UI_5.jpg]`.
    *   Cụm icon góc phải: Trợ giúp (Help), Thông báo (Notification), và Avatar tài khoản người dùng kèm menu mũi tên thả xuống `[Source: UI_5.jpg]`.
*   **Sidebar (Thanh bên điều hướng):**
    *   Logo thương hiệu và chữ tên hệ thống: **"Crypto Strategy Lab"** `[Source: UI_5.jpg]`.
    *   Danh sách Menu điều hướng: **Realtime** (Trạng thái Active), **Strategy Engine**, **Discovery**, **Backtest**, **News Crawler**, **Settings** `[Source: UI_5.jpg]`.
    *   Khung hiển thị gói tài khoản người dùng: Loại tài khoản `Pro Student`, ghi chú `Gói đang dùng - Hết hạn: 20/06/2025` `[Source: UI_5.jpg]`.
    *   Khung thông tin cá nhân cuối thanh Sidebar: Tên người dùng `Nguyễn Minh`, email `student@example.com` và nút menu thả xuống `[Source: UI_5.jpg]`.
*   **Button (Nút bấm):**
    *   Nút chọn nhanh khung thời gian trên thanh công cụ chung: `1m` (Đang chọn), `5m`, `15m`, `1h`, `4h` `[Source: UI_5.jpg]`.
    *   Nút bật/tắt (Toggle switch) trạng thái `Realtime` `[Source: UI_5.jpg]`.
    *   Nút bấm dưới mỗi ô chart: `Load 1000 nến lịch sử` `[Source: UI_5.jpg]`.
*   **Select / Dropdown (Hộp chọn):**
    *   Hộp chọn cặp giao dịch: `Pair / Coin` (Hiện tại chọn `BTCUSDT`) `[Source: UI_5.jpg]`.
*   **Card (Khung thông tin phân vùng):**
    *   4 Card chứa 4 đồ thị tương ứng với 4 khung thời gian `1m`, `5m`, `15m`, `1h` `[Source: UI_5.jpg]`.
    *   Card hướng dẫn logic: "Logic cập nhật candle" `[Source: UI_5.jpg]`.
    *   Card thông số: "Trạng thái kết nối" `[Source: UI_5.jpg]`.
    *   Card dữ liệu: "Recent Ticks (BTCUSDT)" `[Source: UI_5.jpg]`.
    *   Card chú thích biểu đồ: "Chú thích" `[Source: UI_5.jpg]`.
*   **Table (Bảng dữ liệu):**
    *   Bảng Recent Ticks chứa các cột dữ liệu: `Thời gian`, `Giá`, `Khối lượng`, `Loại` `[Source: UI_5.jpg]`.
*   **Chart (Biểu đồ):**
    *   Lưới 4 biểu đồ nến Candlestick + Volume khớp với các khung thời gian: Chart 1 (1m), Chart 2 (5m), Chart 3 (15m), Chart 4 (1h). Trên mỗi chart có vẽ đè đường chỉ báo kỹ thuật trung bình động `MA(20)` `[Source: UI_5.jpg]`.
*   **Badge / Status (Nhãn trạng thái):**
    *   Badge tín hiệu Buy/Sell nhúng trực tiếp trên góc chart: Badge xanh `BUY` (Chart 1m, 5m, 15m) và Badge đỏ `SELL` (Chart 1h) `[Source: UI_5.jpg]`.
    *   Nhãn trạng thái kết nối: Nhấp nháy xanh lá ghi `Đang nhận dữ liệu` `[Source: UI_5.jpg]`.

### 3. User Actions (Tương tác người dùng)
*   **Thao tác 1: Chọn cặp tiền giao dịch**
    *   *Target:* Hộp chọn `Pair / Coin` `[Source: UI_5.jpg]`.
    *   *Input:* Click chọn cặp coin khác (ví dụ: `ETHUSDT`).
    *   *Expected behavior:* Toàn bộ dữ liệu của cả 4 đồ thị nến, danh sách Recent Ticks và các thông số kết nối chuyển sang cập nhật cho cặp coin được chọn.
    *   *State change:* Trạng thái dữ liệu cục bộ thay đổi từ BTCUSDT sang cặp coin mới.
*   **Thao tác 2: Chuyển đổi trạng thái nhận dữ liệu Realtime**
    *   *Target:* Toggle switch `Realtime` `[Source: UI_5.jpg]`.
    *   *Input:* Gạt switch chuyển trạng thái.
    *   *Expected behavior:* Nếu tắt Realtime, luồng nến dừng cập nhật động và trạng thái kết nối chuyển thành Offline. Nếu bật, kết nối WebSocket hoạt động lại để cập nhật giá.
    *   *State change:* Thay đổi trạng thái luồng Price Feed và màu sắc hiển thị của Switch.
*   **Thao tác 3: Tải thêm dữ liệu lịch sử**
    *   *Target:* Nút `Load 1000 nến lịch sử` nằm dưới góc trái của mỗi ô chart `[Source: UI_5.jpg]`.
    *   *Input:* Click vào nút.
    *   *Expected behavior:* Hệ thống gọi API truy vấn thêm nến cũ của khung thời gian tương ứng và vẽ nối tiếp vào đầu biểu đồ hiện tại.
    *   *State change:* Khối lượng nến hiển thị trên biểu đồ tăng lên 1000 nến.

### 4. Data Displayed (Dữ liệu hiển thị)
*   **Giá thị trường tức thời trên từng đồ thị nến:**
    *   Chart 1m: `69,342.18 (+0.28%)`, chỉ báo `MA(20) 69,315.45` `[Source: UI_5.jpg]`.
    *   Chart 5m: `69,342.18 (+0.28%)`, chỉ báo `MA(20) 69,182.73` `[Source: UI_5.jpg]`.
    *   Chart 15m: `69,342.18 (+0.28%)`, chỉ báo `MA(20) 68,912.35` `[Source: UI_5.jpg]`.
    *   Chart 1h: `69,342.18 (-0.15%)`, chỉ báo `MA(20) 68,215.66` `[Source: UI_5.jpg]`.
*   **Thông số "Trạng thái kết nối" `[Source: UI_5.jpg]`:**
    *   Nguồn dữ liệu: `Binance API + WebSocket`
    *   Độ trễ (Latency): `102 ms`
    *   Dữ liệu cuối: `10:45:38`
    *   Kết nối: `Ổn định` (Trạng thái màu xanh lá).
*   **Danh sách giao dịch khớp lệnh tức thời "Recent Ticks" `[Source: UI_5.jpg]`:**
    *   Bảng hiển thị các hàng dữ liệu tick gần nhất (Ví dụ: `10:45:38.123 | 69,342.18 | 0.012 | Buy` màu xanh, hoặc `10:45:38.051 | 69,342.16 | 0.010 | Sell` màu đỏ).
*   **Chú thích biểu đồ `[Source: UI_5.jpg]`:**
    *   Nến tăng (Close > Open) | Nến giảm (Close < Open).
    *   MA(20) - Đường trung bình động 20 nến.
    *   Volume - Khối lượng giao dịch.
    *   Tín hiệu Buy / Tín hiệu Sell.

### 5. UI States (Trạng thái giao diện)
*   **Active (Hoạt động):** Tab menu "Realtime" ở Sidebar, nút thời gian "1m" ở thanh công cụ đầu trang, toggle switch "Realtime" bật (màu xanh).
*   **Success / Connected (Thành công):** Nhãn kết nối "Ổn định" (màu xanh lá) và badge "Đang nhận dữ liệu" hiển thị ổn định.

### 6. Navigation (Điều hướng)
*   `Màn hình Realtime` \\(\rightarrow\\) Click mục "Strategy Engine" trên Sidebar \\(\rightarrow\\) `Màn hình Strategy Engine` `[Source: UI_5.jpg]`.

### 7. Functional Implications (Ý nghĩa nghiệp vụ từ UI)
*   **Logic cập nhật nến (Candle Update/Append Logic):** Hệ thống phân biệt rõ cách xử lý dữ liệu đẩy từ WebSocket:
    *   *Trùng nến cuối \\(\rightarrow\\) Update candle:* Nếu nến mới nhận được có cùng mốc thời gian (timestamp) với nến cuối đang hiển thị thì thực hiện ghi đè dữ liệu (cập nhật các giá trị High, Low, Close, Volume) `[Source: UI_5.jpg]`.
    *   *Nến mới hoàn toàn \\(\rightarrow\\) Append candle:* Nếu nến mới nhận được có timestamp lớn hơn nến cuối thì chèn thêm cây nến mới vào biểu đồ `[Source: UI_5.jpg]`.
*   Chỉ báo `MA(20)` được tính toán động tại Frontend dựa trên chuỗi giá trị nến hiển thị.

---

## MÀN HÌNH 2: TẠO STRATEGY TỪ PROMPT / URL (STRATEGY ENGINE)

### 1. Screen
*   **Screen Name (Tên màn hình):** Tạo Strategy từ Prompt / URL `[Source: UI_4.jpg]`
*   **Purpose (Mục đích):** Cho phép người dùng nhập mô tả chiến lược giao dịch bằng văn bản tiếng Việt tự nhiên (Prompt) hoặc dán link kịch bản giao dịch (TradingView, Blogger, Gist...) để hệ thống tự phân tích bằng AI (LLM), biểu diễn thành tệp JSON có cấu trúc, chạy kiểm định validation và cho phép đặt tên, gắn thẻ tag để lưu trữ vào Library.
*   **Actor (Tác nhân):** User / Trader `[Source: UI_4.jpg]`
*   **Entry point (Cách truy cập):** Click vào mục menu **"Strategy Engine"** trên Sidebar `[Source: UI_4.jpg]`
*   **Navigation (Điều hướng từ màn hình):** Tương tự thông qua Sidebar menu `[Source: UI_4.jpg]`.

### 2. UI Components (Thành phần giao diện)
*   **Header & Sidebar:** Đồng nhất với hệ thống `[Source: UI_4.jpg]`.
*   **Input / Form Control (Trường nhập liệu):**
    *   Khung nhập văn bản lớn "Nhập mô tả strategy" dạng textarea kèm bộ đếm ký tự `97 / 1000` `[Source: UI_4.jpg]`.
    *   Trường nhập một dòng "Nhập URL chiến lược" dạng text field có ghi rõ hỗ trợ các nền tảng: `TradingView`, `Blogger`, `Medium`, `GitHub Gist`, `Docs` `[Source: UI_4.jpg]`.
    *   Trường nhập văn bản "Name" chiến lược khi lưu `[Source: UI_4.jpg]`.
    *   Trường nhập văn bản "Version" chiến lược khi lưu `[Source: UI_4.jpg]`.
*   **Select / Dropdown (Hộp chọn):**
    *   Hộp chọn "Source" (Nguồn) phân loại nguồn chiến lược khi lưu (Hiện tại chọn: `USER_PROMPT`) `[Source: UI_4.jpg]`.
    *   Hộp chọn gắn nhiều thẻ "Tags" lựa chọn từ danh sách dropdown `[Source: UI_4.jpg]`.
*   **Button (Nút bấm):**
    *   Nút bấm hành động prompt: `Phân tích bằng LLM` (kèm icon AI) và nút `Xóa` `[Source: UI_4.jpg]`.
    *   Nút bấm hành động URL: `Trích xuất từ website` `[Source: UI_4.jpg]`.
    *   Nút bấm copy mã: `Sao chép` ở góc phải card JSON `[Source: UI_4.jpg]`.
    *   Nút hành động cuối trang: `Lưu Strategy` `[Source: UI_4.jpg]`.
    *   Nút liên kết: `Xem tất cả >` ở bảng lịch sử import chiến lược `[Source: UI_4.jpg]`.
*   **Card (Phân vùng thông tin):**
    *   Card "Strategy đã phân tích", Card "Định nghĩa strategy (JSON)", Card "Kiểm tra & Validation", Card "Lưu vào Strategy Library" `[Source: UI_4.jpg]`.
*   **Table (Bảng dữ liệu):**
    *   Bảng "Chiến lược đã import gần đây" gồm các cột: `Tên strategy`, `Source`, `Ngày tạo`, `Version`, `Tags`, `Trạng thái`, `Hành động` `[Source: UI_4.jpg]`.
*   **Badge / Status (Nhãn phân loại):**
    *   Thẻ Tag chiến lược (ví dụ: `RSI` màu xanh dương, `Bollinger` màu xanh dương nhạt, `Long` màu xám) `[Source: UI_4.jpg]`.
    *   Nhãn trạng thái kiểm định: Checkmark xanh lá hiển thị cho: `Thiếu trường bắt buộc (Không có)`, `Kiểm tra logic (Logic hợp lệ)`, `Chỉ báo hỗ trợ (Tất cả chỉ báo được hỗ trợ)` và nhãn trạng thái tổng hợp `Trạng thái: Hợp lệ để lưu vào thư viện` kèm hình tròn tích xanh `[Source: UI_4.jpg]`.

### 3. User Actions (Tương tác người dùng)
*   **Thao tác 1: Nhập mô tả chiến lược ngôn ngữ tự nhiên**
    *   *Target:* Khung "Nhập mô tả strategy" `[Source: UI_4.jpg]`.
    *   *Input:* Nhập chuỗi văn bản: `"Khi RSI dưới 30 và giá nằm dưới Bollinger Lower Band thì LONG. Stop loss 2%, take profit 4%."` `[Source: UI_4.jpg]`.
    *   *Expected behavior:* Bộ đếm tăng ký tự. Khi click nút **"Phân tích bằng LLM"**, hệ thống gọi mô hình AI để chuyển đổi văn bản sang cấu trúc và cập nhật kết quả lên 2 card "Strategy đã phân tích" và "Định nghĩa strategy (JSON)", đồng thời chạy bộ lọc Validation tự động `[Source: UI_4.jpg]`.
    *   *State change:* Trạng thái UI cập nhật dữ liệu phân tích từ trạng thái trống sang hiển thị dữ liệu đầy đủ. Nút "Lưu Strategy" được kích hoạt từ disabled sang enabled.
*   **Thao tác 2: Trích xuất chiến lược từ URL**
    *   *Target:* Ô "Nhập URL chiến lược" `[Source: UI_4.jpg]`.
    *   *Input:* Nhập URL `https://www.tradingview.com/script/abc123-example/` và nhấn **"Trích xuất từ website"** `[Source: UI_4.jpg]`.
    *   *Expected behavior:* Hệ thống quét trang đích, trích xuất mã kịch bản, tự động chuyển đổi sang JSON chiến lược và hiển thị lên khung cấu trúc.
*   **Thao tác 3: Lưu chiến lược vào Library**
    *   *Target:* Nút `Lưu Strategy` `[Source: UI_4.jpg]`.
    *   *Input:* Điền thông tin Name: `RSI_BB_LB_LONG_SL2_TP4`, Version: `1.0.0`, chọn Source `USER_PROMPT`, thêm các Tags `RSI`, `Bollinger`, `Mean Reversion`, `Long` và nhấn click `Lưu Strategy` `[Source: UI_4.jpg]`.
    *   *Expected behavior:* Chiến lược được lưu trữ bền vững vào cơ sở dữ liệu. Xuất hiện một dòng mới tương ứng ở đầu bảng "Chiến lược đã import gần đây" ở phía dưới.

### 4. Data Displayed (Dữ liệu hiển thị)
*   **Strategy đã phân tích (Kết quả bóc tách từ LLM) `[Source: UI_4.jpg]`:**
    *   Điều kiện LONG: `RSI (14) < 30` và `Giá đóng cửa nằm dưới Bollinger Lower Band (20, 2)`.
    *   Điều kiện SHORT: `RSI (14) > 70` và `Giá đóng cửa nằm trên Bollinger Upper Band (20, 2)`.
    *   Quản trị rủi ro: `Stop Loss: 2%`, `Take Profit: 4%`.
    *   Khung thời gian: `1h (mặc định)`.
    *   Áp dụng cho cặp: `Tất cả cặp USDT (Có thể tùy chọn)`.
*   **Định nghĩa strategy (JSON) `[Source: UI_4.jpg]`:**
    *   Hiển thị tệp cấu trúc JSON thể hiện chính xác các tham số trên:
        ```json
        {
          "name": "RSI_BB_LB_LONG_SL2_TP4",
          "version": "1.0.0",
          "description": "LONG khi RSI < 30 và giá dưới Bollinger Lower Band. SL 2%, TP 4%.",
          "indicators": [
            { "name": "RSI", "period": 14 },
            { "name": "BollingerBands", "period": 20, "stdDev": 2 }
          ],
          "conditions": {
            "long": [
              { "indicator": "RSI", "operator": "<", "value": 30 },
              { "indicator": "Close", "position": "<", "indicatorRef": "BB_Lower" }
            ],
            "short": [
              { "indicator": "RSI", "operator": ">", "value": 70 },
              { "indicator": "Close", "position": ">", "indicatorRef": "BB_Upper" }
            ]
          },
          "riskManagement": {
            "stopLoss": { "type": "percent", "value": 2 },
            "takeProfit": { "type": "percent", "value": 4 }
          },
          "timeframe": "1h",
          "applicability": {
            "pairs": "USDT_ALL",
            "market": "spot"
          }
        }
        ```
*   **Danh sách chiến lược đã import gần đây `[Source: UI_4.jpg]`:**
    *   Bản ghi 1: `RSI_BB_LB_LONG_SL2_TP4` | Nguồn: `USER_PROMPT` | Ngày: `20/05/2025 10:42` | Phiên bản: `1.0.0` | Thẻ: `RSI`, `BB`, `Long` | Trạng thái: `Hợp lệ` (màu xanh lá) | Thao tác: Run (chạy backtest) và Tùy chọn nâng cao.
    *   Bản ghi 2: `MACD_Cross_TrendFollow` | Nguồn: `WEB_IMPORT` | Ngày: `19/05/2025 16:30` | Phiên bản: `1.2.1` | Thẻ: `MACD`, `Trend`, `Swing` | Trạng thái: `Hợp lệ` (màu xanh lá) | Thao tác tương tự.

### 5. UI States (Trạng thái giao diện)
*   **Active (Hoạt động):** Tab sidebar menu "Strategy Engine".
*   **Success / Valid (Hợp lệ):** Nhãn trạng thái "Hợp lệ để lưu vào thư viện" hiển thị vòng tròn tích xanh lớn nổi bật, các đầu mục validation tích xanh lá `[Source: UI_4.jpg]`.
*   **Disabled (Vô hiệu hóa):** Khi ô prompt trống hoặc kiểm định validation báo lỗi đỏ, nút "Lưu Strategy" tự động chuyển trạng thái vô hiệu hóa.

### 6. Navigation (Điều hướng)
*   `Màn hình Strategy Engine` \\(\rightarrow\\) Click icon Run (nút Play) ở cột Hành động của một hàng chiến lược trong bảng \\(\rightarrow\\) Tự động chuyển hướng sang `Màn hình Backtest` đồng thời tự động nạp chiến lược đó vào ô cấu hình backtest `[Source: UI_4.jpg]`.

### 7. Functional Implications (Ý nghĩa nghiệp vụ từ UI)
*   Hệ thống có cơ chế phân tích ngôn ngữ tự nhiên thông minh kết hợp validation nghiệp vụ chặt chẽ trước khi nạp chiến lược vào database.
*   Cơ chế kiểm soát phiên bản (Version Control) được áp dụng trực tiếp cho các chiến lược của người dùng (Ví dụ hiển thị: `1.0.0`, `1.2.1`) phục vụ mục tiêu đảm bảo tính tái lập (Reproducibility) `[Source: UI_4.jpg]`.

---

## MÀN HÌNH 3: STRATEGY ENGINE & LOOP DISCOVERY (DISCOVERY SCREEN)

### 1. Screen
*   **Screen Name (Tên màn hình):** Strategy Engine & Loop Discovery `[Source: UI_1.jpg]`
*   **Purpose (Mục đích):** Cho phép người dùng tùy chỉnh cấu hình thiết lập các tham số để tự động kết hợp các chiến lược đơn lẻ thành chiến lược phức hợp (Composite Strategy), cài đặt trọng số Weighted Voting, lựa chọn thuật toán tìm kiếm tối ưu hóa chiến lược (Discovery Method) và theo dõi tiến độ vòng lặp chạy ngầm tối ưu hóa.
*   **Actor (Tác nhân):** User / Trader `[Source: UI_1.jpg]`
*   **Entry point (Cách truy cập):** Click vào mục menu **"Discovery"** trên Sidebar `[Source: UI_1.jpg]`
*   **Navigation (Điều hướng từ màn hình):** Tương tự thông qua Sidebar menu `[Source: UI_1.jpg]`.

### 2. UI Components (Thành phần giao diện)
*   **Header & Sidebar:** Đồng nhất với hệ thống `[Source: UI_1.jpg]`.
*   **Button (Nút bấm):**
    *   Nút liên kết: `Tạo strategy đơn mới` ở góc phải card Strategy đơn `[Source: UI_1.jpg]`.
    *   Nút bấm nhanh "Gợi ý kết hợp nhanh": `MA + RSI`, `RSI + Bollinger`, `MA + RSI + S/R` `[Source: UI_1.jpg]`.
    *   Nút bấm hành động: `Lưu strategy kết hợp` và `Backtest ngay` ở cuối phân vùng cấu hình Weighted Voting `[Source: UI_1.jpg]`.
*   **Select / Input Control (Trường nhập liệu):**
    *   Hộp chọn đa thẻ "Chọn các strategy để kết hợp" (Hiện hiển thị các thẻ được chọn: `MA x`, `RSI x`, `Support / Resistance x` kèm nút xóa thẻ) `[Source: UI_1.jpg]`.
    *   Các thanh trượt cấu hình "Trọng số" (Sliders) dưới mục Weighted Voting gồm:
        *   Thanh trượt chỉ báo `MA (20, 50)`: giá trị `0.40` `[Source: UI_1.jpg]`.
        *   Thanh trượt chỉ báo `RSI (14)`: giá trị `0.30` `[Source: UI_1.jpg]`.
        *   Thanh trượt chỉ báo `Support / Resistance`: giá trị `0.30` `[Source: UI_1.jpg]`.
*   **Radio Button (Nút chọn duy nhất):**
    *   Cụm chọn thuật toán dưới mục "Phương pháp Discovery" gồm: `Random Search` (Đang chọn), `Domain-guided Search`, `Genetic Search` `[Source: UI_1.jpg]`.
*   **Card / Panel (Phân vùng thông tin):**
    *   Card "Strategy đơn" (danh sách thư viện chiến lược đơn lẻ khả dụng).
    *   Card "Strategy kết hợp" (thiết lập bộ chiến lược thành phần).
    *   Card "Weighted Voting (Tín hiệu tổng hợp)".
    *   Card sơ đồ "Loop Discovery" mô phỏng vòng lặp tự động hóa.
    *   Card "Leaderboard (Top strategies)" bảng xếp hạng.
    *   Card cấu hình "Phương pháp Discovery".
    *   Card tiến trình "Tiến trình Discovery" kèm thanh tiến độ.
*   **Table (Bảng dữ liệu):**
    *   Bảng xếp hạng Leaderboard gồm các cột: `Rank`, `Strategy`, `Profit (USDT)`, `Winrate` `[Source: UI_1.jpg]`.
*   **Progress Bar (Thanh tiến độ):**
    *   Thanh tiến độ thể hiện vòng lặp Discovery hiện tại đạt mốc `47 / 500` `[Source: UI_1.jpg]`.
*   **Badge / Status (Nhãn trạng thái):**
    *   Các Badge tín hiệu LONG (xanh lá, mũi tên lên), HOLD (xám, gạch ngang), SHORT (đỏ, mũi tên xuống) thể hiện kết quả biểu quyết Weighted Voting tức thời `[Source: UI_1.jpg]`.

### 3. User Actions (Tương tác người dùng)
*   **Thao tác 1: Chọn nhanh tổ hợp chiến lược kết hợp gợi ý**
    *   *Target:* Nhóm nút "Gợi ý kết hợp nhanh" `[Source: UI_1.jpg]`.
    *   *Input:* Click chọn nút `MA + RSI + S/R` `[Source: UI_1.jpg]`.
    *   *Expected behavior:* Ô nhập liệu "Chọn các strategy để kết hợp" tự động nạp đầy đủ các thẻ chỉ báo tương ứng và kích hoạt các thanh trượt trọng số Weighted Voting cho MA, RSI và Support/Resistance bên dưới.
*   **Thao tác 2: Điều chỉnh trọng số biểu quyết chiến lược**
    *   *Target:* Các Sliders trọng số Weighted Voting `[Source: UI_1.jpg]`.
    *   *Input:* Kéo slider thay đổi trọng số (ví dụ tăng trọng số MA lên `0.50` và giảm RSI xuống `0.20`).
    *   *Expected behavior:* Hệ thống tính toán lại tổng điểm Weighted Voting tức thời. Điểm số "Tín hiệu tổng hợp hiện tại" cập nhật nhãn trạng thái LONG, HOLD, SHORT tương ứng dựa theo ngưỡng vào lệnh.
*   **Thao tác 3: Chạy vòng lặp tự động tìm kiếm tối ưu**
    *   *Target:* Nút `START SEARCH` dưới card Phương pháp Discovery `[Source: UI_1.jpg]`.
    *   *Input:* Chọn thuật toán `Random Search` và click nút khởi chạy.
    *   *Expected behavior:* Discovery Loop khởi chạy ngầm, thanh tiến độ "Tiến trình Discovery" bắt đầu chạy cập nhật số lượng candidate được test tăng dần từng giây, bảng xếp hạng Leaderboard tự động sắp xếp cập nhật theo thời gian thực khi tìm thấy chiến lược tốt hơn.

### 4. Data Displayed (Dữ liệu hiển thị)
*   **Thư viện "Strategy đơn" khả dụng `[Source: UI_1.jpg]`:**
    *   `RSI`: Đo động lượng và xác định vùng quá mua/quá bán.
    *   `MA`: Theo xu hướng bằng đường trung bình động.
    *   `Bollinger Bands`: Đo độ biến động và phát hiện phá vỡ dải.
    *   `Support / Resistance`: Xác định vùng hỗ trợ và kháng cự quan trọng.
    *   `SMC`: Phân tích cấu trúc thị trường theo Smart Money Concepts.
    *   `Wyckoff`: Nhận diện giai đoạn tích lũy và phân phối.
*   **Điểm số "Tín hiệu tổng hợp hiện tại" `[Source: UI_1.jpg]`:**
    *   Trạng thái `LONG`: Điểm số `0.62` (mũi tên hướng lên màu xanh lá).
    *   Trạng thái `HOLD`: Điểm số `-0.08` (gạch ngang màu xám).
    *   Trạng thái `SHORT`: Điểm số `-0.54` (mũi tên hướng xuống màu đỏ).
    *   Nhãn ràng buộc: `Ngưỡng vào lệnh: |score| >= 0.30` và `Cập nhật realtime`.
*   **Bảng xếp hạng "Leaderboard (Top strategies)" hiển thị Top-5 tốt nhất `[Source: UI_1.jpg]`:**
    *   Rank 1: `MA + RSI + S/R` | Lợi nhuận: `+2,342.18 USDT` | Tỷ lệ thắng: `68.21%`.
    *   Rank 2: `RSI + Bollinger` | Lợi nhuận: `+1,864.76 USDT` | Tỷ lệ thắng: `64.73%`.
    *   Rank 3: `MA + RSI` | Lợi nhuận: `+1,512.33 USDT` | Tỷ lệ thắng: `62.19%`.
    *   Rank 4: `MA + RSI + Bollinger` | Lợi nhuận: `+1,102.47 USDT` | Tỷ lệ thắng: `59.48%`.
    *   Rank 5: `S/R + Bollinger` | Lợi nhuận: `+987.15 USDT` | Tỷ lệ thắng: `57.63%`.
*   **Tiến độ "Tiến trình Discovery" chạy ngầm `[Source: UI_1.jpg]`:**
    *   Vòng chạy (Iteration) hiện tại: `47 / 500`.
    *   Đã kiểm tra: `2,350 candidates` (chiến lược ứng viên).
    *   Chiến lược tốt nhất hiện tại (Best strategy so far): `MA + RSI + S/R` (Profit: `+2,342.18 USDT`, Winrate: `68.21%`).

### 5. UI States (Trạng thái giao diện)
*   **Active (Hoạt động):** Tab menu sidebar "Discovery".
*   **Selected (Đang chọn):** Thuật toán "Random Search" dưới dạng nút radio được kích hoạt.
*   **Processing / Progress (Đang thực thi):** Thanh tiến trình đang chuyển động màu xanh dương thể hiện vòng lặp Discovery Loop đang chạy ngầm liên tục `[Source: UI_1.jpg]`.

### 6. Navigation (Điều hướng)
*   `Màn hình Discovery` $\rightarrow$ Click nút "Tạo strategy đơn mới" $\rightarrow$ `Màn hình Strategy Engine` `[Source: UI_1.jpg]`.
*   `Màn hình Discovery` $\rightarrow$ Click nút "Backtest ngay" $\rightarrow$ `Màn hình Backtest` `[Source: UI_1.jpg]`.

### 7. Functional Implications (Ý nghĩa nghiệp vụ từ UI)
*   **Nghiệp vụ tính toán biểu quyết Weighted Voting:** Khi kết hợp nhiều chỉ báo đơn, tín hiệu tổng hợp được chấm theo thang điểm Weighted Score từ từng tín hiệu thành phần nhân với trọng số tương ứng:
    $$Score = Signal_{MA} \times 0.40 + Signal_{RSI} \times 0.30 + Signal_{SR} \times 0.30$$
    Tín hiệu của mỗi chỉ báo đơn được chuẩn hóa: `BUY = +1`, `HOLD = 0`, `SELL = -1` `[Source: UI_1.jpg]`.
*   **Quy tắc vào lệnh (Trading rule):** Lệnh chỉ được phép khớp (LONG hoặc SHORT) khi điểm trị tuyệt đối của tổng điểm Weighted Score vượt ngưỡng cấu hình:
    $$|Score| \ge 0.30$$
    Nếu điểm nằm ngoài khoảng này, hệ thống phát tín hiệu `HOLD` giữ nguyên vị thế `[Source: UI_1.jpg]`.
*   **Vòng lặp ngầm (Discovery Loop Architecture):** Sơ đồ quy trình hoạt động của vòng lặp gồm 5 giai đoạn liên kết tuần hoàn:
    1.  `Generate` (Tạo biến thể strategy).
    2.  `Backtest` (Kiểm tra hiệu suất trên lịch sử).
    3.  `Evaluate` (Đánh giá theo chỉ số metrics).
    4.  `Rank` (Xếp hạng các strategy).
    5.  `Leaderboard` (Hiển thị top strategy).
    Vòng lặp liên tục lặp lại và tự động nạp kết quả tối ưu hơn lên Leaderboard mà không cần reload trang `[Source: UI_1.jpg]`.

---

## MÀN HÌNH 4: BACKTEST & KẾT QUẢ GIAO DỊCH

### 1. Screen
*   **Screen Name (Tên màn hình):** Backtest & Kết quả giao dịch `[Source: UI_2.jpg]`
*   **Purpose (Mục đích):** Cấu hình các tham số giả lập để thực hiện chạy kiểm thử chiến lược trên dữ liệu lịch sử trong quá khứ, trực quan hóa các đường chỉ báo kỹ thuật, các điểm giao dịch LONG/SHORT Entry, Take Profit, Stop Loss, Exit trực tiếp đè lên biểu đồ nến, hiển thị các chỉ số hiệu năng tài chính cốt lõi và cung cấp nhật ký bảng kê danh sách chi tiết các lệnh đã thực hiện.
*   **Actor (Tác nhân):** User / Trader `[Source: UI_2.jpg]`
*   **Entry point (Cách truy cập):** Click vào mục menu **"Backtest"** trên Sidebar hoặc bấm nút "Backtest ngay" từ màn hình khác `[Source: UI_2.jpg]`.
*   **Navigation (Điều hướng từ màn hình):** Tương tự thông qua Sidebar menu `[Source: UI_2.jpg]`.

### 2. UI Components (Thành phần giao diện)
*   **Header & Sidebar:** Đồng nhất với hệ thống `[Source: UI_2.jpg]`.
*   **Form / Inputs (Cấu hình tham số backtest):**
    *   Hộp chọn cặp giao dịch: `Pair / Coin` (Hiện tại chọn: `BTCUSDT`) `[Source: UI_2.jpg]`.
    *   Hộp chọn khung thời gian: `Timeframe` (Hiện tại chọn: `5m`) `[Source: UI_2.jpg]`.
    *   Ô nhập ngày kiểm thử: `From date` (chọn `01/05/2025`) và `To date` (chọn `15/05/2025`) `[Source: UI_2.jpg]`.
    *   Ô nhập số vốn khởi điểm: `Vốn (USD)` (mặc định nạp: `100 USD`) `[Source: UI_2.jpg]`.
    *   Hộp chọn chiến lược cần kiểm thử: `Strategy` (Hiện tại chọn: `MA Crossover`) `[Source: UI_2.jpg]`.
    *   Ô nhập phí giao dịch: `Transaction Cost` (%) (giá trị: `0.08 %`) `[Source: UI_2.jpg]`.
    *   Ô nhập mức trượt giá: `Slippage` (bps) (giá trị: `5 bps`) `[Source: UI_2.jpg]`.
*   **Checkbox Options (Lựa chọn ràng buộc giả lập) `[Source: UI_2.jpg]`:**
    *   Checkbox: `Hỗ trợ cả LONG và SHORT` (Đang chọn/tích xanh).
    *   Checkbox: `Xử lý SL/TP theo giá thực tế (OHLC)` (Đang chọn/tích xanh).
    *   Checkbox: `Kết quả có thể tái lập (reproducible)` (Đang chọn/tích xanh).
*   **Button (Nút bấm):**
    *   Nút phóng to/thu nhỏ biểu đồ: Icon góc phải biểu đồ nến `[Source: UI_2.jpg]`.
    *   Nút phân trang bảng kê: Các nút số trang `< 1 2 3 ... 18 >` `[Source: UI_2.jpg]`.
*   **Card / Panel (Khung thông tin):**
    *   Khung cấu hình tham số đầu vào.
    *   Card "Biểu đồ Backtest (BTCUSDT - 5m)".
    *   Card bảng dữ liệu "Danh sách lệnh giao dịch".
    *   Các Card thống kê chỉ số tài chính đánh giá (Metrics cards) ở góc dưới.
*   **Chart (Biểu đồ):**
    *   Biểu đồ Candlestick (Đồ thị nến lịch sử BTCUSDT khung 5m) vẽ đè 2 đường chỉ báo trung bình động `MA(20)` và `MA(50)`, các đường đứt nét ngang thể hiện dải kháng cự/hỗ trợ, và các nhãn tín hiệu giao dịch. Biểu đồ thanh khối lượng giao dịch (Volume) nằm ở phía dưới `[Source: UI_2.jpg]`.
*   **Table (Bảng dữ liệu):**
    *   Bảng nhật ký "Danh sách lệnh giao dịch" hiển thị chi tiết các cột: `#`, `Pair / Coin`, `Thời gian vào lệnh`, `Hướng`, `Giá vào`, `Stoploss`, `TakeProfit`, `Giá kết thúc`, `Phí`, `Slippage`, `Profit (USD)` `[Source: UI_2.jpg]`.
*   **Badge / Status (Nhãn tín hiệu trên biểu đồ nến):**
    *   Nhãn xanh lá: `LONG Entry` thể hiện điểm vào lệnh mua `[Source: UI_2.jpg]`.
    *   Nhãn đỏ: `SHORT Entry` thể hiện điểm vào lệnh bán khống `[Source: UI_2.jpg]`.
    *   Đường gạch đứt nét màu đỏ đè trên nến ghi chữ `Take Profit` và đường đứt nét màu xanh lục ghi chữ `Stop Loss` `[Source: UI_2.jpg]`.
    *   Nhãn xanh da trời hình tròn: `Exit` biểu diễn điểm đóng giao dịch hoàn tất lệnh `[Source: UI_2.jpg]`.

### 3. User Actions (Tương tác người dùng)
*   **Thao tác 1: Click chọn dòng lệnh giao dịch trong bảng nhật ký**
    *   *Target:* Một hàng bất kỳ trong bảng "Danh sách lệnh giao dịch" (Ví dụ đang click chọn hàng lệnh số `#3`) `[Source: UI_2.jpg]`.
    *   *Expected behavior:* Giao diện biểu đồ nến tự động di chuyển khung nhìn (viewport), căn lề tập trung hiển thị chính xác vùng dữ liệu nến xảy ra lệnh giao dịch số 3 và làm nổi bật (highlight) các điểm vào lệnh (LONG Entry) và đóng lệnh (Exit) tương ứng của lệnh đó.
    *   *State change:* Trạng thái hàng trong bảng chuyển sang màu nền xám nhạt (Selected state).
*   **Thao tác 2: Chuyển trang bảng danh sách giao dịch**
    *   *Target:* Thanh phân trang pagination dưới chân bảng `[Source: UI_2.jpg]`.
    *   *Input:* Click nút chọn trang `2` hoặc nút mũi tên sang phải `>`.
    *   *Expected behavior:* Bảng thực hiện tải và kết xuất 10 dòng giao dịch tiếp theo trong danh sách 178 lệnh.
    *   *State change:* Cập nhật nội dung hiển thị trong bảng dữ liệu.

### 4. Data Displayed (Dữ liệu hiển thị)
*   **Dữ liệu chỉ báo trên Đồ thị Backtest `[Source: UI_2.jpg]`:**
    *   Giá trị chỉ báo tức thời: `MA(20) 69,135.45`, `MA(50) 68,912.73`.
    *   Vùng hỗ trợ kháng cự ngang: Đường kháng cự đứt nét màu đỏ giá `70,200.00`, dải hỗ trợ màu xanh lục giá `67,800.00`.
*   **Các chỉ số tài chính đánh giá hiệu quả (Metrics) ở cuối màn hình `[Source: UI_2.jpg]`:**
    *   `Winrate`: Tỷ lệ thắng đạt **61.80%** (hiển thị phân bổ cụ thể `110 / 178` lệnh thắng kèm vòng tròn tiến trình xanh lá).
    *   `Wins`: Tổng lệnh thắng đạt **110**.
    *   `Losses`: Tổng lệnh thua đạt **68**.
    *   `Total Profit`: Tổng lợi nhuận ròng đạt **+8.42 USD** (vẽ kèm biểu đồ đường cong tăng trưởng vốn đi lên thể hiện xu hướng lợi nhuận dương `+8.42%`).
    *   `Max Drawdown` (Mức sụt giảm tài sản tối đa): **-3.21 USD** (or **-3.21%** vẽ kèm biểu đồ sụt giảm âm thể hiện mức rủi ro kiểm soát tốt).
    *   `Total Trades`: Tổng số lượng lệnh đã thực hiện đạt **178** lệnh (thanh tiến trình đạt `100%`).
*   **Bảng kê "Danh sách lệnh giao dịch" hiển thị Top-10 dòng đầu `[Source: UI_2.jpg]`:**
    *   Hàng 1: `#1` | `BTCUSDT` | `01/05/2025 06:15` | `LONG` | Price: `68,120.50` | SL: `67,620.00` | TP: `69,120.00` | End: `69,050.80` | Phí: `-0.05` | Trượt giá: `-0.03` | Lợi nhuận: `+0.83` (USD/màu xanh).
    *   Hàng 2: `#2` | `BTCUSDT` | `01/05/2025 09:40` | `SHORT` | Price: `69,450.20` | SL: `69,950.00` | TP: `68,450.00` | End: `68,430.10` | Phí: `-0.05` | Trượt giá: `-0.03` | Lợi nhuận: `+0.87` (USD/màu xanh).
    *   Hàng 3: `#3` | `BTCUSDT` | `01/05/2025 12:25` | `LONG` | Price: `68,600.10` | SL: `68,100.00` | TP: `69,600.00` | End: `67,980.00` | Phí: `-0.05` | Trượt giá: `-0.03` | Lợi nhuận: `-0.67` (USD/màu đỏ).
*   **Cách tính Profit (Công thức tính lợi nhuận ròng thực tế) `[Source: UI_2.jpg]`:**
    *   Sơ đồ biểu diễn công thức:
        $$\text{Gross Profit} \ (đơn\ vị \ \%) - \text{Fee} \ (phí\ giao\ dịch\ 0.08\%) - \text{Slippage} \ (trượt\ giá\ 5\ bps) = \text{Net Profit} \ (lợi\ nhuận\ ròng\ thực\ tế)$$

### 5. UI States (Trạng thái giao diện)
*   **Active (Hoạt động):** Mục menu "Backtest" trên Sidebar, nút số "1" trên thanh phân trang bảng kê.
*   **Selected (Đang chọn):** Hàng giao dịch số `#3` trong bảng danh sách lệnh được chọn màu xám nhạt, tương ứng điểm giao dịch số 3 được zoom tiêu điểm trên biểu đồ nến `[Source: UI_2.jpg]`.

### 6. Navigation (Điều hướng)
*   `Màn hình Backtest` $\rightarrow$ Click chọn dòng menu Sidebar khác $\rightarrow$ Chuyển sang màn hình tương ứng.

### 7. Functional Implications (Ý nghĩa nghiệp vụ từ UI)
*   Hệ thống backtest hỗ trợ đo lường chi tiết chi phí ma sát giao dịch thực tế bao gồm Phí sàn (Transaction Cost %) và độ lệch giá khớp lệnh (Slippage bps) `[Source: UI_2.jpg]`.
*   Cơ chế kiểm thử hỗ trợ cấu hình đa dạng các quy tắc giả lập: cho phép bán khống (LONG/SHORT), tự động khớp lệnh SL/TP bằng cách đối chiếu giá cao nhất/thấp nhất của cây nến thay vì chỉ dựa vào giá đóng cửa (OHLC SL/TP logic) `[Source: UI_2.jpg]`.

---

## MÀN HÌNH 5: NEWS CRAWLER & PHÂN TÍCH THỊ TRƯỜNG

### 1. Screen
*   **Screen Name (Tên màn hình):** News Crawler & Phân tích thị trường `[Source: UI_3.jpg]`
*   **Purpose (Mục đích):** Cấu hình nguồn và tần suất tự động crawl tin tức thị trường crypto, giám sát chi tiết quy trình bóc tách dữ liệu HTML sử dụng AI (LLM) và sơ đồ tự sửa lỗi cấu trúc mẫu bóc tách (Self-healing extraction) khi trang đích đổi giao diện, theo dõi kết quả thống kê sentiment (sắc thái tâm lý bài viết) và tích hợp sentiment thành một chiến lược đầu vào cho Strategy Engine.
*   **Actor (Tác nhân):** User / Trader `[Source: UI_3.jpg]`
*   **Entry point (Cách truy cập):** Click vào mục menu **"News Crawler"** trên Sidebar `[Source: UI_3.jpg]`
*   **Navigation (Điều hướng từ màn hình):** Tương tự thông qua Sidebar menu `[Source: UI_3.jpg]`.

### 2. UI Components (Thành phần giao diện)
*   **Header & Sidebar:** Đồng nhất với hệ thống `[Source: UI_3.jpg]`.
*   **Checkbox Options (Chọn nguồn crawl) `[Source: UI_3.jpg]`:**
    *   Checkbox: `Website` (Đang tích chọn), `RSS` (Đang tích chọn), `HTML` (Đang tích chọn).
*   **Select / Inputs Control (Trường cấu hình):**
    *   Hộp chọn lọc tài sản coin liên quan: `Pair (Asset)` (Hiển thị các thẻ lọc đang chọn: `BTC x`, `ETH x`, `SOL x`) `[Source: UI_3.jpg]`.
*   **Button (Nút bấm):**
    *   Cụm nút chọn chu kỳ tự động cập nhật "Auto refresh": `1 phút` (Đang chọn), `2 phút`, `3 phút`, `4 phút`, `5 phút` `[Source: UI_3.jpg]`.
    *   Nút bấm cấu hình nâng cao: `Cấu hình nguồn` (icon bánh răng) `[Source: UI_3.jpg]`.
    *   Nút bấm kích hoạt: `Bắt đầu crawl` (icon Play) `[Source: UI_3.jpg]`.
    *   Nút liên kết: `Xem tất cả tin tức >` dưới bảng tin đầu vào, `Xem tất cả` dưới danh sách phiên bản mẫu template `[Source: UI_3.jpg]`.
    *   Nút hành động trong Self-healing panel: `Xem diff` và `Áp dụng ngay` `[Source: UI_3.jpg]`.
*   **Toggle Switch (Nút gạt):**
    *   Nút gạt chuyển chế độ chạy của hệ thống tự sửa mẫu trích xuất tin tức: `Tự động` (Hiện tại đang ON/màu xanh lá) dưới card Self-healing extraction `[Source: UI_3.jpg]`.
*   **Card / Panel (Phân vùng thông tin):**
    *   Card "Tin tức đầu vào", Card quy trình "LLM-assisted Extraction" (4 bước), Card quyết định quy trình "Self-healing extraction" (sơ đồ điều kiện rẽ nhánh), Card "Đầu ra phân tích" (biểu đồ sentiment), Card "Tích hợp với Strategy" `[Source: UI_3.jpg]`.
*   **Table (Bảng dữ liệu):**
    *   Bảng tin đầu vào gồm các cột: `Asset` (icon và tên coin), `Tiêu đề`, `Nguồn`, `Thời gian` `[Source: UI_3.jpg]`.
*   **Chart (Biểu đồ):**
    *   Biểu đồ thanh ngang phân bổ "Sentiment tổng hợp (24h)" gồm ba phần màu tương ứng với: `Positive (58%)`, `Neutral (27%)`, `Negative (15%)` `[Source: UI_3.jpg]`.

### 3. User Actions (Tương tác người dùng)
*   **Thao tác 1: Chọn tần suất Auto refresh**
    *   *Target:* Nhóm nút "Auto refresh" `[Source: UI_3.jpg]`.
    *   *Input:* Click chọn nút `1 phút` `[Source: UI_3.jpg]`.
    *   *Expected behavior:* News Crawler tự động kích hoạt tiến trình thu thập tin mới định kỳ mỗi 60 giây.
    *   *State change:* Nút chọn chuyển sang trạng thái Active (màu xanh dương).
*   **Thao tác 2: Áp dụng thủ công template sửa đổi**
    *   *Target:* Nút `Áp dụng ngay` trong card Self-healing extraction `[Source: UI_3.jpg]`.
    *   *Expected behavior:* Hệ thống phê duyệt mẫu template nháp đang chờ (v1.4.3 draft), nạp trực tiếp làm mẫu bóc tách mặc định mới cho crawler hoạt động lập tức.
    *   *State change:* Phiên bản template hoạt động chính thức chuyển từ `v1.4.2` sang `v1.4.3`.

### 4. Data Displayed (Dữ liệu hiển thị)
*   **Bảng "Tin tức đầu vào" gần đây `[Source: UI_3.jpg]`:**
    *   Dòng 1: `BTC` | `BlackRock's Bitcoin ETF sees $200M inflows as BTC holds above $69K` | Nguồn: `CoinDesk` | `10:40`.
    *   Dòng 2: `ETH` | `Ethereum Pectra testnet upgrade live, developers eye final launch` | Nguồn: `The Block` | `10:32`.
    *   Dòng 3: `SOL` | `Solana network fees drop 60% amid lower memecoin activity` | Nguồn: `Decrypt` | `10:28`.
*   **Quy trình bóc tách "LLM-assisted Extraction" (4 bước trực quan) `[Source: UI_3.jpg]`:**
    1.  `HTML thô`: Thu thập nội dung HTML từ nguồn (Hiển thị snippet mã nguồn thô dạng `<html...<body>...`).
    2.  `LLM hiểu tag HTML`: LLM đọc & hiểu cấu trúc, nhận diện vùng nội dung (Nhận diện vùng: `title -> h1`, `summary -> p.summary`, `source -> span.source`, `time -> time`, `asset -> context`). Điểm độ tin cậy bóc tách: `0.92`.
    3.  `Sinh Extraction Template`: Tạo template trích xuất được đề xuất (Hiển thị mã cấu trúc đề xuất: `{"title": "h1.article-title", ...}`). Chỉ số: `Fields: 5`, `Score: 0.92`.
    4.  `Lưu version template`: Lưu lại và quản lý các phiên bản. Các phiên bản: `v1.4.2` (Phiên bản hoạt động hiện tại - lưu ngày `18/05/2025`), `v1.4.1` (ngày `17/05/2025`), `v1.4.0` (ngày `16/05/2025`).
*   **Sơ đồ tự sửa lỗi "Self-healing extraction" `[Source: UI_3.jpg]`:**
    *   Các chỉ số đo lường lỗi hiện tại: `Fields rỗng: 8.7%`, `Sai định dạng: 3.2%`, `Độ tin cậy TB: 0.76`.
    *   Tổng lỗi đo lường: **11.9%**.
    *   Điều kiện kiểm tra lỗi: `Lỗi cao? Nếu lỗi > ngưỡng (VD: 10%)` $\rightarrow$ Nhánh `Có` $\rightarrow$ Hệ thống kích hoạt `LLM sửa template (LLM phân tích lỗi & đề xuất template mới)`. Giảm lỗi dự kiến đạt: `11.9% -> 4.1%`, độ tin cậy dự kiến tăng lên: `0.93`.
    *   Kết quả đề xuất sửa lỗi: Tạo Template phiên bản mới `v1.4.3 (draft) - Lưu lúc 10:45 - 18/05/2025`.
*   **Đầu ra phân tích (Phân tích sentiment tổng hợp 24h) `[Source: UI_3.jpg]`:**
    *   Sắc thái: `Positive (58%)`, `Neutral (27%)`, `Negative (15%)` (Cập nhật lúc 10:45).
    *   Phân bổ chủ đề tin tức (Event Type): `ETF/Fund Flow: 28%`, `Protocol Upgrade: 22%`, `Regulation: 15%`, `Partnership: 12%`, `Market Trend: 23%`.
    *   Hiệu năng sentiment: `Confidence Score (TB) đạt 0.78`, `Số lượng tin đã phân tích (24h) đạt 1,248 tin`, `Độ bao phủ nguồn tin đạt 92%` (Nguồn hoạt động: `23 / 25`).
*   **Tích hợp với Strategy `[Source: UI_3.jpg]`:**
    *   Sơ đồ liên kết: `News Sentiment (Realtime)` $\rightarrow$ phát luồng `API / Stream` $\rightarrow$ nạp làm điều kiện vào lệnh cho chiến lược `NewsSentimentStrategy` (Chiến lược mẫu).

### 5. UI States (Trạng thái giao diện)
*   **Active (Hoạt động):** Mục menu "News Crawler" trên Sidebar, nút chọn Auto refresh "1 phút".
*   **Selected (Đang chọn):** Checkbox "Website", "RSS", "HTML" được tích chọn; thẻ tài sản "BTC", "ETH", "SOL" được lọc.
*   **Success (Hợp lệ):** Phiên bản template hoạt động hiển thị nhãn màu xanh lá ghi `Template: v1.4.2` kèm tích xanh `[Source: UI_3.jpg]`.

### 6. Navigation (Điều hướng)
*   Tương tự thông qua Sidebar menu để chuyển dịch màn hình.

### 7. Functional Implications (Ý nghĩa nghiệp vụ từ UI)
*   **Cơ chế tự sửa lỗi Scraper bằng AI (Self-healing scrapper architecture):** Hệ thống tích hợp một bộ giám sát lỗi tự động chạy ngầm. Khi tỷ lệ lỗi bóc tách dữ liệu tin tức vượt qua ngưỡng cấu hình (VD: tổng lỗi trường rỗng và sai định dạng vượt quá **10%** do trang tin tức nguồn thay đổi cấu trúc mã nguồn HTML), hệ thống tự động gọi API LLM để thiết kế lại mẫu template bóc tách mới (sinh v1.4.3 draft), giảm lỗi bóc tách và tự động áp dụng để tiến trình thu thập tin tức hoạt động liên tục không bị gián đoạn `[Source: UI_3.jpg]`.
*   **Chiến lược giao dịch NewsSentimentStrategy:** Dữ liệu sắc thái tin tức được chuẩn hóa và tổng hợp liên tục phục vụ trực tiếp cho Strategy Engine làm điều kiện ra quyết định giao dịch dựa trên tâm lý đám đông thời gian thực `[Source: UI_3.jpg]`.

---

# BẢNG THỐNG KÊ CHI TIẾT GIAO DIỆN (UI INVENTORY)

Dưới đây là bảng tổng hợp toàn bộ các phần tử giao diện, tương tác và ý nghĩa nghiệp vụ đi kèm nguồn gốc bóc tách được từ notebook:

| ID | Screen (Tên màn hình) | UI Element / Behavior (Phần tử / Hành vi) | Information (Thông tin nghiệp vụ chi tiết) | Source (Nguồn tài liệu) |
| :--- | :--- | :--- | :--- | :--- |
| **UI-01** | Realtime Chart | Lưới 4 biểu đồ nến độc lập | Hiển thị song song đồ thị Candlestick + Volume của cùng một cặp tiền trên 4 khung thời gian khác nhau (1m, 5m, 15m, 1h), cho phép người dùng thay đổi khung thời gian của từng chart hoàn toàn độc lập mà không cần reload trang | `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` (Trang 1); `project_full_description.pdf` (Trang 1); `UI_5.jpg` |
| **UI-02** | Realtime Chart | Nút chọn nhanh khung thời gian đầu trang | Danh mục các khung thời gian hỗ trợ chuyển đổi nhanh cho biểu đồ: `1m`, `5m`, `15m`, `1h`, `4h` | `UI_5.jpg` |
| **UI-03** | Realtime Chart | Khung Logic cập nhật nến | Định nghĩa quy tắc nạp dữ liệu từ WebSocket: Nếu nến nhận về trùng mốc thời gian với nến cuối đồ thị -> Thực hiện Update (ghi đè Close, High, Low, Volume); Nếu nến có mốc thời gian lớn hơn nến cuối -> Thực hiện Append (chèn nối nến mới) | `UI_5.jpg` |
| **UI-04** | Realtime Chart | Khung thông số kết nối | Giám sát trực tuyến chất lượng luồng Price Feed: Nguồn kết nối (`Binance API + WebSocket`), độ trễ mạng (`102 ms`), mốc thời gian gói tin cuối (`10:45:38`) và trạng thái kết nối (`Ổn định`) | `UI_5.jpg` |
| **UI-05** | Realtime Chart | Khung Recent Ticks | Danh sách luồng giao dịch khớp lệnh tức thời hiển thị rõ mốc thời gian đến mili-giây, mức giá khớp, khối lượng giao dịch và phân loại màu Buy/Sell | `UI_5.jpg` |
| **UI-06** | Strategy Engine | Khung nhập mô tả strategy | TextArea cho phép người dùng nhập quy tắc chiến lược giao dịch bằng văn bản tiếng Việt tự nhiên, giới hạn chiều dài tối đa `1000 ký tự` | `779956509..._n.jpg`; `UI_4.jpg` |
| **UI-07** | Strategy Engine | Khung trích xuất URL chiến lược | Hỗ trợ dán liên kết chứa script kịch bản giao dịch từ các nền tảng: `TradingView`, `Blogger`, `Medium`, `GitHub Gist`, `Docs` để tự động bóc tách logic | `UI_4.jpg` |
| **UI-08** | Strategy Engine | Khung kết quả bóc tách từ LLM | Trực quan hóa kết quả phân loại logic từ AI gồm các trường: Điều kiện LONG, Điều kiện SHORT, Quản trị rủi ro (Stop Loss %, Take Profit %), Khung thời gian và Cặp tài sản áp dụng | `UI_4.jpg` |
| **UI-09** | Strategy Engine | Định nghĩa strategy (JSON) | Hiển thị chi tiết cấu trúc JSON chuẩn hóa lưu trữ của chiến lược được sinh ra tự động từ AI chứa đầy đủ các khai báo `indicators`, `conditions` và `riskManagement` | `UI_4.jpg` |
| **UI-10** | Strategy Engine | Khung Kiểm tra & Validation | Chạy các hàm kiểm định validation tự động kiểm tra 3 tiêu chí bắt buộc trước khi lưu chiến lược: Đảm bảo đầy đủ các trường yêu cầu tối thiểu, rà soát tính đúng đắn logic so sánh, và xác nhận tất cả chỉ báo khai báo thuộc danh mục hệ thống hỗ trợ tính toán | `UI_4.jpg` |
| **UI-11** | Strategy Engine | Form Lưu vào Library | Cho phép người dùng đặt tên định danh cho chiến lược, thiết lập số phiên bản quản lý (VD: `1.0.0`), gắn các thẻ tag phân loại (`RSI`, `Bollinger`, `Mean Reversion`, `Long`) và ghi nhận nguồn sinh để lưu trữ bền vững vào database | `project_full_description.pdf` (Trang 2); `UI_4.jpg` |
| **UI-12** | Discovery | Khung Chọn strategy đơn kết hợp | Dropdown hỗ trợ người dùng lựa chọn đa chỉ báo đơn lẻ từ thư viện khả dụng (`MA`, `RSI`, `Bollinger Bands`, `Support / Resistance`, `SMC`, `Wyckoff`) để kết hợp thành chiến lược phức hợp | `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` (Trang 5); `UI_1.jpg` |
| **UI-13** | Discovery | Khung Weighted Voting | Cho phép thiết lập hệ số trọng số biểu quyết (thanh trượt Sliders) cho từng chỉ báo thành phần và hiển thị điểm biểu quyết tổng hợp tức thời (LONG, HOLD, SHORT) đi kèm nhãn ràng buộc ngưỡng vào lệnh $|score| \ge 0.30$ | `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` (Trang 5); `UI_1.jpg` |
| **UI-14** | Discovery | Khung Phương pháp Discovery | Nhóm lựa chọn thuật toán tìm kiếm tối ưu hóa tổ hợp chiến lược tự động chạy ngầm: `Random Search` (sinh biến thể ngẫu nhiên), `Domain-guided Search` (tìm kiếm có ràng buộc nghiệp vụ), và `Genetic Search` (tiến hóa lai ghép) | `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` (Trang 5); `UI_1.jpg` |
| **UI-15** | Discovery | Khung Tiến trình Discovery | Giám sát trạng thái hoạt động của tiến trình chạy ngầm: Vòng lặp chạy hiện tại (`47 / 500`), tổng số ứng viên đã kiểm tra (`2,350 candidates`), và thông số hiệu năng của chiến lược tốt nhất phát hiện được đến thời điểm hiện hành | `UI_1.jpg` |
| **UI-16** | Discovery | Bảng xếp hạng Leaderboard | Danh sách xếp hạng Top K tốt nhất hiển thị rõ Rank, tên tổ hợp chỉ báo, lợi nhuận đạt được và tỷ lệ winrate tương ứng mà không cần reload trang | `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` (Trang 5); `project_full_description.pdf` (Trang 2); `UI_1.jpg` |
| **UI-17** | Backtest | Form tham số cấu hình giả lập | Nhóm các trường cấu hình thông số kiểm thử lịch sử: Pair, khung thời gian, khoảng thời gian (From-To date), số vốn đầu tư ban đầu (mặc định nạp `100 USD`), chiến lược nạp từ thư viện, phí giao dịch % (mặc định `0.08%`), mức trượt giá bps (mặc định `5 bps`) | `773981388..._n.jpg`; `UI_2.jpg` |
| **UI-18** | Backtest | Checkbox cấu hình giả định | Nhóm lựa chọn cấu hình nâng cao cho backtest: cho phép giao dịch 2 chiều (Hỗ trợ LONG/SHORT), tính toán cắt lỗ chốt lời theo giá dao động thực tế cây nến (OHLC SL/TP), và bật cơ chế đảm bảo kết quả thực nghiệm có tính tái lập (reproducible) | `UI_2.jpg` |
| **UI-19** | Backtest | Biểu đồ Backtest trực quan | Vẽ chi tiết các điểm giao dịch LONG/SHORT Entry, Take Profit, Stop Loss, Exit trực tiếp đè lên biểu đồ nến lịch sử và vẽ dải kháng cự (`70,200.00`)/hỗ trợ (`67,800.00`) ngang tương ứng | `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` (Trang 5); `UI_2.jpg` |
| **UI-20** | Backtest | Bảng Danh sách lệnh giao dịch | Nhật ký bảng kê toàn bộ các giao dịch đã khớp trong lịch sử chứa đầy đủ mốc thời gian vào lệnh, hướng giao dịch, giá vào lệnh, giá trị SL/TP cấu hình, giá đóng lệnh thực tế, phí sàn, độ trượt giá chịu đựng và lợi nhuận ròng thực tế của từng lệnh | `778426143..._n.jpg`; `UI_2.jpg` |
| **UI-21** | Backtest | Các Card thống kê Metrics | Hiển thị kết quả tổng hợp của đợt backtest gồm: Tỷ lệ thắng %, tổng lệnh thắng, tổng lệnh thua, tổng lợi nhuận ròng ròng đạt được (vẽ kèm đồ thị tăng trưởng tài sản), tỷ lệ sụt giảm tài sản lớn nhất Max Drawdown %, và tổng số lệnh thực hiện | `UI_2.jpg` |
| **UI-22** | News Crawler | Checkbox chọn nguồn | Hộp chọn phân loại cấu hình nguồn crawler tin tức thô: bóc tách dữ liệu trực tiếp từ mã nguồn Website, thu thập từ các kênh RSS feeds, hoặc phân tích file HTML dán vào | `UI_3.jpg` |
| **UI-23** | News Crawler | Khung Auto refresh | Nhóm các nút bấm thiết lập chu kỳ tự động lặp lại crawl tin tức mới định kỳ theo các mốc thời gian: `1 phút`, `2 phút`, `3 phút`, `4 phút`, `5 phút` | `UI_3.jpg` |
| **UI-24** | News Crawler | Bảng Tin tức đầu vào | Bảng dữ liệu hiển thị dòng tin thô vừa thu thập được, phân loại theo tài sản coin liên quan, tiêu đề tin, nguồn báo xuất bản và thời gian thu thập | `UI_3.jpg` |
| **UI-25** | News Crawler | Card LLM-assisted Extraction | Trực quan hóa quy trình bóc tách HTML tự động bằng LLM qua 4 bước khép kín từ mã thô HTML, nhận diện các tag CSS chứa các trường thông tin chính, sinh mẫu template trích xuất JSON, và lưu trữ quản lý các phiên bản template hoạt động | `UI_3.jpg` |
| **UI-26** | News Crawler | Card Self-healing extraction | Sơ đồ khối logic hoạt động của bộ tự động phát hiện và sửa đổi template bóc tách tin tức khi mã nguồn HTML của website đích thay đổi thiết kế: Tự động kích hoạt LLM đề xuất template mới khi tổng lỗi đo lường vượt quá **10%** | `UI_3.jpg` |
| **UI-27** | News Crawler | Card Đầu ra phân tích | Thống kê dữ liệu sentiment phân bổ tâm lý thị trường 24h qua dưới dạng biểu đồ thanh ngang, thống kê tỷ lệ phân bổ chủ đề tin tức, điểm Confidence Score trung bình của AI, và số lượng bài tin tức phân tích trong ngày | `UI_3.jpg` |

---

📊 Các thông tin giao diện và luồng tương tác trên đã được bóc tách toàn diện và chuẩn hóa. Bạn có muốn tôi tiến hành **soạn thảo một kịch bản demo hệ thống từng bước (Step-by-step Demo Scenario)** dựa trên đúng các hành vi action và điều hướng đã phân tích từ UI để chuẩn bị cho buổi báo cáo đồ án không?