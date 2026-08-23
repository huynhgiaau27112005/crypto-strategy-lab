Dưới đây là danh sách **Functional Requirements (Yêu cầu chức năng)** và các chức năng của hệ thống được trích xuất chi tiết từ toàn bộ các nguồn tài liệu và mockup giao diện có trong notebook. 

Để đảm bảo tính đầy đủ (**completeness**), mỗi chức năng dưới đây được mô tả chi tiết theo đúng cấu trúc nghiệp vụ được yêu cầu, kết hợp thông tin từ cả tài liệu lý thuyết lẫn quan sát thực tế trên UI.

---

# CHI TIẾT CÁC CHỨC NĂNG HỆ THỐNG

## 1. Realtime Market Data Streaming (Đăng ký và truyền phát dữ liệu thị trường thời gian thực)
*   **Requirement / Function name:** Realtime Market Data Streaming & Subscription
*   **Description:** Hệ thống lấy luồng dữ liệu nến giao dịch (K-line/Candlestick) thời gian thực từ sàn Binance, chuyển qua Adapter trung gian và đẩy về cho Frontend hiển thị thông qua giao thức WebSocket kết nối liên tục [1-3].
*   **Actor:** Người dùng (Trader) xem dữ liệu, Hệ thống tự động đẩy dữ liệu.
*   **Trigger:** Người dùng truy cập vào màn hình "Realtime" hoặc hệ thống khởi động kết nối dữ liệu nền [4, 5].
*   **Preconditions:** Hệ thống Backend thiết lập kết nối WebSocket ổn định với API sàn Binance thông qua `BinanceAdapter` [1]. Giao diện Frontend thiết lập kết nối WebSocket với Backend [1].
*   **Main behavior:** Backend liên tục lắng nghe ticks giá của cặp giao dịch, đóng gói thành các gói dữ liệu nến theo các timeframe (1m, 5m, 15m, 1h, 4h, 1d) và đẩy trực tiếp xuống Frontend mà không bắt Frontend gọi API tuần tục kiểu Polling [1, 6].
*   **Steps:**
    1. Người dùng mở màn hình "Realtime" [5].
    2. Frontend gửi yêu cầu đăng ký nhận luồng dữ liệu (ví dụ: BTCUSDT) kèm danh sách các khung thời gian (timeframe) [1, 5, 6].
    3. Backend gọi `BinanceAdapter` để mở/đăng ký stream từ Binance WebSocket [1].
    4. Backend nhận dữ liệu thô, chuẩn hóa cấu trúc để Frontend không bị phụ thuộc vào định dạng của riêng Binance [1].
    5. Backend phát dữ liệu chuẩn hóa xuống Frontend qua WebSocket [1].
    6. Frontend nhận dữ liệu và vẽ lại đồ thị nến thời gian thực tương ứng [5, 6].
*   **Input:** Tên cặp tiền tệ (ví dụ: `BTCUSDT`), luồng dữ liệu giá thời gian thực từ Binance [1, 5].
*   **Output:** Luồng dữ liệu nến cập nhật liên tục (Open, High, Low, Close, Volume, Timestamp) gửi đến Frontend [1, 7].
*   **Postconditions:** Frontend cập nhật trạng thái nến liên tục từng giây theo thời gian thực [1, 5].
*   **Business rules:** 
    *   Không được kết nối Frontend trực tiếp với Binance WebSocket API [1].
    *   Phải qua lớp Adapter trung gian để dễ dàng thay đổi sang OKX, Bybit, Coinbase mà không sửa frontend [1, 6, 8].
*   **Validation:** Dữ liệu nến truyền về phải đầy đủ 5 tham số cốt lõi (OHLCV) và định dạng thời gian chuẩn hóa [7].
*   **Exceptions & Error cases:** 
    *   *Mất kết nối mạng hoặc Binance ngắt kết nối:* Hệ thống phải tự động thực hiện Reconnect và Retry một cách mượt mà (gracefully) để tránh việc mất dữ liệu nến (lọt nến) [3, 9, 10].
*   **State changes:** Giao diện chuyển đổi trạng thái hiển thị "Đang nhận dữ liệu" (nhấp nháy xanh) khi kết nối ổn định hoặc "Mất kết nối" [5].
*   **Dependencies:** Phụ thuộc vào Binance WebSocket API [1].
*   **Related functions:** *Candle Feed Update & Append Handler [5], Multi-Timeframe Realtime Chart Grid Rendering [5, 6].*
*   **Sources & Locations:** 
    *   `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 4, Mục 4 & Trang 7, Mục 32.3, 32.4]
    *   `project_full_description.pdf` [Trang 1, Mục 1 & Trang 2, Mục Reliability]
    *   `UI_5.jpg` [Source type: UI observation - vùng hiển thị "Trạng thái kết nối" và nút bật tắt "Realtime"]

---

## 2. Candle Feed Update & Append Handler (Xử lý cập nhật nến trùng và nối nến mới)
*   **Requirement / Function name:** Candle Feed Update & Append Handler
*   **Description:** Xử lý logic cập nhật dữ liệu nến thời gian thực được đẩy từ WebSocket nhằm tối ưu hóa hiệu năng vẽ đồ thị của Frontend: ghi đè nếu trùng nến hiện tại hoặc nối tiếp nếu xuất hiện nến mới [5].
*   **Actor:** Hệ thống Frontend.
*   **Trigger:** Nhận gói tin WebSocket chứa dữ liệu nến mới từ Backend [1, 5].
*   **Preconditions:** Trình duyệt đang hiển thị đồ thị nến thời gian thực [5, 6].
*   **Main behavior:** Hệ thống tự động phân loại tick dữ liệu nến nhận được. Nếu timestamp của nến trùng với nến cuối cùng trên chart, hệ thống thực hiện cập nhật giá nến hiện tại. Nếu timestamp lớn hơn nến cuối, hệ thống chèn một nến mới hoàn toàn vào đồ thị [5].
*   **Steps:**
    1. Frontend nhận gói tin nến qua WebSocket [1].
    2. Hệ thống so sánh timestamp của nến nhận được với timestamp của cây nến cuối cùng đang hiển thị trên đồ thị [5].
    3. *Trường hợp trùng nến cuối (Update candle):* Hệ thống cập nhật các thông số Close, High, Low, Volume của cây nến hiện tại (ghi đè nến hiện tại) [5].
    4. *Trường hợp nến mới hoàn toàn (Append candle):* Hệ thống đẩy cây nến cũ vào lịch sử đồ thị, và vẽ một cây nến mới ở cuối danh sách (nối nến mới) [5].
*   **Input:** Điểm dữ liệu nến thời gian thực (Timestamp, Open, High, Low, Close, Volume) [5, 7].
*   **Output:** Đồ thị hiển thị nến cuối được cập nhật động hoặc dịch chuyển đồ thị để vẽ nến mới [5, 6].
*   **Postconditions:** Đồ thị nến hiển thị chính xác diễn biến giá tức thời [5, 6].
*   **Business rules (Logic cập nhật candle):**
    *   *Trùng nến cuối:* Nếu nến mới nhận được có cùng thời gian với nến cuối -> Update (Ghi đè) [5].
    *   *Nến mới hoàn toàn:* Nếu nến mới nhận được có thời gian mới hơn nến cuối -> Append (Thêm nến mới) [5].
*   **Validation:** Không được vẽ lặp lại hai nến có cùng timestamp trên cùng một đồ thị [5].
*   **Exceptions & Error cases:** Nếu gói tin chứa timestamp cũ hơn nến cuối (do trễ mạng), hệ thống bỏ qua không vẽ lại hoặc thực hiện sắp xếp lại mảng dữ liệu đồ thị [5].
*   **State changes:** Thay đổi mảng danh sách nến (Candlestick array) lưu trữ tại local memory của Frontend [5].
*   **Dependencies:** Phụ thuộc vào luồng dữ liệu của *Realtime Market Data Streaming* [1, 5].
*   **Related functions:** *Multi-Timeframe Realtime Chart Grid Rendering [5, 6].*
*   **Sources & Locations:**
    *   `UI_5.jpg` [Source type: UI observation - Mục "Logic cập nhật candle"]

---

## 3. Multi-Timeframe Realtime Chart Grid Rendering (Hiển thị lưới biểu đồ đa khung thời gian thời gian thực)
*   **Requirement / Function name:** Multi-Timeframe Realtime Chart Grid Rendering
*   **Description:** Hiển thị lưới đồ thị nến thời gian thực gồm tối đa 4 biểu đồ độc lập trên cùng một màn hình cho phép người dùng theo dõi đồng thời biến động giá ở nhiều khung thời gian khác nhau [5, 6, 11, 12].
*   **Actor:** Người dùng (Trader).
*   **Trigger:** Người dùng truy cập màn hình "Realtime" [5].
*   **Preconditions:** Đã tải thư viện vẽ chart (ví dụ: Chart Library từ CDN hoặc local) [13]. Có kết nối mạng [1].
*   **Main behavior:** Giao diện chia thành 4 phân vùng độc lập (mỗi phân vùng là 1 Chart). Mỗi biểu đồ hiển thị dữ liệu lịch sử và nến thời gian thực của cùng một cặp coin nhưng chạy trên các khung thời gian riêng biệt [5, 6].
*   **Steps:**
    1. Người dùng mở tab "Realtime" [5].
    2. Giao diện render lưới chia 4 biểu đồ [5].
    3. Hệ thống tải tối đa 1000 cây nến lịch sử cho từng khung thời gian tương ứng (mặc định: Chart 1 - 1m, Chart 2 - 5m, Chart 3 - 15m, Chart 4 - 1h) [5, 6].
    4. Hệ thống vẽ các chỉ báo kỹ thuật (như đường trung bình động MA20) trực tiếp lên từng đồ thị nến [5, 6].
    5. Đăng ký các sự kiện lắng nghe cập nhật nến thời gian thực để cập nhật riêng rẽ từng biểu đồ [5, 6].
*   **Input:** Tên cặp giao dịch (mặc định BTCUSDT) [5, 6].
*   **Output:** Giao diện lưới 4 đồ thị nến (Candlestick) kèm khối lượng giao dịch (Volume) và chỉ báo MA(20) hoạt động đồng thời [5, 6].
*   **Postconditions:** Đồ thị nến của cả 4 khung thời gian hoạt động trơn tru, hiển thị các nhãn tín hiệu BUY/SELL khi có [5, 6].
*   **Business rules:**
    *   Hệ thống bắt buộc phải hỗ trợ hiển thị tối đa 4 biểu đồ cùng một lúc trên một màn hình [6, 11, 12].
    *   Mỗi chart phải tải tối đa 1000 nến lịch sử gần nhất để đảm bảo hiệu năng tải trang [5].
*   **Validation:** Không được reload lại toàn bộ trang khi khởi chạy vẽ lưới đồ thị [6, 14].
*   **Exceptions & Error cases:** Nếu một biểu đồ bị lỗi tải dữ liệu lịch sử, hệ thống hiển thị thông báo lỗi tại biểu đồ đó, 3 biểu đồ còn lại vẫn phải hoạt động bình thường [6].
*   **State changes:** Không có.
*   **Dependencies:** Phụ thuộc vào *Realtime Market Data Streaming [1]* và thư viện vẽ đồ thị (CDN/Local) [13].
*   **Related functions:** *Timeframe Switching for Individual Charts [5, 6], Backtest Trade Visualizer on Candlestick Chart [15, 16].*
*   **Sources & Locations:**
    *   `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 1, Mục 3 & Trang 4, Mục 5]
    *   `project_full_description.pdf` [Trang 1, Mục 2]
    *   `UI_5.jpg` [Source type: UI observation - Toàn bộ giao diện lưới 4 biểu đồ]

