Dưới đây là tài liệu trích xuất chi tiết và hệ thống hóa toàn bộ các **Yêu cầu kỹ thuật (Technical Requirements)** và **Yêu cầu phi chức năng (Non-Functional Requirements - NFRs)** từ tất cả các nguồn tài liệu của dự án **Crypto Strategy Lab**:

---

# 1. NON-FUNCTIONAL REQUIREMENTS (YÊU CẦU PHI CHỨC NĂNG)

Dưới đây là các đặc tính chất lượng của hệ thống (Architectural Drivers) cùng các chỉ số và giới hạn định lượng được bóc tách nghiêm ngặt từ nguồn:

### Performance (Hiệu năng) & Latency (Độ trễ)
*   **Độ trễ truyền tải thời gian thực (Realtime Latency):** Hệ thống yêu cầu luồng dữ liệu truyền phát từ Market Data nguồn sàn giao dịch \\(\rightarrow\\) Indicator \\(\rightarrow\\) Strategy \\(\rightarrow\\) UI đạt độ trễ thấp [1]. 
    *   *Chỉ số quan sát thực tế từ giao diện:* Trạng thái kết nối WebSocket Binance ghi nhận độ trễ (**Latency**) đạt **102 ms** [2].
*   **Tốc độ xử lý Backtest (Backtest Performance):** Khả năng thực hiện kiểm thử lịch sử nhanh chóng. Tài liệu chỉ rõ nếu chạy tuần tự, 1 Backtest Worker mất **2 giây / candidate**, dẫn đến 10.000 candidates sẽ mất đến **20.000 giây** [3]. Để giải quyết, hệ thống bắt buộc phải sử dụng kiến trúc Worker Pool để xử lý song song thay vì chạy tuần tự [1, 4].

### Scalability (Khả năng mở rộng tải)
*   **Mở rộng số lượng chiến lược thử nghiệm (Strategy Scalability):** Hệ thống ban đầu chỉ hỗ trợ thiết lập khoảng **10 strategies**, nhưng thiết kế kiến trúc phải đáp ứng khả năng mở rộng quy mô xử lý lên đến **100.000 candidate strategies** [5-7].
*   **Hạ tầng đáp ứng mở rộng (Scalability Infrastructure):** Để mở rộng quy mô từ 10 lên 100.000 candidates, hệ thống bắt buộc phải bổ sung và tích hợp cơ chế hàng đợi công việc (**Job Queue**) kết hợp cùng nhóm các máy chủ xử lý (**Workers Pool**) [7].

### Reliability (Độ tin cậy) & Availability (Mức độ sẵn sàng)
*   **Xử lý sự cố ngắt kết nối Binance (Binance Disconnect Reliability):** Khi xảy ra lỗi mất kết nối ("Connection lost" từ sàn Binance) [4, 5], hệ thống bắt buộc phải xử lý một cách mượt mà (**gracefully**) bằng các cơ chế tự động kết nối lại (**reconnect**), tự động thử lại (**retry**) và cam kết **không bị mất dữ liệu nến (không mất candles)** [1, 4, 8].
*   **Phân rã cô lập lỗi (Fault Isolation / Decoupling):** 
    *   Nếu News Service bị lỗi ngắt quãng, biểu đồ Candlestick Chart chính vẫn phải chạy bình thường, không bị ảnh hưởng dây chuyền [9].
    *   Mô hình phân tích cảm xúc (Sentiment Model) và News Crawler phải được thiết kế rời rạc (decoupled) [10, 11]. Nếu Sentiment Model thay đổi hoặc lỗi, luồng hoạt động chính của Strategy Engine không được phép bị ảnh hưởng [11, 12].