---

## 4. Timeframe Switching for Individual Charts (Chuyển đổi khung thời gian trên từng biểu đồ độc lập)
*   **Requirement / Function name:** Timeframe Switching for Individual Charts
*   **Description:** Cho phép người dùng tùy ý chuyển đổi độc lập khung thời gian (timeframe) của từng biểu đồ trong lưới 4 biểu đồ mà không làm gián đoạn hay ảnh hưởng đến dữ liệu hiển thị của 3 biểu đồ còn lại [5, 6, 14].
*   **Actor:** Người dùng (Trader).
*   **Trigger:** Người dùng click vào một nút chọn khung thời gian trên một biểu đồ cụ thể [5, 6].
*   **Preconditions:** Grid 4 biểu đồ đang hiển thị hoạt động bình thường [5, 6].
*   **Main behavior:** Khi thay đổi khung thời gian trên một biểu đồ (ví dụ Chart 1: từ 5m chuyển sang 1h), hệ thống chỉ thực hiện ngắt luồng nhận giá của khung thời gian cũ, gửi yêu cầu lấy 1000 nến lịch sử của khung thời gian mới, vẽ lại đồ thị đó và đăng ký nhận WebSocket của khung thời gian mới cho riêng biểu đồ đó [5, 6].
*   **Steps:**
    1. Người dùng click chọn khung thời gian mới (ví dụ "1m" tại Chart 1) [5].
    2. Hệ thống dừng nhận luồng sự kiện realtime của timeframe cũ (5m) cho Chart 1 [6].
    3. Hệ thống gửi API request lên Backend để truy vấn lịch sử 1000 nến của timeframe mới (1m) [5].
    4. Backend trả về danh sách nến của timeframe mới, Frontend xóa dữ liệu nến cũ và vẽ lại nến mới cùng chỉ báo kỹ thuật liên quan của Chart 1 [6].
    5. Đăng ký luồng WebSocket realtime mới cho Chart 1 [6].
*   **Input:** ID biểu đồ cần đổi (Chart 1, 2, 3 hoặc 4), khung thời gian đích chọn từ danh sách (`1m`, `5m`, `15m`, `1h`, `4h`, `1d`) [5, 6, 14].
*   **Output:** Biểu đồ được lựa chọn thay đổi hiển thị dữ liệu nến theo khung thời gian mới mà không phải reload toàn bộ hệ thống [6, 14].
*   **Postconditions:** Đồ thị nến của biểu đồ được chọn hiển thị chính xác dữ liệu của timeframe mới [6].
*   **Business rules:** 
    *   Nếu thay đổi timeframe của Chart 1, tuyệt đối chỉ Chart 1 cần đổi dữ liệu và vẽ lại, 3 biểu đồ còn lại phải giữ nguyên trạng thái [6].
*   **Validation:** Các khung thời gian hỗ trợ chuyển đổi nhanh bao gồm: 1m, 5m, 15m, 1h, 4h [5].
*   **Exceptions & Error cases:** Không có.
*   **State changes:** Thay đổi trạng thái nội bộ (Active timeframe state) của biểu đồ tương ứng trên Frontend [5].
*   **Dependencies:** Phụ thuộc vào *Multi-Timeframe Realtime Chart Grid Rendering [6]*.
*   **Related functions:** *Realtime Market Data Streaming [1].*
*   **Sources & Locations:**
    *   `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 1, Mục 3 & Trang 4, Mục 5]
    *   `UI_5.jpg` [Source type: UI observation - Thanh công cụ chứa các nút chọn khung thời gian trên từng ô đồ thị]

---

## 5. Technical Indicator Calculation (Tính toán các chỉ báo kỹ thuật)
*   **Requirement / Function name:** Technical Indicator Calculation
*   **Description:** Hệ thống tự động tính toán các chỉ báo phân tích kỹ thuật phổ biến dựa trên dữ liệu giá nến lịch sử và thời gian thực để cung cấp tham số đầu vào cho Strategy Engine thực hiện tạo tín hiệu [6, 17].
*   **Actor:** Hệ thống Backend (Strategy Engine).
*   **Trigger:** Hệ thống nhận nến đóng cửa mới (Candle Closed) hoặc khi chạy Backtest trên dữ liệu quá khứ [1, 17].
*   **Preconditions:** Đã nạp thành công dữ liệu nến lịch sử hoặc nến thời gian thực hợp lệ vào bộ nhớ [1, 17].
*   **Main behavior:** Dựa trên cấu hình tham số của từng chỉ báo, hệ thống áp dụng các công thức toán học/tài chính định lượng để tính ra mảng giá trị của chỉ báo kỹ thuật tương ứng [17, 18].
*   **Steps:**
    1. Hệ thống tiếp nhận chuỗi giá nến lịch sử [1].
    2. *Tính toán Moving Average (MA):* Tính trung bình cộng giá đóng cửa của $N$ cây nến gần nhất (ví dụ: $N=20$ cho MA20, $N=50$ cho MA50) [5, 17].
    3. *Tính toán Relative Strength Index (RSI):* Đo lường mức độ biến động giá tương đối trong khoảng thời gian $P$ (ví dụ: $P=14$ nến) để đưa ra giá trị từ 0 đến 100 [17, 18].
    4. *Tính toán Bollinger Bands:* Tính đường trung bình động SMA ($N$), dải biên trên (Upper Band) và dải biên dưới (Lower Band) dựa trên độ lệch chuẩn (stdDev) của giá đóng cửa [4, 18].
    5. *Tính toán Support/Resistance:* Áp dụng thuật toán xác định các vùng giá lịch sử quan trọng mà tại đó giá thường ngừng giảm (Support) hoặc gặp khó khăn khi tăng tiếp (Resistance) [18].
    6. Trả về mảng giá trị chỉ báo kỹ thuật tương ứng [17].
*   **Input:** Chuỗi nến giá (OHLCV), các tham số cấu hình chỉ báo (ví dụ: RSI period = 14, BB stdDev = 2) [4, 5, 7].
*   **Output:** Mảng giá trị số đại diện cho các chỉ báo kỹ thuật theo thời gian [17].
*   **Postconditions:** Cung cấp thông tin chỉ báo đầy đủ cho Strategy Engine xử lý tạo tín hiệu giao dịch [17].
*   **Business rules:**
    *   Hệ thống phải hỗ trợ tối thiểu 4 chỉ báo cơ bản cho phiên bản MVP: MA, RSI, Bollinger Bands, Support/Resistance [12, 19].
    *   Tính toán chỉ báo phải được tách biệt hoàn toàn khỏi logic thực thi/giao dịch của chiến lược [20].
*   **Validation:** Tham số đầu vào (ví dụ: số nến $N$ để tính MA) phải là số nguyên dương và lớn hơn 1 [17].
*   **Exceptions & Error cases:** Nếu số lượng nến lịch sử được truyền vào ít hơn số chu kỳ cấu hình (ví dụ: truyền 10 nến nhưng cấu hình MA50), hệ thống không tính toán chỉ báo và trả về lỗi hoặc mảng trống [17].
*   **State changes:** Không có.
*   **Dependencies:** Phụ thuộc vào dữ liệu nến của *Realtime Market Data Streaming [1]* hoặc *Historical Backtesting Simulation [21]*.
*   **Related functions:** *Strategy Engine Signal Generation [17].*
*   **Sources & Locations:**
    *   `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 4, Mục 5 & Trang 4, Mục 7, 8, 9, 10]
    *   `project_full_description.pdf` [Trang 1, Mục 3 & Trang 1, Mục Strategy ví dụ]

---

## 6. LLM-Based Strategy Parsing (Phân tích cú pháp ngôn ngữ tự nhiên sinh chiến lược bằng LLM)
*   **Requirement / Function name:** LLM-Based Strategy Parsing
*   **Description:** Cho phép người dùng nhập mô tả chiến lược giao dịch bằng ngôn ngữ tự nhiên, hệ thống tự động sử dụng mô hình ngôn ngữ lớn (LLM) để phân tích, bóc tách và chuyển đổi thành định nghĩa chiến lược có cấu trúc chuẩn JSON [4, 11, 22].
*   **Actor:** Người dùng (Trader).
*   **Trigger:** Người dùng nhập prompt mô tả chiến lược và nhấn nút "Phân tích bằng LLM" [4].
*   **Preconditions:** Người dùng truy cập màn hình "Strategy Engine" [4]. Kết nối API đến LLM Service hoạt động bình thường [4].
*   **Main behavior:** Hệ thống gửi prompt của người dùng lên mô hình LLM, nhận phản hồi cấu trúc JSON, phân tích schema để bóc tách điều kiện LONG, điều kiện SHORT, quản trị rủi ro, khung thời gian áp dụng [4].
*   **Steps:**
    1. Người dùng nhập prompt mô tả chiến lược vào khung văn bản (ví dụ: "Khi RSI dưới 30 và giá nằm dưới Bollinger Lower Band thì LONG. Stop loss 2%, take profit 4%.") [4].
    2. Người dùng bấm nút "Phân tích bằng LLM" [4].
    3. Hệ thống gửi yêu cầu kèm prompt lên dịch vụ LLM Service [4].
    4. Mô hình LLM xử lý phân tích ngữ nghĩa, trả về chuỗi JSON cấu trúc định nghĩa chiến lược [4].
    5. Hệ thống phân tích chuỗi JSON nhận được, hiển thị tóm tắt kết quả phân tích trực quan lên màn hình (Điều kiện LONG, Điều kiện SHORT, Quản trị rủi ro, Khung thời gian áp dụng, Cặp coin áp dụng) [4].
*   **Input:** Chuỗi văn bản prompt ngôn ngữ tự nhiên của người dùng (tối đa 1000 ký tự) [4].
*   **Output:** Cấu trúc JSON chuẩn hóa chứa các trường: `name`, `version`, `description`, `indicators`, `conditions` (long, short), `riskManagement` (stoploss, takeProfit), `timeframe`, `applicability` (pairs, market) [4].
*   **Postconditions:** Định nghĩa chiến lược hiển thị trực quan lên giao diện dưới dạng JSON để người dùng rà soát [4].
*   **Business rules:**
    *   Hệ thống không được tự suy diễn thông tin ngoài prompt. Nếu thiếu tham số quản trị rủi ro hoặc chỉ báo, hệ thống phải báo rõ trong phần Validation [4].
*   **Validation:** Hệ thống tự động kiểm tra cú pháp JSON trả về từ LLM để đảm bảo đúng schema cấu trúc chiến lược giao dịch [4].
*   **Exceptions & Error cases:** 
    *   *LLM Service quá tải hoặc trả về lỗi:* Hệ thống hiển thị thông báo lỗi "Không thể phân tích bằng LLM, vui lòng thử lại sau" [4].
    *   *LLM trả về định dạng sai cú pháp:* Giao diện cảnh báo lỗi cú pháp cấu trúc và yêu cầu người dùng tinh chỉnh prompt [4].
*   **State changes:** Giao diện cập nhật hiển thị kết quả phân tích chiến lược chi tiết [4].
*   **Dependencies:** Phụ thuộc vào dịch vụ LLM API bên ngoài [4].
*   **Related functions:** *Strategy Schema Verification & Save Strategy [4], Website Script Strategy Extraction [4].*
*   **Sources & Locations:**
    *   `779956509_2019220255455531_248486056450237423_n.jpg` [Trang 1, dòng 21-22 - "Người dùng có thể nhập ngôn ngữ tự nhiên... Hệ thống tự động chuyển đổi thành strategy đơn/đa"]
    *   `UI_4.jpg` [Source type: UI observation - Toàn bộ màn hình tạo chiến lược từ Prompt, hiển thị ô nhập prompt, kết quả phân tích của LLM và mã JSON sinh ra]

---

## 7. Website Script Strategy Extraction (Trích xuất chiến lược từ mã nguồn liên kết website)
*   **Requirement / Function name:** Website Script Strategy Extraction
*   **Description:** Cho phép người dùng dán liên kết trang web (như TradingView, Blogger, Medium, GitHub Gist) chứa mã nguồn script chiến lược, hệ thống tự động bóc tách mã nguồn và chuyển đổi thành định nghĩa chiến lược chuẩn JSON [4].
*   **Actor:** Người dùng (Trader).
*   **Trigger:** Người dùng dán link URL và nhấn nút "Trích xuất từ website" [4].
*   **Preconditions:** Người dùng mở màn hình "Strategy Engine" [4]. Liên kết URL hợp lệ và có thể truy cập công khai [4].
*   **Main behavior:** Hệ thống tải nội dung HTML của liên kết dán vào, bóc tách đoạn mã script chiến lược nằm bên trong trang, phân tích logic các điều kiện giao dịch bằng mô hình AI và sinh ra tệp JSON chiến lược chuẩn [4].
*   **Steps:**
    1. Người dùng nhập link URL chiến lược vào ô nhập liệu (ví dụ: `https://www.tradingview.com/script/abc123-example/`) [4].
    2. Người dùng nhấn nút "Trích xuất từ website" [4].
    3. Backend tải nội dung trang web từ URL [4].
    4. Hệ thống trích xuất mã nguồn kịch bản giao dịch (ví dụ: Pine Script của TradingView) [4].
    5. Sử dụng bộ phân tích chuyển đổi mã nguồn thành các điều kiện LONG, SHORT, Quản trị rủi ro định dạng JSON [4].
    6. Hiển thị kết quả cấu trúc JSON trích xuất được lên màn hình [4].
*   **Input:** Đường dẫn URL website chứa chiến lược giao dịch [4].
*   **Output:** Tệp cấu trúc JSON chiến lược chuẩn hóa và hiển thị tóm tắt chiến lược đã phân tích [4].
*   **Postconditions:** Chiến lược được chuyển dịch thành công sang JSON và hiển thị trên màn hình [4].
*   **Business rules:** 
    *   Hệ thống hỗ trợ trích xuất tự động từ các nguồn nền tảng lớn được định nghĩa trước: TradingView, Blogger, Medium, GitHub Gist, Docs [4].
*   **Validation:** Hệ thống tự động kiểm tra liên kết URL có đúng cấu trúc định dạng link internet hay không trước khi gửi yêu cầu bóc tách [4].
*   **Exceptions & Error cases:** 
    *   *Không truy cập được URL (Lỗi 404, 403, hết thời gian chờ kết nối):* Hệ thống hiển thị cảnh báo lỗi "Không thể truy cập liên kết website được cung cấp" [4].
    *   *Không phát hiện mã nguồn script chiến lược tương thích trong trang:* Giao diện báo lỗi "Không tìm thấy mã nguồn chiến lược hợp lệ tại liên kết này" [4].
*   **State changes:** Trạng thái giao diện cập nhật hiển thị kết quả bóc tách chiến lược [4].
*   **Dependencies:** Phụ thuộc vào dịch vụ internet để lấy nội dung web và AI engine để phân tích mã [4].
*   **Related functions:** *LLM-Based Strategy Parsing [4], Strategy Schema Verification & Save Strategy [4].*
*   **Sources & Locations:**
    *   `UI_4.jpg` [Source type: UI observation - Vùng nhập URL chiến lược hỗ trợ TradingView, Blogger, Medium, Gist]

---

## 8. Strategy Schema Verification & Saving (Kiểm tra kiểm định và Lưu chiến lược vào thư viện)
*   **Requirement / Function name:** Strategy Schema Verification & Save Strategy
*   **Description:** Thực hiện kiểm tra tính toàn vẹn dữ liệu, kiểm định logic nghiệp vụ của chiến lược JSON vừa tạo, và cho phép người dùng đặt tên, phiên bản, gắn tag để lưu trữ chiến lược này vào Thư viện chiến lược hệ thống (Strategy Library) [4, 23].
*   **Actor:** Người dùng (Trader).
*   **Trigger:** Người dùng nhấn nút "Lưu Strategy" ở cuối màn hình [4].
*   **Preconditions:** Đã có kết quả JSON cấu trúc chiến lược sinh ra từ LLM hoặc Trích xuất website [4].
*   **Main behavior:** Hệ thống chạy bộ xác thực Validation để kiểm định 3 tiêu chí chính: "Thiếu trường bắt buộc", "Kiểm tra logic hợp lệ", "Chỉ báo hỗ trợ". Nếu vượt qua, trạng thái chiến lược chuyển sang "Hợp lệ" màu xanh lá, kích hoạt nút "Lưu Strategy" ghi nhận vào MySQL database [3, 4].
*   **Steps:**
    1. Hệ thống tự động rà soát file JSON chiến lược và hiển thị tích xanh kiểm định tại ô "Kiểm tra & Validation" [4].
    2. Người dùng xem danh sách lỗi nếu có để sửa đổi [4].
    3. Người dùng nhập Tên chiến lược, số phiên bản (mặc định hiển thị `1.0.0`), gắn các thẻ Tag phân loại (ví dụ: `RSI`, `Bollinger`, `Long`, `Mean Reversion`), và chọn nguồn nhập (Source: ví dụ `USER_PROMPT`) [4].
    4. Người dùng bấm nút "Lưu Strategy" [4].
    5. Backend thực hiện lưu trữ thông tin chiến lược vào MySQL Database [3, 4].
    6. Thêm chiến lược mới lưu vào danh sách "Chiến lược đã import gần đây" ở phía dưới giao diện [4].
*   **Input:** Cấu trúc JSON chiến lược, thông tin nhập của người dùng (Name, Version, Tags, Source) [4].
*   **Output:** Bản ghi chiến lược lưu trữ thành công trong hệ thống, thông báo lưu thành công hiển thị cho người dùng [3, 4].
*   **Postconditions:** Chiến lược sẵn sàng được lựa chọn sử dụng trong Strategy Engine để chạy backtest hoặc tìm kiếm kết hợp [4, 24].
*   **Business rules:**
    *   *Yêu cầu về Version:* Mỗi chiến lược khi lưu trữ bắt buộc phải có thông số quản lý phiên bản (version), không được phép ghi đè (overwrite) lên kết quả phiên bản cũ để đảm bảo tính tái lập của thực nghiệm (Reproducibility) [9, 23].
*   **Validation:** 
    *   *Kiểm tra trường bắt buộc:* Rà soát các tham số core (như Name, Conditions, Indicators) [4].
    *   *Kiểm tra logic:* Đảm bảo các toán tử so sánh logic (như `<`, `>`, `=`) và giá trị so khớp trong điều kiện là hợp lệ nghiệp vụ [4].
    *   *Chỉ báo hỗ trợ:* Đảm bảo các chỉ báo khai báo trong chiến lược phải nằm trong danh mục chỉ báo hệ thống hỗ trợ tính toán [4].
*   **Exceptions & Error cases:** 
    *   *Không vượt qua kiểm định:* Nút "Lưu Strategy" bị vô hiệu hóa, hiển thị cảnh báo đỏ tại trường bị lỗi kiểm định [4].
*   **State changes:** Giao diện cập nhật danh sách "Chiến lược đã import gần đây" [4].
*   **Dependencies:** Phụ thuộc vào *Database MySQL* để lưu trữ thông tin lâu dài [3, 4].
*   **Related functions:** *Historical Backtesting Simulation [21], Strategy Registration [24].*
*   **Sources & Locations:**
    *   `project_full_description.pdf` [Trang 2, Mục Version Strategy]
    *   `UI_4.jpg` [Source type: UI observation - Toàn bộ vùng hiển thị "Kiểm tra & Validation", vùng nhập thông tin đặt tên lưu và bảng "Chiến lược đã import gần đây"]

---

## 9. Strategy Registration (Đăng ký chiến lược mới thông qua Plugin Engine)
*   **Requirement / Function name:** Strategy Registration
*   **Description:** Cho phép các nhà phát triển bổ sung các class thuật toán chiến lược mới vào Strategy Engine thông qua cơ chế Plugin/Registry một cách dễ dàng mà không cần phải can thiệp hay sửa đổi mã nguồn cốt lõi hiện có của hệ thống [24, 25].
*   **Actor:** Nhà phát triển / Người vận hành hệ thống (System Developer / Operator).
*   **Trigger:** Hệ thống khởi chạy hoặc khi nhà phát triển tiến hành đăng ký chiến lược mới vào mã nguồn [24, 26].
*   **Preconditions:** Class chiến lược mới phải được viết kế thừa đúng từ lớp giao diện trừu tượng `Strategy` interface và triển khai phương thức `analyze(context)` [17, 24].
*   **Main behavior:** Lớp quản lý đăng ký chiến lược `StrategyRegistry` tiếp nhận đăng ký class mới, ghi nhận vào danh sách chiến lược hiện có của Strategy Engine để sẵn sàng gọi thực thi khi cần [24, 27].
*   **Steps:**
    1. Nhà phát triển viết mã nguồn cho class chiến lược mới (ví dụ: `class MACDStrategy implements Strategy`) [27].
    2. Nhà phát triển gọi câu lệnh đăng ký class mới với hệ thống Registry (ví dụ: `StrategyRegistry.register(MACDStrategy)`) [25, 27].
    3. Strategy Engine tự động nhận biết, cập nhật danh sách chiến lược khả dụng mà không phải sửa đổi các đoạn code cấu trúc dạng rẽ nhánh điều kiện `if-else` phức tạp kiểu cũ [10, 24, 27].
*   **Input:** Đối tượng Class chiến lược mới thực thi giao diện `Strategy` [17, 27].
*   **Output:** Thư viện Strategy Engine ghi nhận thêm một chiến lược hoạt động mới [24].
*   **Postconditions:** Chiến lược mới xuất hiện trong danh mục lựa chọn chiến lược của người dùng trên UI [24, 27].
*   **Business rules (Mở rộng linh hoạt):**
    *   Việc thêm chiến lược mới (ví dụ: MACD Strategy) tuyệt đối không được yêu cầu sửa đổi các module hiện có khác (như Backtester, Evaluator, UI...) [3, 24, 28].
    *   Tránh thiết kế Hard-coded Strategy rẽ nhánh kiểu `if MA && RSI ... else if MA && Bollinger...` [10].