### Maintainability (Khả năng bảo trì) & Extensibility (Khả năng mở rộng chức năng)
*   **Tính độc lập của thuật toán tìm kiếm (Strategy Search Maintainability):** Module tìm kiếm tối ưu chiến lược (Strategy Search) phải hoàn toàn độc lập và không được phụ thuộc chặt vào trình thực thi Backtest (Backtesting implementation) [1, 4]. Hệ thống phải cho phép thay thế thuật toán tìm kiếm (ví dụ: thay từ **Random Search** sang **Genetic Search**) mà bộ cài đặt Backtester và Evaluator vẫn giữ nguyên vẹn không cần viết lại [1, 4, 13].
*   **Tính đa nguồn dữ liệu (Extensibility of Market Data):** Kiến trúc phải cho phép bổ sung thêm các nhà cung cấp dữ liệu thị trường mới (ví dụ mở rộng từ **Binance** sang tích hợp song song **Binance + OKX** hoặc các sàn Bybit, Coinbase) mà không bắt buộc phải sửa đổi hay can thiệp vào mã nguồn của giao diện Frontend [8, 9, 14].
*   **Khả năng bổ sung chiến lược dạng Plugin (Strategy Extensibility):** Cho phép các nhà phát triển dễ dàng thêm các chiến lược giao dịch mới (ví dụ: thêm chiến lược **MACD Strategy**) mà không cần chỉnh sửa mã nguồn cốt lõi của Strategy Engine (không phải sửa đổi 20 modules khác) [5-7, 9, 12]. Hệ thống cần hỗ trợ cơ chế đăng ký chiến lược động: `StrategyRegistry.register(MACDStrategy)` [6, 12, 15].