*   **Validation:** Kiểm tra class đăng ký có triển khai đúng interface `Strategy` và trả về các nhãn tín hiệu chuẩn hóa quy định hay không [17, 27].
*   **Exceptions & Error cases:** Không có.
*   **State changes:** Thay đổi danh sách các class chiến lược đăng ký hoạt động trong bộ nhớ ứng dụng [24, 27].
*   **Dependencies:** Phụ thuộc vào interface cấu trúc `Strategy` và lớp quản lý `StrategyRegistry` [24, 27].
*   **Related functions:** *Technical Indicator Calculation [17], Composite Strategy Combination [29].*
*   **Sources & Locations:**
    *   `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 4, Mục 6 & Trang 4, Mục 12 & Trang 7, Mục 32.1, 41]
    *   `project_full_description.pdf` [Trang 1, Mục Module 4 & Trang 2, Mục Modifiability, Hard-coded Strategy]

---

## 10. Composite Strategy Combination (Kết hợp chiến lược phức hợp bằng biểu quyết hoặc trọng số)
*   **Requirement / Function name:** Composite Strategy Combination
*   **Description:** Thực hiện kết hợp tín hiệu giao dịch từ nhiều chiến lược đơn lẻ (MA, RSI, Bollinger Bands, Support/Resistance) để tạo ra một chiến lược tổng hợp (Composite Strategy) duy nhất bằng phương pháp Biểu quyết đa số (Majority Vote) hoặc tính điểm Trọng số (Weighted Score) [11, 25, 29, 30].
*   **Actor:** Người dùng (Trader) cấu hình qua UI, Hệ thống tự động thực hiện tính toán.
*   **Trigger:** Người dùng click chọn các chiến lược cần kết hợp và thay đổi trọng số [29, 31].
*   **Preconditions:** Các chiến lược đơn lẻ được chọn đều hoạt động bình thường trong thư viện [24, 31].
*   **Main behavior:** Hệ thống thu thập tín hiệu đầu ra chuẩn hóa (BUY = +1, HOLD = 0, SELL = -1) từ các chiến lược thành phần, áp dụng công thức kết hợp để tính ra điểm số tổng hợp cuối cùng, từ đó đưa ra tín hiệu tổng hợp duy nhất cho chiến lược phức hợp [17, 29-31].
*   **Steps:**
    1. Người dùng chọn các chiến lược đơn lẻ cần kết hợp trong lưới "Chọn các strategy để kết hợp" (ví dụ: chọn MA, RSI, Support/Resistance) [31].
    2. *Nếu dùng Weighted Voting:* Người dùng điều chỉnh thanh trượt trọng số (slider) cho từng chỉ báo thành phần (ví dụ: MA trọng số 0.40, RSI trọng số 0.30, Support/Resistance trọng số 0.30) [30, 31].
    3. Hệ thống chạy Strategy Engine để thu thập tín hiệu từ từng chiến lược thành phần tại điểm nến xem xét [17, 29].
    4. *Tính toán tín hiệu tổng hợp:* Áp dụng công thức tính điểm $Score = \sum (Signal \times Weight)$ [30, 31].
    5. Đưa ra tín hiệu giao dịch tổng hợp dựa trên ngưỡng giá trị điểm số (ví dụ: điểm $\ge 0.30 \rightarrow$ LONG/BUY; điểm $\le -0.30 \rightarrow$ SHORT/SELL; còn lại $\rightarrow$ HOLD) [30, 31].
    6. Trực quan hóa giá trị điểm số LONG, HOLD, SHORT tức thời lên màn hình [31].
*   **Input:** Danh sách các chiến lược đơn lẻ được chọn, hệ số trọng số tương ứng của từng chiến lược [29-31].
*   **Output:** Điểm số kết hợp tổng hợp ($Score$) và Nhãn tín hiệu tổng kết cuối cùng (BUY/SELL/HOLD hoặc LONG/SHORT/NONE) [17, 30, 31].
*   **Postconditions:** Chiến lược phức hợp được tạo ra sẵn sàng để lưu trữ hoặc thực thi kiểm thử Backtest [14, 31].
*   **Business rules:**
    *   *Ngưỡng vào lệnh quy định:* Chỉ vào lệnh LONG (BUY) khi điểm số tổng hợp $|score| \ge 0.30$ [30, 31].
*   **Validation:** Tổng các trọng số cấu hình của các chiến lược thành phần phải nằm trong phạm vi cho phép (thường chuẩn hóa tổng bằng 1.00) [30, 31].
*   **Exceptions & Error cases:** Không có.
*   **State changes:** Cập nhật nhãn tín hiệu hiển thị và trị số điểm của mục "Tín hiệu tổng hợp hiện tại" theo thời gian thực [31].
*   **Dependencies:** Phụ thuộc vào *Strategy Engine Signal Generation* của các chiến lược đơn lẻ [17, 31].
*   **Related functions:** *Strategy Registration [24], Historical Backtesting Simulation [21].*
*   **Sources & Locations:**
    *   `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 1, Mục 2 & Trang 5, Mục 13, 14]
    *   `project_full_description.pdf` [Trang 1, Mục Module 5]
    *   `UI_1.jpg` [Source type: UI observation - Toàn bộ phân vùng cấu hình "Strategy kết hợp", bảng thiết lập "Weighted Voting" và ô hiển thị "Tín hiệu tổng hợp hiện tại"]

---

## 11. Strategy Discovery/Search Loop Execution (Tìm kiếm tối ưu hóa tổ hợp chiến lược ứng viên)
*   **Requirement / Function name:** Strategy Discovery/Search Loop Execution
*   **Description:** Tự động sinh ra hàng loạt tổ hợp chiến lược khác nhau từ không gian tìm kiếm và thử nghiệm chúng qua hệ thống để tìm ra các biến thể chiến lược hoạt động tối ưu nhất bằng các phương pháp Random Search, Domain-guided Search hoặc Genetic Search [21, 30, 31].
*   **Actor:** Người dùng (Trader) kích hoạt qua UI, Hệ thống tự chạy tự động.
*   **Trigger:** Người dùng click vào nút "START SEARCH" trong giao diện Discovery [31].
*   **Preconditions:** Đã cấu hình không gian tìm kiếm (các chỉ báo đơn lẻ được chọn làm biến thành phần và dải tham số cấu hình của chúng) [30, 31].
*   **Main behavior:** Công cụ Strategy Generator tự động sinh ngẫu nhiên hoặc theo tri thức nghiệp vụ các tổ hợp chiến lược ứng viên (candidates), chuyển sang Job Queue để các worker thực hiện chạy backtest song song và chấm điểm hiệu năng [21, 31-33].
*   **Steps:**
    1. Người dùng chọn phương pháp Discovery từ danh sách: **Random Search** (sinh ngẫu nhiên các biến thể), **Domain-guided Search** (tìm kiếm dựa trên kiến thức và ràng buộc nghiệp vụ), hoặc **Genetic Search** (tiến hóa qua chọn lọc và lai ghép) [21, 31].
    2. Người dùng nhấn nút "START SEARCH" [31].
    3. Hệ thống bắt đầu sinh các chiến lược ứng viên (Candidate Strategy) [9, 21, 33].
    4. Gửi các candidates vào hàng đợi công việc (Strategy Queue) [31, 33].
    5. Hiển thị tiến trình Discovery tức thời lên màn hình (ví dụ: Iteration hiện tại, số lượng candidates đã kiểm tra, chiến lược tốt nhất phát hiện được kèm mức lợi nhuận và winrate tương ứng) [31].
*   **Input:** Phương pháp tìm kiếm được chọn, cấu hình không gian tham số, dữ liệu nến lịch sử [21, 31].
*   **Output:** Danh sách các chiến lược ứng viên tối ưu được tạo ra liên tục và gửi đi backtest [9, 21, 31].
*   **Postconditions:** Sinh ra các sự kiện cập nhật để kích hoạt luồng backtest và chấm điểm [31, 34].
*   **Business rules:**
    *   *Domain-guided Search Rule:* Để tránh tìm kiếm mù quáng, phương pháp Domain-guided Search phải áp dụng cấu trúc ràng buộc nghiệp vụ cụ thể để sinh chiến lược phức hợp: Bắt buộc chọn đúng **1 Trend Strategy** + **1 Momentum Strategy** + **1 Structure Strategy** để kết hợp thành một candidate hợp lệ [21, 31].
*   **Validation:** Không được sinh trùng lặp các candidate có bộ tham số giống hệt nhau đã từng được chạy thử nghiệm trước đó [9, 23].
*   **Exceptions & Error cases:** Không có.
*   **State changes:** Tiến trình hiển thị cập nhật tăng dần số lượng candidates đã kiểm tra, thay đổi tên của "Best strategy so far" khi tìm thấy biến thể tốt hơn [31].
*   **Dependencies:** Phụ thuộc vào *Continuous Automated Search Loop [35]* và *Historical Backtesting Simulation [21]*.
*   **Related functions:** *Composite Strategy Combination [29], Leaderboard Ranking [36].*
*   **Sources & Locations:**
    *   `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 1, Mục 2 & Trang 5, Mục 15, 16, 17, 18 & Trang 7, Mục 33, 42]
    *   `project_full_description.pdf` [Trang 1, Mục Module 6]
    *   `UI_1.jpg` [Source type: UI observation - Vùng chọn "Phương pháp Discovery" và vùng tiến độ "Tiến trình Discovery"]

---

## 12. Historical Backtesting Simulation (Giả lập kiểm thử giao dịch trên dữ liệu lịch sử)
*   **Requirement / Function name:** Historical Backtesting Simulation
*   **Description:** Thực hiện giả lập hoạt động mua bán của một hoặc nhiều chiến lược cụ thể trên dữ liệu nến lịch sử của một cặp coin trong quá khứ để đo lường, tính toán các chỉ số tài chính hiệu năng của chiến lược đó [11, 16, 20, 21, 37].
*   **Actor:** Người dùng (Trader) yêu cầu trực tiếp, hoặc các Backtest Workers chạy tự động ngầm trong vòng lặp Discovery [16, 32, 33].
*   **Trigger:** Người dùng click nút "Backtest ngay" [31], hoặc thiết lập tham số trong màn hình Backtest và nhấn chạy [16], hoặc hệ thống phân phối tác vụ từ hàng đợi Job Queue [32, 33].
*   **Preconditions:** Đã tải và chuẩn bị đầy đủ mảng dữ liệu nến lịch sử (Historical data) của khoảng thời gian kiểm thử yêu cầu [1, 16]. Chiến lược kiểm thử đã được đăng ký hợp lệ [16, 24].
*   **Main behavior:** Trình giả lập Backtester chạy tuần tự qua từng cây nến lịch sử, gọi Strategy Engine để lấy tín hiệu giao dịch, khớp lệnh mua/bán giả định dựa trên giá đóng cửa, ghi nhận nhật ký giao dịch (trades), tính toán phí giao dịch, độ trượt giá và tổng hợp ra các chỉ số tài chính đánh giá hiệu quả cuối cùng [16, 20].
*   **Steps:**
    1. Người dùng chọn cặp giao dịch (Pair: `BTCUSDT`), Khung thời gian (Timeframe: `5m`), Khoảng thời gian kiểm thử (From date - To date), số Vốn đầu tư ban đầu (Vốn USD: mặc định `100`), chọn Chiến lược cần chạy Backtest (Strategy: ví dụ `MA Crossover`), nhập tỷ lệ Phí giao dịch (Transaction Cost: ví dụ `0.08%`), và mức Trượt giá (Slippage: ví dụ `5 bps`) [16, 37].
    2. Người dùng nhấn nút kích hoạt chạy kiểm thử [16, 31].
    3. Hệ thống Backtester tải dữ liệu nến lịch sử trong khoảng thời gian yêu cầu [1, 16].
    4. Giả lập chạy qua từng cây nến lịch sử [20]:
        * Tại mỗi cây nến, gọi hàm kiểm tra tín hiệu của chiến lược [17, 20].
        * Nếu xuất hiện tín hiệu BUY/LONG: Thực hiện khớp lệnh LONG Entry giả lập, ghi nhận giá mua tại điểm giá kết thúc cây nến (hoặc theo quy tắc OHLC), trừ phí giao dịch và độ trượt giá [16, 20, 37].
        * Nếu xuất hiện tín hiệu SELL/SHORT: Khớp lệnh Entry SHORT giả lập hoặc đóng lệnh LONG hiện có [16, 20, 37].
        * Áp dụng quy tắc chốt lời (Take Profit) và cắt lỗ (Stop Loss) tự động nếu được cấu hình [4, 16].
    5. Sau khi giả lập đi qua hết chuỗi nến lịch sử, Evaluator tiến hành tính toán các thông số tài chính tổng hợp gồm: **Winrate (%)**, số lệnh thắng (**Wins**), số lệnh thua (**Losses**), tổng lợi nhuận (**Total Profit / Return**), mức sụt giảm tài sản lớn nhất (**Max Drawdown (%)**), tổng số lệnh đã thực hiện (**Total Trades**), **Profit Factor**, và **Sharpe Ratio** [16, 20].
    6. Sinh ra danh sách chi tiết các lệnh giao dịch (Bảng danh sách lệnh giao dịch chứa: Pair, thời gian vào lệnh, Hướng lệnh LONG/SHORT, giá vào lệnh, giá Stoploss, giá TakeProfit, giá kết thúc lệnh, phí giao dịch, độ trượt giá, và lợi nhuận ròng thực tế của từng lệnh) [15, 16, 37].
*   **Input:** Cấu hình tham số backtest (Pair, Timeframe, From-To date, Vốn USD, Strategy, Phí giao dịch %, Slippage bps) [16, 37].
*   **Output:** Danh sách các lệnh giao dịch lịch sử và Bộ metrics kết quả đánh giá tài chính (Lợi nhuận, Winrate, Max Drawdown, Số lượng lệnh, Sharpe, Profit Factor) [16, 20, 37].
*   **Postconditions:** Kết quả backtest được hiển thị trực quan lên UI và đồng thời lưu trữ vào MySQL Database làm kết quả thực nghiệm lâu dài [3, 16].
*   **Business rules:**
    *   *Yêu cầu về Vốn giả lập mặc định:* Khi chạy backtest qua UI, hệ thống áp dụng mốc vốn ban đầu mặc định là 100 USD [16, 37].
    *   *Tách biệt thiết kế:* Module đánh giá chiến lược (Strategy Evaluation) phải được thiết kế tách biệt hoàn toàn khỏi phần cài đặt chiến lược (Strategy Implementation) để đảm bảo tính dễ bảo trì [20].
    *   *Tính tái lập (Reproducibility):* Kết quả thực nghiệm backtest phải lưu trữ chính xác phiên bản chiến lược cụ thể đã sử dụng, đảm bảo chạy lại cùng tham số trên cùng dữ liệu lịch sử phải cho ra kết quả giống hệt nhau [9, 16, 23].
    *   *Giả định Backtest thực tế:* Cho phép người dùng tùy chọn bật/tắt các quy tắc: "Hỗ trợ cả LONG và SHORT", "Xử lý SL/TP theo giá thực tế (OHLC)" [16].
*   **Validation:** Khoảng thời gian kiểm thử (From date, To date) phải là các ngày hợp lệ, ngày bắt đầu phải nhỏ hơn ngày kết thúc [16].
*   **Exceptions & Error cases:** Nếu trong khoảng thời gian yêu cầu không có dữ liệu nến nào được lưu trữ, hệ thống báo lỗi "Không tìm thấy dữ liệu nến lịch sử trong khoảng thời gian đã chọn" [16].
*   **State changes:** Giao diện cập nhật các ô chỉ số kết quả (Winrate, Total Profit, Max Drawdown, Total Trades) và vẽ lại biểu đồ đường cong tăng trưởng tài sản [16].
*   **Dependencies:** Phụ thuộc vào MySQL Database chứa dữ liệu nến lịch sử [1, 3].
*   **Related functions:** *Backtest Trade Visualizer on Candlestick Chart [15, 16], Leaderboard Ranking [36].*
*   **Sources & Locations:**
    *   `773981388_1629771268733623_2672886499038526550_n.jpg` [Toàn bộ nội dung ảnh - dòng 19-25: "19 Backtest... Chọn pair, Chọn thời gian, Chọn vốn 100$, Chọn strategy... Output: Bảng kết quả"]
    *   `778426143_3961774807465063_4066970941457598332_n.jpg` [Toàn bộ nội dung ảnh - dòng 25-34: "Output: Bảng kết quả... Pair/Coin, Thời gian vào lệnh, Hướng LONG/SHORT, Khối lượng USD, Giá vào, Stoploss, TakeProfit, Giá kết thúc, Profit"]
    *   `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 1, Mục 2 & Trang 5, Mục 19, 20 & Trang 7, Mục 33]
    *   `project_full_description.pdf` [Trang 1, Mục Module 7 & Trang 2, Mục Performance]
    *   `UI_2.jpg` [Source type: UI observation - Toàn bộ màn hình chạy Backtest và Kết quả giao dịch]

---

## 13. Leaderboard Ranking and Updating (Cập nhật bảng xếp hạng chiến lược)
*   **Requirement / Function name:** Leaderboard Ranking and Updating
*   **Description:** Quản lý danh sách xếp hạng các chiến lược tốt nhất (Top K, mặc định K=10) dựa trên điểm số tổng hợp (Overall Score) được chấm bởi Evaluator. Bảng xếp hạng tự cập nhật thời gian thực mà không cần reload trang khi xuất hiện chiến lược mới có điểm số vượt ngưỡng [25, 31, 35, 36].
*   **Actor:** Hệ thống tự động (Ranking Service / Leaderboard Service) [34].
*   **Trigger:** Hệ thống phát ra sự kiện `StrategyEvaluatedEvent` hoặc `LEADERBOARD_UPDATED` sau khi hoàn tất một lượt backtest của candidate [34].
*   **Preconditions:** Chiến lược ứng viên vừa hoàn tất chạy backtest thành công và có đầy đủ bộ metrics đánh giá hiệu năng [20, 36].
*   **Main behavior:** Ranking Service nhận kết quả đánh giá, tính điểm Overall Score của candidate theo công thức quy định. Nếu điểm số của ứng viên cao hơn điểm của chiến lược đứng vị trí thứ K hiện tại trên Leaderboard, hệ thống sẽ đưa ứng viên mới vào danh sách xếp hạng, loại bỏ chiến lược cũ ở cuối bảng, sắp xếp lại và phát sự kiện cập nhật giao diện thời gian thực [34-36].
*   **Steps:**
    1. Khi nhận sự kiện `StrategyEvaluatedEvent`, Ranking Service lấy metrics hiệu năng của chiến lược vừa được test [34].
    2. *Tính điểm xếp hạng tổng hợp:* Áp dụng công thức tính điểm Overall Score:
       $$Score = 0.5 \times Return + 0.2 \times WinRate + 0.3 \times RiskScore$$
       (hoặc theo phân bổ hiển thị trên UI: Return, Winrate, Max Drawdown) [31, 36].
    3. Hệ thống so sánh điểm số tính được với điểm số của chiến lược xếp thứ 10 (vị trí cuối bảng xếp hạng hiện tại) [35, 36].
    4. *Nếu điểm của chiến lược mới cao hơn:* Hệ thống ghi nhận chiến lược mới vào MySQL Database của bảng xếp hạng, tiến hành loại bỏ chiến lược thứ 10 cũ ra khỏi danh sách hiển thị Top-10 [35, 36].
    5. Hệ thống Backend phát đi sự kiện `LEADERBOARD_UPDATED` [34].
    6. Frontend lắng nghe sự kiện, tự cập nhật danh sách Top-5 hoặc Top-10 hiển thị trên Leaderboard thời gian thực mà người dùng không cần reload trang [14, 31, 34].
*   **Input:** Metrics hiệu năng của chiến lược ứng viên, Danh sách Top-10 chiến lược hiện tại trên Leaderboard [36].
*   **Output:** Bảng xếp hạng Leaderboard được cập nhật và hiển thị trực tuyến [31, 36].
*   **Postconditions:** Giao diện hiển thị chính xác danh sách các chiến lược dẫn đầu có hiệu năng cao nhất [31].
*   **Business rules:**
    *   *Quy mô giới hạn xếp hạng (Top K):* Leaderboard chỉ lưu giữ và hiển thị Top K tốt nhất, mặc định cấu hình K = 10 [8, 36].
    *   *Điều kiện cập nhật (Threshold):* Một candidate mới chỉ được phép đưa vào Leaderboard nếu điểm số tổng hợp của nó vượt qua ngưỡng điểm của chiến lược xếp ở vị trí thứ K hiện hành [8, 35, 36].