### Usability (Khả năng sử dụng / Trực quan hóa)
*   **Theo dõi đa khung thời gian song hành:** Hệ thống phải hỗ trợ người dùng theo dõi biến động giá realtime đồng thời trên **tối đa 4 biểu đồ (4 charts)** độc lập trên cùng một màn hình giao diện [6, 14, 16, 17].
*   **Tải dữ liệu độc lập cục bộ:** Khi người dùng thay đổi khung thời gian của một biểu đồ riêng lẻ (ví dụ đổi Chart 1 từ khung `5m` sang `1h`), hệ thống chỉ được phép gọi tải lại dữ liệu cho riêng Chart 1 đó mà **không được phép reload lại toàn bộ trang/toàn bộ hệ thống** [14, 18].
*   **Trực quan hóa chi tiết điểm giao dịch (Trade Detail Visualization):** Cho phép người dùng click vào một hàng giao dịch cụ thể trong bảng kê chi tiết (ví dụ Trade #3) để biểu đồ nến tự động highlight (làm nổi bật) các điểm vào lệnh (Buy points/Entry) và điểm đóng lệnh (Sell points/Exit) của giao dịch đó [17, 19].

### Observability (Khả năng giám sát hệ thống)
*   Hệ thống bắt buộc phải cung cấp cơ chế theo dõi và giám sát trực quan các thông số vận hành thời gian thực bao gồm [1, 4]:
    *   Trạng thái vòng lặp tối ưu hóa chạy ngầm (Loop đang chạy hay dừng?) [1, 4].
    *   Số lượng chiến lược ứng viên đã thử nghiệm thực tế [1, 4].
    *   Thời gian chạy thực thi của mỗi đợt Backtest [1, 4].
    *   Thống kê số lượng các job/tác vụ bị lỗi trong hàng đợi [1, 4].
    *   Xác định chiến lược nào hiện đang đứng vị trí Top 1 hiệu năng [1, 4].

### Reproducibility (Tính tái lập thực nghiệm)
*   **Kiểm soát phiên bản bất biến (Strategy Version Control):** Mỗi chiến lược giao dịch bắt buộc phải được gắn số hiệu phiên bản (**version**) rõ ràng [11, 17]. Khi người dùng thay đổi hay tinh chỉnh tham số của chiến lược, hệ thống tuyệt đối không được phép ghi đè (overwrite) trực tiếp lên kết quả cũ [11, 17]. 
*   Đảm bảo một thực nghiệm trong quá khứ (ví dụ **Experiment #122**) phải luôn truy vết và xác định chính xác phiên bản chiến lược gốc cùng bộ tham số mà nó đã sử dụng để chạy, đảm bảo chạy lại cùng tham số luôn ra một kết quả duy nhất [11, 17].

### Ràng buộc giới hạn nghiệp vụ (Business Limits & Constraints)
*   **Vốn mặc định thử nghiệm:** Trên giao diện cấu hình backtest mặc định điền sẵn số vốn giả định ban đầu là **100 USD** [20, 21].
*   **Ngưỡng vào lệnh của chiến lược Weighted Voting:** Tín hiệu tổng hợp chỉ được kích hoạt LONG/SHORT khi trị tuyệt đối của điểm biểu quyết đạt ngưỡng: **\\(|Score| \ge 0.30\\)** [22, 23].
*   **Ngưỡng lỗi bóc tách của Self-healing crawler:** Cơ chế LLM tự động sửa template bóc tách tin tức chỉ được kích hoạt ngầm khi tổng tỷ lệ lỗi trường rỗng và sai định dạng của crawler vượt ngưỡng **10%** [24].
*   **Giới hạn số lượng hiển thị Leaderboard:** Thiết lập giới hạn giữ vị trí xếp hạng trên màn hình là **Top K = 10** chiến lược xuất sắc nhất [8, 25].
*   **Điều kiện dừng của vòng lặp ngầm (Stop Condition Loop):** Trình Scheduler điều phối vòng lặp chạy ngầm tối ưu hóa chiến lược bắt buộc phải cấu hình thiết lập điều kiện dừng rõ ràng để tránh vòng lặp vô hạn `while(true)` tiêu tốn tài nguyên hệ thống [8, 26]. Vòng lặp phải tự động dừng khi thỏa mãn một trong các điều kiện sau:
    1.  Đạt mốc **100 candidate strategies** được sinh và chạy thử nghiệm thành công [8, 26].
    2.  Đạt giới hạn thời gian chạy liên tục **1 giờ** [8, 26].
    3.  Đạt mốc **50 iterations (vòng lặp) liên tục** mà không có bất kỳ cải thiện nào về điểm số hiệu năng trên bảng xếp hạng [8, 26].

---

# 2. TECHNICAL REQUIREMENTS (YÊU CẦU CÔNG NGHỆ & KỸ THUẬT)

Dưới đây là các thành phần công nghệ được phân loại rõ ràng theo trạng thái xuất hiện trong các nguồn tài liệu của đồ án:

### Required (Bắt buộc phải áp dụng hoặc có ràng buộc nghiệp vụ cứng)
*   **Mô hình kiến trúc cốt lõi (Architectural Patterns):**
    *   **Plugin Architecture (Kiến trúc cắm rút):** Áp dụng bắt buộc cho Strategy Engine để đăng ký chiến lược mới dễ dàng thông qua hàm `register()` mà không cần sửa code cũ [10, 27, 28].
    *   **Adapter Pattern:** Áp dụng bắt buộc cho tầng dữ liệu thị trường (Market Data) để che giấu API Binance nguồn, ngăn cách không cho Frontend giao tiếp trực tiếp với Binance API [8, 10, 14, 29].
    *   **Event-Driven Architecture (Kiến trúc hướng sự kiện):** Áp dụng bắt buộc để giảm liên kết cứng (loose coupling) giữa các dịch vụ. Ví dụ: Trình Backtest Worker sau khi hoàn thành nhiệm vụ chỉ cần publish sự kiện `StrategyEvaluatedEvent` để Ranking Service tự động bắt lấy và chấm điểm, không gọi trực tiếp [8, 17, 30].
*   **Mẫu thiết kế hành vi (Design Patterns):** Yêu cầu sinh viên nghiên cứu các mẫu thiết kế thích hợp bao gồm: **Strategy Pattern**, **Factory**, **Registry**, **Dependency Injection** để thiết lập cơ chế nạp chiến lược dạng plugin linh hoạt [27, 28].
*   **Kiến trúc tách biệt Concern (Concern Separation - Anti-patterns checking):**
    *   Cấm thiết kế **God Service** (ví dụ tạo một class `TradingService` duy nhất ôm đồm tất cả các tác vụ từ call Binance, tính toán chỉ báo, cào tin, chạy backtest đến xếp hạng) [1, 10].
    *   Cấm thiết kế **Hard-coded Strategy** (viết các câu lệnh rẽ nhánh cứng lồng nhau dạng `if MA && RSI ... else if MA && Bollinger ...`) [10, 11].
    *   Cấm thiết kế tính toán nghiệp vụ tại Frontend (Cấm React/Vue tự động tính toán chỉ báo kỹ thuật, chạy backtest hay tính lợi nhuận ròng, Frontend chỉ được phép làm nhiệm vụ hiển thị dữ liệu nhận về từ Backend) [10, 11].

### Recommended (Được khuyên dùng hoặc được đề xuất nghiên cứu trong tài liệu)
*   **Các thành phần hạ tầng phân tán (Hỗ trợ Scalability & Performance) [3, 10, 31]:**
    *   **Kafka / RabbitMQ:** Khuyên dùng làm hệ thống hàng đợi phân phối công việc (**Job Queue / Message Queue**) để xếp hàng các candidate strategies xuống cho worker xử lý [3, 10, 31].
    *   **Redis:** Khuyên dùng làm bộ đệm lưu trữ (**Cache**) dữ liệu tốc độ cao phục vụ hiển thị bảng xếp hạng Leaderboard khi số lượng người dùng đọc tăng cao [3, 31].
    *   **Worker Pool:** Bộ nhóm máy chủ xử lý song song bất đồng bộ giúp tối ưu hóa hiệu năng chạy backtest [1, 3, 31].
    *   **Microservices, CQRS, Event Sourcing:** Khuyên nghiên cứu ứng dụng cho các bài toán kiến trúc hệ thống lớn [3].
*   **Thuật toán tìm kiếm chiến lược nâng cao (Search Algorithms):**
    *   **Genetic Algorithm / Genetic Search:** Thuật toán tiến hóa lai ghép chọn lọc tự nhiên đề xuất để thay thế thuật toán ngẫu nhiên [3, 4, 13, 32, 33].
    *   **Bayesian Optimization, Evolutionary Search, Reinforcement Learning, Agent-based Search, AlphaEvolve-style optimization, Loop Engineering:** Các phương pháp nghiên cứu tối ưu hóa vòng lặp đề xuất mở rộng cho sinh viên [3, 32].

### Existing / Provided (Đã có sẵn hoặc được hệ thống cung cấp làm nền tảng)
*   **Hệ cơ sở dữ liệu quan hệ (Database):** **MySQL** là hệ quản trị cơ sở dữ liệu lưu trữ bền vững được sử dụng hiện hành của hệ thống [10, 11].
*   **Nguồn cấp dữ liệu thị trường trực tuyến (Market Data Provider):** API và luồng WebSocket thời gian thực của sàn giao dịch **Binance** [6, 16, 29].

### Example (Các công nghệ/mô hình được đưa ra dưới dạng ví dụ minh họa)
*   **Công nghệ Frontend:** **React / Vue** được đưa ra làm ví dụ minh họa cho các công nghệ xây dựng UI hiển thị ở phía client [10, 11].
*   **Mô hình trí tuệ nhân tạo & Học máy (AI/ML Models):**
    *   **BERT Model:** Ví dụ minh họa cho mô hình học máy được Sentiment Service sử dụng để phân loại sắc thái cảm xúc tin tức thô [10, 11].
    *   **LLM (Mô hình ngôn ngữ lớn):** Ví dụ minh họa cho dịch vụ bóc tách ngôn ngữ prompt tiếng Việt của người dùng để chuyển dịch sang định dạng cấu trúc kịch bản JSON [34, 35], và bóc tách HTML thô tin tức [18, 24].
*   **Nguồn cào tin tức đầu vào (News Sources):** **CoinDesk**, **The Block**, **Decrypt**, **Cointelegraph**, **Bankless**, **The Defiant** được hiển thị làm ví dụ nguồn cào tin thực tế trên UI [24].
*   **Nền tảng chia sẻ mã nguồn chiến lược:** **TradingView**, **Blogger**, **Medium**, **GitHub Gist**, **Google Docs** được đưa ra làm ví dụ minh họa cho các website hỗ trợ dán liên kết để trích xuất logic [35].

---

# 3. DEPLOYMENT (TRIỂN KHAI & HẠ TẦNG)

Mặc dù tài liệu đề cao tính tự do lựa chọn công nghệ cho sinh viên khi phát triển [31], hệ thống vẫn định hình các yêu cầu hạ tầng triển khai và phân rã module bắt buộc để đáp ứng tiêu chuẩn đồ án:

### Phân rã cấu trúc triển khai (Container/Module decomposition)
Sơ đồ phân rã kiến trúc hệ thống bắt buộc phải mô tả tối thiểu các thành phần dịch vụ hoạt động độc lập sau [33]:
1.  **Frontend Dashboard:** Giao diện client-side nhận dữ liệu hiển thị [33].
2.  **Backend Services:** Hệ thống máy chủ xử lý logic nghiệp vụ trung gian kết nối qua API/WebSocket với Frontend, bao gồm các dịch vụ [33]:
    *   **Market Data Service (kèm Binance Adapter):** Đảm nhận kết nối luồng giá, chuẩn hóa dữ liệu nến [33].
    *   **Strategy Service (kèm Strategy Registry):** Quản lý đăng ký plugin chiến lược [33].
    *   **News Service (kèm News Providers):** Module crawl tin tức thô từ RSS, Web, API [33].
    *   **Combination Engine:** Trình tổ hợp kết hợp chiến lược phức hợp [33].
    *   **Backtester & Evaluator:** Bộ giả lập giao dịch lịch sử và chấm điểm metrics hiệu năng [33].
    *   **Leaderboard Service:** Quản lý xếp hạng Top-K [33].
    *   **Sentiment Service (kèm Sentiment Database):** Nhận tin tức chuẩn hóa chạy phân tích sắc thái cảm xúc độc lập với crawler tin tức [33].

### Đảm bảo tính kiểm định và bàn giao sản phẩm (Deliverables)
Khi hoàn thành đồ án, nhóm phát triển bắt buộc phải nộp đầy đủ các thành phần đóng gói triển khai sau [10, 33]:
1.  **Source Code:** Repository mã nguồn hoàn chỉnh của toàn bộ hệ thống [10].
2.  **README Document:** Sách hướng dẫn chi tiết các bước cài đặt (**Install**) và khởi chạy (**Run**) hệ thống trên môi trường máy chủ [33].
3.  **Software Architecture Document (SAD):** Tài liệu đặc tả kiến trúc phần mềm tối thiểu phải mô tả đầy đủ các nội dung trực quan bao gồm: *System Context (Bối cảnh hệ thống)*, *Container/Module decomposition (Phân rã mô-đun)*, *Component responsibilities (Nhiệm vụ các thành phần)*, *Data Flow (Luồng dữ liệu)*, *Realtime Flow (Luồng thời gian thực)*, *Strategy Flow (Luồng xử lý chiến lược)*, và *Search/Backtest Flow (Luồng tìm kiếm/backtest)* [33].
4.  **Architectural Decisions (ADR - Nhật ký quyết định kiến trúc):** Bắt buộc phải viết tài liệu giải trình kỹ lưỡng cho 4 quyết định thiết kế cốt lõi [33, 36]:
    *   **ADR-001:** Tại sao lựa chọn công nghệ WebSocket? [33]
    *   **ADR-002:** Tại sao lựa chọn Plugin Architecture cho việc thiết kế Strategy Engine? [36]
    *   **ADR-003:** Tại sao lựa chọn hàng đợi Message Queue cho tác vụ Backtesting? [36]
    *   **ADR-004:** Tại sao thực hiện tách biệt Sentiment Service thành dịch vụ riêng biệt? [36]

---

# 4. SECURITY (AN NINH & BẢO MẬT)

Các ràng buộc về mặt an ninh hệ thống và kiểm soát truy cập dữ liệu nhạy cảm được bóc tách trực tiếp từ nguồn:

### Kiểm soát quyền truy cập Cơ sở dữ liệu (Direct Database Access Restriction)
*   **Quy tắc an toàn dữ liệu:** Hệ thống nghiêm cấm tuyệt đối việc cho phép các thuật toán chiến lược (ví dụ class `RSIStrategy` hoặc `MACDStrategy`) được quyền kết nối và thực hiện truy vấn đọc/ghi trực tiếp vào cơ sở dữ liệu quan hệ MySQL [10, 11].
*   **Giải pháp an toàn:** Tất cả các chiến lược giao dịch bắt buộc phải nhận dữ liệu thị trường đầu vào cần thiết (giá nến, khối lượng, xu hướng, sentiment) thông qua một lớp giao diện trừu tượng (**Abstraction interface**) thích hợp do Backend cung cấp (ví dụ nhận tham số thông qua đối tượng `context` truyền vào hàm `analyze(context)`) để ngăn chặn các lỗ hổng bảo mật rò rỉ dữ liệu hoặc câu lệnh SQL độc hại từ các plugin chiến lược tự viết [10, 11, 37].

### Phân quyền Gói tài khoản người dùng (Account Plan Authorization)
*   Hệ thống quản lý phân quyền và giới hạn tính năng sử dụng dựa trên cấp độ tài khoản người dùng hiển thị trực quan trên giao diện:
    *   **Tài khoản Pro Student:** Gói tài khoản dành riêng cho sinh viên học tập nghiên cứu (Ví dụ thông tin tài khoản hiển thị: Người dùng `Nguyễn Minh`, email `student@example.com`, loại tài khoản `Pro Student`, thời hạn hiệu lực của gói đăng ký đến ngày **20/06/2025**) [2, 23]. Gói tài khoản này cho phép mở khóa toàn bộ các tính năng đặc quyền nâng cao như theo dõi song hành đa khung thời gian thời gian thực trên biểu đồ lưới 4 charts độc lập và sử dụng AI tối ưu hóa vòng lặp [2, 23].

---

# BẢNG TỔNG HỢP YÊU CẦU KỸ THUẬT VÀ PHI CHỨC NĂNG (TECHNICAL & NFR INVENTORY)

| ID | Category | Requirement / Constraint | Technical Limit / Value | Role / Status | Source File | Location |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RQ-01** | **NFR - Latency** | WebSocket Realtime Latency | **102 ms** | Observed | UI_5.jpg | Card Trạng thái kết nối |
| **RQ-02** | **NFR - Performance** | Sequential Backtest Cost | **2 giây / candidate** (10.000 candidates = **20.000 giây**) | Explicit | Crypto Strategy Lab – Đồ án cuối kỳ.pdf | Trang 7, Mục 31 / Scenario Scalability |
| **RQ-03** | **NFR - Scalability** | Candidate Strategies Range | Quy mô từ **10** tăng lên **100.000** candidates | Required | project_full_description.pdf; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | PDF12: Trang 2, Scalability; PDF6: Trang 7, Mục 23 |
| **RQ-04** | **NFR - Reliability** | Binance WebSocket Connection lost | Graceful Reconnect & Retry, **không mất candles** | Required | project_full_description.pdf; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | PDF12: Trang 2, Reliability; PDF6: Trang 7, Mục 24 |
| **RQ-05** | **NFR - Usability** | Multi-Timeframe Chart Grid Cap | Hiển thị song song **tối đa 4 charts** trên một màn hình | Required | project_full_description.pdf; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | PDF12: Trang 1, Module 2; PDF6: Trang 4, Mục 5 |
| **RQ-06** | **NFR - Loop Constraint** | Stop Condition: Candidates tested | Tối đa **100 candidates** | Required | project_full_description.pdf; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | PDF12: Trang 2, Stop Condition; PDF6: Trang 5, Mục 19 |
| **RQ-07** | **NFR - Loop Constraint** | Stop Condition: Time Limit | Tối đa **1 giờ** chạy liên tục | Required | project_full_description.pdf; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | PDF12: Trang 2, Stop Condition; PDF6: Trang 5, Mục 19 |
| **RQ-08** | **NFR - Loop Constraint** | Stop Condition: Iteration No Improvement | **50 iterations liên tục** không cải thiện Leaderboard | Required | project_full_description.pdf; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | PDF12: Trang 2, Stop Condition; PDF6: Trang 5, Mục 19 |
| **RQ-09** | **NFR - Usability** | Leaderboard Promotion limit | Giới hạn xếp hạng hiển thị **Top K = 10** | Required | project_full_description.pdf; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | PDF12: Trang 2, Top-K Leaderboard; PDF6: Trang 5, Mục 17 |
| **RQ-10** | **Technical - Architecture** | Strategic Extensibility register | Thêm kịch bản bằng hàm đăng ký `register()` | Required | project_full_description.pdf; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | PDF12: Trang 1, Module 4; PDF6: Trang 4, Mục 12 & Trang 7, Mục 30 |
| **RQ-11** | **Technical - Database** | Persistent Database System | **MySQL** persistent relational DB | Required | project_full_description.pdf; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | PDF12: Trang 2, Direct DB Access; PDF6: Trang 6, Mục 35 |
| **RQ-12** | **Technical - Framework** | Client-side Frontend framework | **React / Vue** framework | Example | project_full_description.pdf | Trang 2, Frontend Logic |
| **RQ-13** | **Technical - Infrastructure**| Scale Engine Job Queue | **Kafka / RabbitMQ** message broker | Recommended | Crypto Strategy Lab – Đồ án cuối kỳ.pdf | Trang 7, Mục 31 |
| **RQ-14** | **Technical - Cache** | Hot data caching system | **Redis Cache** database | Recommended | Crypto Strategy Lab – Đồ án cuối kỳ.pdf | Trang 7, Mục 31 |
| **RQ-15** | **Technical - ML model** | Sentimental Analysis BERT | **BERT Model** for sentiment classification | Example | project_full_description.pdf; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | PDF12: Trang 2, Tight Coupling; PDF6: Trang 5-6, Mục 22 |
| **RQ-16** | **Security - Abstraction** | Anti-Pattern: Direct DB Access | Cấm Strategy truy cập trực tiếp MySQL | Required | project_full_description.pdf; Crypto Strategy Lab – Đồ án cuối kỳ.pdf | PDF12: Trang 2, Direct DB Access; PDF6: Trang 7, Mục 32 |
| **RQ-17** | **Security - Authorization** | Account Expiry Date validation | **Hết hạn: 20/06/2025** | Required | UI_1.jpg; UI_5.jpg | Sidebar góc dưới bên trái gói Pro Student |

---

🎧 Dữ liệu đặc tả các yêu cầu kỹ thuật, phi chức năng, an ninh và môi trường triển khai của hệ thống đã được kết xuất vô cùng chuẩn xác. Dựa trên toàn bộ kho dữ liệu chi tiết của notebook, **Crypto Strategy Lab** thực sự là một hệ thống đan xen phức tạp giữa Realtime, Microservices và Event-driven. 

Bạn có muốn tôi phát triển một bản **Tài liệu ADR (Architectural Decision Record)** hoàn chỉnh cho dự án để giải trình chi tiết về **ADR-003: Tại sao sử dụng Kafka/RabbitMQ làm Message Queue cho Backtesting Engine** giúp ghi điểm tuyệt đối trong mắt hội đồng phản biện không?