*   **Validation:** Không có.
*   **Exceptions & Error cases:** Không có.
*   **State changes:** Cập nhật bảng xếp hạng trong Database, cập nhật mảng danh sách Top-10 hiển thị trên màn hình [34, 36].
*   **Dependencies:** Phụ thuộc vào *Historical Backtesting Simulation [21]* và sự kiện Event-driven của hệ thống [8, 34].
*   **Related functions:** *Continuous Automated Search Loop [35].*
*   **Sources & Locations:**
    *   `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 5, Mục 21, 22 & Trang 7, Mục 33, 34]
    *   `project_full_description.pdf` [Trang 1, Mục Module 8 & Trang 2, Mục Top-K Leaderboard]
    *   `UI_1.jpg` [Source type: UI observation - Bảng xếp hạng "Leaderboard (Top strategies)" hiển thị Top-5 chiến lược dẫn đầu]

---

## 14. Continuous Automated Search Loop (Vòng lặp tìm kiếm chiến lược tự động liên tục)
*   **Requirement / Function name:** Continuous Automated Search Loop
*   **Description:** Điều phối quy trình tự động hóa khép kín chạy ngầm liên tục trong hệ thống: Tự động sinh chiến lược (Generate) $\rightarrow$ Chạy giả lập (Backtest) $\rightarrow$ Đánh giá hiệu năng (Evaluate) $\rightarrow$ Xếp hạng (Rank) $\rightarrow$ Cập nhật bảng xếp hạng (Leaderboard) cho đến khi đáp ứng đúng điều kiện dừng (Stop Condition) [2, 28, 35].
*   **Actor:** Hệ thống tự động Backend (Continuous Loop Scheduler / Worker Pool) [2, 28].
*   **Trigger:** Người dùng bấm khởi chạy tiến trình Discovery Search qua UI [31].
*   **Preconditions:** Đã thiết lập cấu hình và dải không gian tham số cho vòng lặp, đồng thời xác lập Stop Condition hợp lệ [2, 31].
*   **Main behavior:** Scheduler liên tục thực thi vòng lặp lặp đi lặp lại các tác vụ sinh, kiểm thử và xếp hạng chiến lược mà không bị lỗi vòng lặp vô hạn gây treo hệ thống, đồng thời hỗ trợ người dùng có thể thực hiện Pause, Resume, hoặc giám sát tiến trình trực quan [2, 10].
*   **Steps:**
    1. Trình điều phối Scheduler kích hoạt vòng lặp [2].
    2. Gọi `StrategyGenerator` sinh ra chiến lược ứng viên [2, 9].
    3. Đưa candidate vào hàng đợi Backtest Worker xử lý [2, 34].
    4. Evaluator tính toán metrics và Ranking Service thực hiện cập nhật Leaderboard nếu đủ điều kiện [2, 34].
    5. *Kiểm tra Stop Condition:* Hệ thống rà soát xem lượt chạy hiện tại đã thỏa mãn một trong các điều kiện dừng cấu hình sẵn hay chưa [2, 8]:
        * Đã kiểm định đủ số lượng ứng viên tối đa (ví dụ: chạy đủ 100 hoặc 500 candidates) [8, 31].
        * Đã hết thời gian tối đa chạy vòng lặp (ví dụ: vòng lặp chạy liên tục hết mốc 1 giờ) [8].
        * Đạt giới hạn số vòng lặp không tìm thấy kết quả cải thiện tốt hơn (ví dụ: chạy 50 iterations liên tiếp mà vị trí Top 1 không thay đổi) [8].
    6. Nếu thỏa mãn điều kiện dừng: Scheduler dừng thực thi vòng lặp ngầm, chuyển trạng thái vòng lặp sang "Hoàn thành" [2]. Nếu chưa thỏa mãn: Tiếp tục quay lại Bước 2 để chạy iteration tiếp theo [2].
*   **Input:** Các cấu hình Stop Conditions, danh mục chiến lược đơn lẻ được chọn, dữ liệu thị trường [2, 8].
*   **Output:** Vòng lặp được quản lý hoạt động ổn định, dừng chính xác khi đạt điều kiện cấu hình [2].
*   **Postconditions:** Hệ thống ghi nhận toàn bộ lịch sử chạy của các candidate trong MySQL Database [3].
*   **Business rules:**
    *   *Ràng buộc Stop Condition bắt buộc:* Tuyệt đối không thiết kế vòng lặp ngầm hoạt động bằng lệnh lặp vô hạn `while(true)` không kiểm soát [2, 8]. Phải bắt buộc có stop condition được định nghĩa rõ ràng [2, 8].
    *   *Tính năng điều khiển nâng cao:* Thiết kế kiến trúc phải hỗ trợ các khả năng: Tách biệt chạy nhiều worker song song, cơ chế retry khi worker bị lỗi, cho phép Pause (tạm dừng) và Resume (tiếp tục) loop [2].
*   **Validation:** Cấu hình Stop Condition nhập vào phải hợp lệ và nằm trong phạm vi tài nguyên hệ thống cho phép [2].
*   **Exceptions & Error cases:** Nếu một Backtest Worker bị lỗi hoặc chết giữa chừng, Scheduler phải tự động phát hiện, giao lại job cho worker khác thực thi (retry/failover) mà không làm sập hay dừng toàn bộ vòng lặp Discovery Loop [2, 38].
*   **State changes:** Trạng thái Discovery Loop chuyển dịch linh hoạt: `RUNNING` $\rightarrow$ `PAUSED` $\rightarrow$ `COMPLETED` [2].
*   **Dependencies:** Phụ thuộc vào *Strategy Discovery/Search Loop Execution [21]* và hệ thống Worker Pool/Job Queue [10, 32].
*   **Related functions:** *Leaderboard Ranking and Updating [36].*
*   **Sources & Locations:**
    *   `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 5, Mục 23, 24]
    *   `project_full_description.pdf` [Trang 1, Mục Module 9 & Trang 2, Mục Stop Condition Loop]
    *   `UI_1.jpg` [Source type: UI observation - Tiến trình Discovery hiển thị mốc Iteration chạy hiện tại "47 / 500" và tiến độ chạy trực quan]

---

## 15. Backtest Trade Visualizer on Candlestick Chart (Trực quan hóa điểm giao dịch lên biểu đồ nến)
*   **Requirement / Function name:** Backtest Trade Visualizer on Candlestick Chart
*   **Description:** Vẽ và hiển thị trực quan các đường chỉ báo kỹ thuật, các nhãn tín hiệu BUY/SELL, các vùng giá kháng cự/hỗ trợ và các điểm vào lệnh (Entry), đóng lệnh (Exit), điểm cắt lỗ (Stop Loss), chốt lời (Take Profit) trực tiếp lên biểu đồ nến lịch sử sau khi hoàn thành backtest [6, 15, 16].
*   **Actor:** Người dùng (Trader) xem hiển thị đồ thị nến [15].
*   **Trigger:** Người dùng click vào một chiến lược bất kỳ trên Leaderboard [15, 39], hoặc nhấp chọn một dòng giao dịch cụ thể trong bảng danh sách lệnh giao dịch sau khi chạy Backtest [15, 16].
*   **Preconditions:** Đã có kết quả danh sách các lệnh giao dịch (trades) sinh ra từ Backtest Engine [16, 20].
*   **Main behavior:** Hệ thống tự động nạp danh sách điểm khớp lệnh, xác định chính xác tọa độ thời gian (Timestamp) và mức giá (Price) của từng lệnh, tiến hành vẽ các đường nối và biểu tượng nhãn (nhãn xanh LONG Entry, nhãn đỏ SHORT Entry, Take Profit, Stop Loss, Exit) đè lên biểu đồ nến tương ứng để người dùng phân tích trực quan chiến lược đã hoạt động như thế nào [6, 15, 16].
*   **Steps:**
    1. Người dùng mở tab kết quả Backtest [16].
    2. Biểu đồ Backtest (ví dụ: BTCUSDT - 5m) tự động render dữ liệu nến cùng 2 dải đường chỉ báo MA(20) và MA(50) [16].
    3. Hệ thống vẽ các đường gạch đứt nét màu đỏ thể hiện vùng giá Kháng cự (ví dụ: `70,200.00`) và dải màu xanh thể hiện vùng Hỗ trợ (ví dụ: `67,800.00`) [6, 16].
    4. Hệ thống quét qua danh sách giao dịch, định vị các điểm khớp lệnh và vẽ:
        * Nhãn xanh lá kèm mũi tên hướng lên ghi chữ `LONG Entry` tại điểm mua [6, 16].
        * Nhãn đỏ kèm mũi tên hướng xuống ghi chữ `SHORT Entry` tại điểm bán khống [16].
        * Đường gạch đứt nét ngang thể hiện vị trí chốt lời `Take Profit` và cắt lỗ `Stop Loss` của lệnh hiện hành [16].
        * Nhãn vòng tròn xanh da trời ghi chữ `Exit` tại điểm đóng giao dịch [6, 16].
    5. *Tương tác highlight:* Khi người dùng click chọn dòng giao dịch số 3 trong bảng danh sách lệnh giao dịch, biểu đồ tự động zoom và highlight vùng đồ thị chứa giao dịch số 3 đó [15].
*   **Input:** Mảng dữ liệu nến lịch sử của timeframe test, danh sách tọa độ các lệnh giao dịch khớp lệnh [15, 16].
*   **Output:** Biểu đồ nến sinh động hiển thị đầy đủ các nhãn giao dịch LONG Entry, SHORT Entry, Take Profit, Stop Loss, Exit, vùng hỗ trợ/kháng cự và các đường chỉ báo kỹ thuật [6, 15, 16].
*   **Postconditions:** Người dùng hiểu rõ hành vi mua bán cụ thể của chiến lược [15].
*   **Business rules:** Không có.
*   **Validation:** Toàn bộ điểm giao dịch vẽ lên đồ thị phải khớp hoàn toàn về mốc thời gian và giá trị với dữ liệu hiển thị trong bảng Danh sách lệnh giao dịch [15, 16].
*   **Exceptions & Error cases:** Không có.
*   **State changes:** Thay đổi vùng hiển thị hiển thị (View viewport) của đồ thị nến dựa trên tương tác click dòng bảng giao dịch của người dùng [15].
*   **Dependencies:** Phụ thuộc vào *Historical Backtesting Simulation [21]* và thư viện vẽ biểu đồ của Frontend [6, 16].
*   **Related functions:** *Multi-Timeframe Realtime Chart Grid Rendering [6].*
*   **Sources & Locations:**
    *   `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 5, Mục 25, 26 & Trang 7, Mục 33, 46]
    *   `UI_2.jpg` [Source type: UI observation - Toàn bộ vùng hiển thị đồ thị nến "Biểu đồ Backtest" chứa các nhãn LONG Entry, SHORT Entry, Take Profit, Stop Loss, Exit, hai dải kháng cự/hỗ trợ ngang và mảng danh sách lệnh phía bên phải]

---

## 16. News Crawling & Normalization (Thu thập tin tức và Chuẩn hóa cấu trúc từ nhiều nguồn)
*   **Requirement / Function name:** News Crawling & Normalization
*   **Description:** Tự động đi thu thập dữ liệu tin tức thị trường crypto liên quan đến các đồng coin/pair từ nhiều kênh cung cấp nguồn khác nhau (như Web Crawler, RSS feed, News API) và thực hiện xử lý chuẩn hóa dữ liệu tin tức thô thu được thành một cấu trúc thực thể dữ liệu tin tức thống nhất `NewsItem` để lưu trữ [28, 40].
*   **Actor:** Người dùng (Trader) cấu hình khởi chạy, Hệ thống tự chạy (News Collector / News Crawler Service) [31, 40].
*   **Trigger:** Người dùng click vào nút "Bắt đầu crawl" trên UI [31], hoặc hệ thống tự động chạy theo cấu hình thời gian Auto refresh [31].
*   **Preconditions:** Hệ thống có kết nối mạng internet ổn định [1]. Các nguồn web, RSS được khai báo hoạt động tốt [31, 40].
*   **Main behavior:** Trình thu thập News Collector truy cập các nguồn tin, bóc tách dữ liệu tin tức thô, loại bỏ tạp chất HTML, chuyển dịch dữ liệu sang cấu trúc thống nhất chứa các thuộc tính chuẩn và lưu vào cơ sở dữ liệu tin tức MySQL [3, 40].
*   **Steps:**
    1. Người dùng truy cập màn hình "News Crawler" [31].
    2. Người dùng click chọn các Nguồn thu thập (chọn checkbox Website, RSS, hoặc HTML) [31].
    3. Người dùng chọn các cặp tài sản coin cần lọc thông tin áp dụng (Pair: chọn `BTC`, `ETH`, `SOL`...) [31].
    4. Người dùng cấu hình thời gian tự động cập nhật (Auto refresh: chọn nút `1 phút`, `2 phút`, `3 phút`, `4 phút` hoặc `5 phút`) [31].
    5. Người dùng nhấn nút "Bắt đầu crawl" [31].
    6. News Collector kết nối đến các kênh nguồn được chọn, tải dữ liệu tin tức thô về [31, 40].
    7. Hệ thống chuẩn hóa dữ liệu thô thu được thành đối tượng dữ liệu chung `NewsItem` [40].
    8. Ghi nhận dữ liệu tin tức chuẩn hóa vào MySQL Database [3, 41].
    9. Hiển thị danh sách tin tức thu được lên bảng dữ liệu "Tin tức đầu vào" ở bên trái giao diện (hiển thị rõ Asset, tiêu đề tin, Nguồn tin và Thời gian thu thập) [31].
*   **Input:** Cấu hình nguồn crawl, cấu hình Auto refresh, danh sách cặp coin lọc tin [31].
*   **Output:** Danh sách các bản ghi tin tức chuẩn hóa lưu trữ trong database và hiển thị trực tuyến lên màn hình [3, 31].
*   **Postconditions:** Tin tức đã được thu thập và chuẩn hóa thành công, sẵn sàng cung cấp dữ liệu đầu vào cho Sentiment Analysis [31, 40].
*   **Business rules:**
    *   *Thiết kế Decouple của Crawler:* Hệ thống thu thập tin tức tuyệt đối không được gắn cứng (phụ thuộc chặt) vào một crawler cụ thể hay một mô hình ML phân tích cụ thể, mà bắt buộc phải qua lớp giao diện chung News Provider để đảm bảo việc thay nguồn dữ liệu hoặc thay mô hình AI không làm ảnh hưởng đến toàn bộ module phía sau [23, 40, 42].
*   **Validation:** Tin tức chuẩn hóa `NewsItem` bắt buộc phải chứa đầy đủ 7 thuộc tính tối thiểu: `id`, `title` (tiêu đề), `content` (nội dung chi tiết), `source` (nguồn trích dẫn), `publishedAt` (thời gian xuất bản gốc), `crawledAt` (thời gian hệ thống thu thập), và `relatedCoins` (danh sách các coin liên quan) [3].
*   **Exceptions & Error cases:** Nếu một trang tin tức nguồn bị lỗi không truy cập được, News Collector phải ghi nhận nhật ký lỗi, bỏ qua trang đó và tiếp tục thực hiện crawl các trang tin khác bình thường mà không gây treo tiến trình [6, 10].
*   **State changes:** Giao diện cập nhật tiến trình chạy crawl, hiển thị số lượng tin tức thu thập được tăng lên [31].
*   **Dependencies:** Phụ thuộc vào kết nối mạng internet và MySQL database [3, 31].
*   **Related functions:** *Sentiment Analysis and Sentiment Score Aggregation [31, 40], LLM-assisted Web Template Extraction with Self-Healing Extractor [31].*
*   **Sources & Locations:**
    *   `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 1, Mục 2 & Trang 5, Mục 27, 28 & Trang 7, Mục 33, 44]
    *   `project_full_description.pdf` [Trang 1, Mục Module 10 & Trang 2, Mục Tight Coupling]
    *   `UI_3.jpg` [Source type: UI observation - Toàn bộ màn hình thu thập tin tức News Crawler, hiển thị bảng thiết lập cấu hình crawl và bảng danh sách "Tin tức đầu vào"]

---

## 17. Sentiment Analysis and Sentiment Score Aggregation (Phân tích cảm xúc tin tức thị trường)
*   **Requirement / Function name:** Sentiment Analysis and Sentiment Score Aggregation
*   **Description:** Sử dụng mô hình học máy Machine Learning (như BERT) hoặc AI để phân tích sắc thái cảm xúc của từng bài tin tức thu được, gắn nhãn phân loại (POSITIVE, NEGATIVE, NEUTRAL) kèm điểm số tin cậy (Confidence Score), đồng thời tổng hợp điểm số tâm lý thị trường trung bình để đưa vào Strategy Engine hoạt động như một chiến lược giao dịch độc lập [31, 40, 41].
*   **Actor:** Hệ thống tự động (Sentiment Service / Machine Learning Service) [28, 41].
*   **Trigger:** Có tin tức mới được ghi nhận vào database (sự kiện `NewsCollected`), hoặc người dùng kích hoạt phân tích [8, 34].
*   **Preconditions:** Tin tức đã được chuẩn hóa và lưu trữ thành công trong database [3, 40]. Mô hình ML Sentiment Service đã được tải và sẵn sàng hoạt động [41].
*   **Main behavior:** Sentiment Service thực hiện phân tích nội dung văn bản tin tức, gán nhãn sắc thái cảm xúc, tính toán điểm tin cậy, lưu kết quả phân tích tâm lý vào Database và tổng hợp biểu đồ tỷ lệ sentiment tổng hợp trong 24h qua [3, 31, 41].
*   **Steps:**
    1. Khi có tin tức mới, Sentiment Service tải nội dung bài viết tin tức [41].
    2. Chạy mô hình phân loại sắc thái để xác định nhãn cảm xúc:
        * Tin tức tốt (ví dụ: "Bitcoin surges after institutional adoption...") $\rightarrow$ Gán nhãn `POSITIVE` [40].
        * Tin tức xấu (ví dụ: "Major exchange suffers security breach...") $\rightarrow$ Gán nhãn `NEGATIVE` [41].
        * Tin trung lập (ví dụ: "Bitcoin network upgrade scheduled...") $\rightarrow$ Gán nhãn `NEUTRAL` [41].
    3. Tính toán điểm số tin cậy của phân tích (Confidence Score, ví dụ: `0.78` hoặc `0.82`) [3, 31].
    4. Lưu kết quả nhãn cảm xúc phân tích được vào Sentiment Database [3, 41].
    5. *Tính toán tổng hợp tâm lý thị trường:* Hệ thống tổng hợp tỷ lệ phần trăm các nhãn tin trong 24h qua và hiển thị biểu đồ phân bổ tâm lý trực quan (ví dụ: Positive 58%, Neutral 27%, Negative 15%) [31].
    6. Hiển thị các chỉ số đo lường hiệu năng lên giao diện: Điểm Score tâm lý tổng hợp trung bình, Confidence Score trung bình của hệ thống, Tổng số lượng tin đã phân tích trong ngày (ví dụ: `1,248` tin), và độ bao phủ nguồn tin (%) [31].
    7. Cung cấp dữ liệu điểm số tâm lý thị trường tích hợp trực tiếp sang Strategy Engine hoạt động dưới dạng chiến lược độc lập mang tên `NewsSentimentStrategy` [31, 41].
*   **Input:** Thực thể dữ liệu tin tức `NewsItem` cần phân tích [3, 40].
*   **Output:** Nhãn cảm xúc được gán (`POSITIVE`, `NEGATIVE`, `NEUTRAL`), Điểm số tin cậy (Confidence Score) của từng tin bài, và Bảng thống kê dữ liệu sentiment tổng hợp trong 24 giờ qua [3, 31, 41].
*   **Postconditions:** Dữ liệu tâm lý sẵn sàng phục vụ cho Strategy Engine để đưa ra tín hiệu LONG/SHORT dựa trên tin tức [31, 41].
*   **Business rules (Chiến lược NewsSentimentStrategy):**
    *   *Quy tắc giao dịch dựa trên tin tức:* Chiến lược tin tức sẽ tính toán mức độ cảm xúc trung bình trong vòng 1 giờ gần nhất của tài sản. Nếu điểm Sentiment trung bình trong 1 giờ $> 0.70 \rightarrow$ Kích hoạt phát tín hiệu BUY/LONG; nếu điểm trung bình $< -0.70 \rightarrow$ Phát tín hiệu SELL/SHORT [41].
*   **Validation:** Nhãn cảm xúc phân loại bắt buộc phải thuộc một trong ba nhóm nhãn chuẩn hóa: POSITIVE, NEGATIVE, NEUTRAL [41].
*   **Exceptions & Error cases:** Không có.
*   **State changes:** Cập nhật bảng thống kê phân bổ tỷ lệ phần trăm các nhóm sentiment trên giao diện thời gian thực [31].
*   **Dependencies:** Phụ thuộc vào dịch vụ *News Crawling & Normalization* và MySQL database chứa tin [3, 40].
*   **Related functions:** *Continuous Automated Search Loop [35].*
*   **Sources & Locations:**
    *   `Crypto Strategy Lab – Đồ án cuối kỳ.pdf` [Trang 1, Mục 2 & Trang 5-6, Mục 29, 30 & Trang 7, Mục 34, 42, 44]
    *   `project_full_description.pdf` [Trang 1, Mục Module 11]
    *   `UI_3.jpg` [Source type: UI observation - Phân vùng hiển thị "Đầu ra phân tích" chứa biểu đồ Sentiment tổng hợp 24h, chỉ số Confidence Score, số lượng tin đã phân tích và vùng hiển thị "Tích hợp với Strategy" của NewsSentimentStrategy]

---

## 18. LLM-Assisted Web Extraction with Self-Healing Templates (Tự động trích xuất cấu trúc tin tức và Tự sửa lỗi mẫu bằng LLM)
*   **Requirement / Function name:** LLM-assisted Web Template Extraction with Self-Healing Extractor
*   **Description:** Sử dụng mô hình ngôn ngữ lớn (LLM) để bóc tách cấu trúc tài liệu HTML thô của tin tức thành các trường thông tin chuẩn hóa, đồng thời giám sát tỷ lệ lỗi trích xuất để tự động sửa chữa mẫu cấu trúc (Self-healing template) khi trang nguồn thay đổi thiết kế [31].
*   **Actor:** Hệ thống tự động Backend kết hợp API LLM [31].
*   **Trigger:** Hệ thống thực hiện một phiên crawl tin tức mới từ trang web đích [31].
*   **Preconditions:** Đã tải nội dung HTML thô của bài viết từ internet [31]. Template phiên bản hiện tại (ví dụ: `v1.4.2`) đang hoạt động [31].
*   **Main behavior:** Hệ thống đẩy nội dung HTML thô qua LLM bóc tách dữ liệu theo template quy định. Đồng thời, bộ giám sát liên tục kiểm tra tỷ lệ lỗi bóc tách. Nếu tỷ lệ lỗi vượt quá ngưỡng 10%, hệ thống tự động kích hoạt LLM để thiết kế lại template bóc tách mới, lưu phiên bản mới và áp dụng ngay lập tức để tự phục hồi lỗi [31].
*   **Steps:**
    1. Trình crawler tải về nội dung HTML thô của trang tin tức [31].
    2. *LLM-assisted Extraction:* LLM đọc mã HTML thô, nhận diện các vùng chứa tiêu đề (title), tóm tắt (summary), nguồn (source), thời gian (time), và tài sản liên quan (asset) theo cấu trúc template bóc tách hiện hành (ví dụ: Template `v1.4.2` có mốc điểm tin cậy trích xuất đạt `0.92`) [31].
    3. *Self-healing Extraction (Giám sát lỗi):* Hệ thống chạy bộ kiểm tra chất lượng kết quả trích xuất để đo lường các chỉ số lỗi hiện tại: tỷ lệ trường thông tin bị trống (Fields trống: ví dụ `8.7%`), sai định dạng dữ liệu (Sai định dạng: ví dụ `3.2%`), và điểm tin cậy trung bình của LLM (ví dụ `0.76`) [31].
    4. Tính toán **Tổng lỗi** (ví dụ tổng lỗi đạt `11.9%`) [31].
    5. *Kiểm tra ngưỡng kích hoạt tự sửa lỗi:* Hệ thống so sánh tổng lỗi với ngưỡng giới hạn lỗi quy định (ngưỡng VD: `10%`) [31].
    6. *Trường hợp lỗi $\ge 10\%$ (Có lỗi cấu trúc):*
        * Hệ thống tự động gửi yêu cầu lên LLM sửa template, cung cấp mã HTML thô hiện tại và thông báo lỗi cấu trúc [31].
        * LLM phân tích lỗi, tự động điều chỉnh logic bóc tách để sinh ra một cấu trúc chiết xuất mới (LLM sửa template thành công, giảm lỗi dự kiến từ `11.9%` xuống còn `4.1%` và nâng điểm độ tin cậy lên `0.93`) [31].
        * Hệ thống lưu phiên bản mẫu trích xuất mới (ví dụ: lưu Template phiên bản `v1.4.3`) và tự động kích hoạt "Áp dụng ngay" làm template mặc định để bóc tách cho các phiên crawl tin tiếp theo [31].
    7. *Trường hợp lỗi $< 10\%$ (Bình thường):* Hệ thống giữ nguyên template hiện tại và tiếp tục bóc tách bình thường [31].
*   **Input:** Nội dung HTML thô của trang tin, phiên bản template bóc tách hiện tại, các cấu hình chỉ số đo lường lỗi [31].
*   **Output:** Dữ liệu tin tức đã bóc tách chính xác các trường thông tin, và phiên bản template bóc tách mới tự phục hồi thành công lưu trong hệ thống [31].
*   **Postconditions:** Đảm bảo hệ thống crawler hoạt động liên tục không bị gián đoạn bóc tách dữ liệu ngay cả khi cấu trúc trang tin tức nguồn bị thay đổi thiết kế [31].
*   **Business rules:**
    *   *Ngưỡng kích hoạt tự sửa lỗi (Self-healing Threshold):* Cơ chế tự sửa lỗi template bóc tách chỉ được kích hoạt tự động chạy ngầm khi tổng tỷ lệ lỗi đo lường vượt ngưỡng 10% [31].
*   **Validation:** Bản mẫu template sinh mới phải được kiểm định chất lượng bóc tách thử nghiệm đạt điểm tin cậy tối thiểu quy định trước khi chính thức đưa vào áp dụng thực tế [31].
*   **Exceptions & Error cases:** Không có.
*   **State changes:** Ghi nhận lưu trữ phiên bản template mới (ví dụ từ `v1.4.2` nâng cấp lên `v1.4.3`) trong MySQL Database [31].
*   **Dependencies:** Phụ thuộc vào dịch vụ *News Crawling & Normalization* và LLM API [31].
*   **Related functions:** *Sentiment Analysis and Sentiment Score Aggregation [31].*
*   **Sources & Locations:**
    *   `UI_3.jpg` [Source type: UI observation - Phân vùng hiển thị "LLM-assisted Extraction" và sơ đồ quy trình tự sửa lỗi "Self-healing extraction"]

---

# BẢNG TỔNG HỢP CÁC CHỨC NĂNG HỆ THỐNG (FUNCTIONAL REQUIREMENTS INVENTORY)

Dưới đây là bảng thống kê toàn diện toàn bộ 18 chức năng đã được trích xuất từ các nguồn tài liệu của dự án:

| ID | Function Name (Tên chức năng) | Description (Mô tả chức năng) | Actor (Tác nhân) | Source (Tên file nguồn) | Location (Vị trí chính xác) | Explicit/Observed (Phân loại) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-01** | Realtime Market Data Streaming | Đăng ký và truyền phát luồng dữ liệu nến thời gian thực của cặp coin từ Binance qua adapter xuống UI với độ trễ thấp | Người dùng, Hệ thống | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_5.jpg | PDF6: Trang 4, Mục 4 & Trang 7, Mục 32.3, 32.4; PDF12: Trang 1, Mục Module 1 & Trang 2, Mục Realtime, Reliability; UI_5 | **Explicit** (PDF) / **Observed** (UI) |
| **FR-02** | Candle Feed Update & Append Handler | Đọc dữ liệu nến realtime từ WebSocket: ghi đè nếu trùng timestamp nến cuối hoặc nối tiếp nếu là nến mới | Hệ thống | UI_5.jpg | UI_5: Phân khu "Logic cập nhật candle" | **Observed** (UI) |
| **FR-03** | Multi-Timeframe Realtime Grid | Hiển thị lưới đồ thị nến thời gian thực tối đa 4 biểu đồ độc lập cùng lúc trên một màn hình | Người dùng | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_5.jpg | PDF6: Trang 1, Mục 3 & Trang 4, Mục 5; PDF12: Trang 1, Mục Module 2; UI_5 | **Explicit** (PDF) / **Observed** (UI) |
| **FR-04** | Timeframe Switching | Cho phép chuyển đổi độc lập khung thời gian nến của từng biểu đồ trong lưới grid 4 biểu đồ | Người dùng | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; UI_5.jpg | PDF6: Trang 1, Mục 3 & Trang 4, Mục 5; UI_5 | **Explicit** (PDF) / **Observed** (UI) |
| **FR-05** | Technical Indicator Calculation | Tính toán tự động các chỉ báo kỹ thuật cơ bản (MA, RSI, Bollinger Bands, S/R) dựa trên dữ liệu nến | Hệ thống | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf | PDF6: Trang 4, Mục 5 & Trang 4, Mục 7-10; PDF12: Trang 1, Mục Module 3 | **Explicit** (PDF) |
| **FR-06** | LLM-Based Strategy Parsing | Phân tích cú pháp ngôn ngữ tự nhiên từ Prompt mô tả chiến lược để tự sinh mã cấu trúc JSON | Người dùng | 779956509_2019220255455531_248486056450237423_n.jpg; UI_4.jpg | Image3: Dòng 21-22; UI_4 | **Explicit** (PDF) / **Observed** (UI) |
| **FR-07** | Website Script Extraction | Dán liên kết trang web chứa script chiến lược để tự động bóc tách và chuyển dịch sang JSON chiến lược | Người dùng | UI_4.jpg | UI_4: Vùng "Nhập URL chiến lược" | **Observed** (UI) |
| **FR-08** | Strategy Schema Verification & Saving | Kiểm định cấu trúc, tính hợp lệ logic của chiến lược JSON và cho phép người dùng đặt tên, tag để lưu vào thư viện | Người dùng, Hệ thống | project_full_description.pdf; UI_4.jpg | PDF12: Trang 2, Mục Version Strategy; UI_4 | **Explicit** (PDF) / **Observed** (UI) |
| **FR-09** | Strategy Registration | Đăng ký thuật toán chiến lược mới vào Strategy Engine thông qua Registry mà không sửa code cốt lõi hiện có | Nhà phát triển | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf | PDF6: Trang 4, Mục 6 & Trang 4, Mục 12 & Trang 7, Mục 32.1, 41; PDF12: Trang 1, Mục Module 4 & Trang 2, Mục Modifiability, Hard-coded Strategy | **Explicit** (PDF) |
| **FR-10** | Composite Strategy Combination | Tổ hợp tín hiệu của nhiều chiến lược đơn lẻ thành tín hiệu chiến lược phức hợp bằng Majority Vote hoặc Weighted Score | Người dùng, Hệ thống | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_1.jpg | PDF6: Trang 1, Mục 2 & Trang 5, Mục 13, 14; PDF12: Trang 1, Mục Module 5; UI_1 | **Explicit** (PDF) / **Observed** (UI) |
| **FR-11** | Strategy Discovery/Search Loop | Tự động sinh ngẫu nhiên hoặc có nghiệp vụ các biến thể chiến lược ứng viên để đưa đi thử nghiệm backtest | Người dùng, Hệ thống | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_1.jpg | PDF6: Trang 1, Mục 2 & Trang 5, Mục 15-18 & Trang 7, Mục 33, 42; PDF12: Trang 1, Mục Module 6; UI_1 | **Explicit** (PDF) / **Observed** (UI) |
| **FR-12** | Historical Backtesting Simulation | Giả lập hoạt động giao dịch của chiến lược trên dữ liệu lịch sử trong quá khứ để tổng hợp đo lường hiệu năng | Người dùng, Hệ thống | 773981388..._n.jpg; 778426143..._n.jpg; Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_2.jpg | Image1: Toàn bộ ảnh; Image2: Toàn bộ ảnh; PDF6: Trang 1, Mục 2 & Trang 5, Mục 19, 20 & Trang 7, Mục 33; PDF12: Trang 1, Mục Module 7 & Trang 2, Mục Performance; UI_2 | **Explicit** (PDF) / **Observed** (UI) |
| **FR-13** | Leaderboard Ranking | Tính điểm Overall Score, xếp hạng Top-10 chiến lược tốt nhất và tự động đẩy cập nhật thời gian thực lên màn hình | Hệ thống | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_1.jpg | PDF6: Trang 5, Mục 21, 22 & Trang 7, Mục 33, 34; PDF12: Trang 1, Mục Module 8 & Trang 2, Mục Top-K Leaderboard; UI_1 | **Explicit** (PDF) / **Observed** (UI) |
| **FR-14** | Discovery Loop Control | Quản lý điều hành vòng lặp tự động ngầm tìm kiếm chiến lược (đảm bảo dừng khi đạt Stop Condition, cho phép Pause/Resume) | Hệ thống | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_1.jpg | PDF6: Trang 5, Mục 23, 24; PDF12: Trang 1, Mục Module 9 & Trang 2, Mục Stop Condition Loop; UI_1 | **Explicit** (PDF) / **Observed** (UI) |
| **FR-15** | Backtest Trade Visualizer | Trực quan hóa chi tiết điểm giao dịch (LONG/SHORT Entry, SL, TP, Exit) và dải kháng cự/hỗ trợ đè lên đồ thị nến | Người dùng, Hệ thống | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; UI_2.jpg | PDF6: Trang 5, Mục 25, 26 & Trang 7, Mục 33, 46; UI_2 | **Explicit** (PDF) / **Observed** (UI) |
| **FR-16** | News Crawling & Normalization | Thu thập tin tức thị trường từ website, RSS, API và xử lý chuẩn hóa sang cấu trúc thực thể `NewsItem` đồng nhất | Người dùng, Hệ thống | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_3.jpg | PDF6: Trang 1, Mục 2 & Trang 5, Mục 27, 28 & Trang 7, Mục 33, 44; PDF12: Trang 1, Mục Module 10 & Trang 2, Mục Tight Coupling; UI_3 | **Explicit** (PDF) / **Observed** (UI) |
| **FR-17** | Sentiment Analysis | Phân tích sắc thái tin tức thành POSITIVE, NEGATIVE, NEUTRAL bằng mô hình ML và tổng hợp điểm số tâm lý | Hệ thống | Crypto Strategy Lab – Đồ án cuối kỳ.pdf; project_full_description.pdf; UI_3.jpg | PDF6: Trang 1, Mục 2 & Trang 5-6, Mục 29, 30 & Trang 7, Mục 34, 42, 44; PDF12: Trang 1, Mục Module 11; UI_3 | **Explicit** (PDF) / **Observed** (UI) |
| **FR-18** | LLM-Assisted Web Extraction | Dùng LLM bóc tách HTML thô thành thông tin tin tức, đo lường lỗi bóc tách và tự động tiến hóa sửa chữa template khi lỗi $\ge 10\%$ | Hệ thống | UI_3.jpg | UI_3: Phân vùng "LLM-assisted Extraction" và "Self-healing extraction" | **Observed** (UI) |

---

📊 Dựa trên bản danh sách các Yêu cầu chức năng cực kỳ chi tiết này, bạn có muốn tôi hỗ trợ phác thảo các **Yêu cầu phi chức năng (Non-functional Requirements - NFR)** bao gồm: hiệu năng hiển thị thời gian thực, độ ổn định của WebSocket, khả năng mở rộng worker backtest song song và bảo mật dữ liệu không?