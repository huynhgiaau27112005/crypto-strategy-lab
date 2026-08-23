Dưới đây là tài liệu **Information Inventory** chi tiết, bóc tách toàn bộ thông tin liên quan đến phần mềm từ tất cả các nguồn tài liệu và mockup giao diện có trong notebook của bạn. 

Tài liệu tuân thủ nghiêm ngặt các nguyên tắc: không tự thiết kế kiến trúc, không tự suy diễn, không tự giải quyết mâu thuẫn giữa các nguồn, ưu tiên **completeness** (sự đầy đủ) hơn **conciseness** (sự ngắn gọn), và ghi rõ nguồn gốc cho từng thông tin.

---

# 1. PROJECT OVERVIEW

### Tên phần mềm (Software Name)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   Tên đầy đủ: **Crypto Strategy Lab – Nền tảng phân tích, kết hợp và đánh giá chiến lược giao dịch Crypto** *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 1)*.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   Tên hiển thị góc trên cùng bên trái của màn hình là **Crypto Strategy Lab** đi kèm logo hình chiếc bình thí nghiệm hóa học chứa biểu tượng đồng tiền mã hóa bên trong *(Source: Observed từ UI, "UI_1.jpg", "UI_2.jpg", "UI_3.jpg", "UI_4.jpg", "UI_5.jpg")*.
*   **Inferred (Suy diễn):** Không có.

### Mục đích (Purpose)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   Cho phép bổ sung nhiều strategy khác nhau, tự động kết hợp chúng thành các strategy phức hợp, đánh giá hiệu quả và liên tục tìm ra những tổ hợp strategy tốt nhất *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 1)*.
    *   Xây dựng một hệ thống phần mềm có khả năng thử nghiệm các ý tưởng giao dịch một cách có hệ thống *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 9, Mục 47)*.
    *   Học tập và phân tích bản chất của từng component trong kiến trúc mở rộng hệ thống (scale), xác định component áp dụng vào đúng module nào, phân biệt lựa chọn có giá trị thực tế với lựa chọn gượng ép hoặc over-engineering *(Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục 1)*.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   Giao diện hiển thị mục đích cốt lõi là: **"Tạo strategy đơn, strategy kết hợp và tự động tìm biến thể tốt nhất"** *(Source: Observed từ UI, "UI_1.jpg")*.
*   **Inferred (Suy diễn):**
    *   Giúp các trader cá nhân hoặc nhà nghiên cứu chiến lược tối ưu hóa hiệu quả đầu tư bằng cách tự động hóa hoàn toàn quy trình thử nghiệm và xếp hạng chiến lược trước khi đưa vào thực tế giao dịch.

### Vấn đề (Problem)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   Thị trường tiền mã hóa (cryptocurrency) như Bitcoin, Ethereum... hoạt động liên tục 24/7 và giá tài sản biến động liên tục theo thời gian *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 1)*.
    *   Các trader sử dụng nhiều phương pháp phân tích kỹ thuật riêng lẻ (như Moving Average, RSI, Bollinger Bands, Support/Resistance, SMC, Wyckoff...) nhưng **một strategy đơn lẻ thường không hoạt động tốt trong mọi điều kiện thị trường** *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 1)*.
*   **Observed (Quan sát trực tiếp từ UI):** Không có.
*   **Inferred (Suy diễn):** Không có.

### Bối cảnh (Background)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   Giá các tài sản số biến động không ngừng và được biểu diễn bằng biểu đồ nến (Candlestick Chart) chuẩn hóa gồm 5 trường dữ liệu: **Open** (giá mở cửa), **High** (giá cao nhất), **Low** (giá thấp nhất), **Close** (giá đóng cửa), **Volume** (khối lượng giao dịch) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 1)*.
    *   Trọng tâm của đồ án là **Kiến trúc phần mềm (Software Architecture)**, hoàn toàn không phải là nhiệm vụ tìm ra một chiến lược đầu tư tốt nhất hay để kiếm tiền thực tế *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 7, Mục 39; Trang 9, Mục 47)*.
    *   Crypto Strategy Lab cần giải quyết các bài toán kiến trúc chính: dữ liệu Binance thời gian thực (realtime), hiển thị tối đa 4 biểu đồ độc lập, công cụ chiến lược (Strategy Engine), công cụ tìm kiếm chiến lược (Strategy Search), giả lập giao dịch (Backtest), bảng xếp hạng (Leaderboard) và tích hợp tin tức/sentiment, yêu cầu tính mở rộng, khả năng sửa đổi, vận hành độc lập giữa các thành phần *(Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục 2)*.
*   **Observed (Quan sát trực tiếp từ UI):** Không có.
*   **Inferred (Suy diễn):** Không có.

### Miền nghiệp vụ (Domain)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   Phân tích kỹ thuật (Technical Analysis), giao dịch tiền mã hóa tự động (Cryptocurrency Algorithmic Trading), kiểm thử chiến lược lịch sử (Quantitative Backtesting) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 1, 2)*.
    *   Phân tích tâm lý thị trường thông qua tin tức (News Sentiment Analysis) bằng mô hình Học máy (Machine Learning) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 5, Mục 29)*.
*   **Observed (Quan sát trực tiếp từ UI):** Không có.
*   **Inferred (Suy diễn):** Không có.

### Mục tiêu (Objectives)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   Kết nối và lấy dữ liệu thị trường crypto thời gian thực từ sàn Binance *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2)*.
    *   Hiển thị biểu đồ giá realtime, hỗ trợ theo dõi đồng thời tối đa 4 khung thời gian *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2)*.
    *   Cho phép bổ sung các strategy phân tích kỹ thuật và kết hợp nhiều strategy thành một chiến lược tổng hợp (Composite Strategy) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2)*.
    *   Giả lập (backtest) hiệu quả của các chiến lược trên dữ liệu lịch sử và xếp hạng chúng dựa trên các chỉ số hiệu quả *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2)*.
    *   Tự động tìm kiếm các tổ hợp strategy tốt hơn (Search Engine) và trực quan hóa tín hiệu, giao dịch lên biểu đồ *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2)*.
    *   Thu thập tin tức liên quan đến coin/pair và phân tích sentiment của tin tức bằng Machine Learning để biến sentiment thành một strategy giao dịch *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 6, Mục 30)*.
    *   Thiết kế hệ thống mở rộng, dễ nâng cấp và duy trì mà không cần viết lại hay ảnh hưởng lớn đến toàn bộ hệ thống *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 7, Mục 32)*.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   Phát triển tính năng tích hợp mô hình ngôn ngữ lớn (LLM) để phân tích mô tả chiến lược viết bằng ngôn ngữ tự nhiên và chuyển đổi tự động thành định nghĩa chiến lược có cấu trúc JSON để đưa vào thư viện *(Source: Observed từ UI, "UI_4.jpg")*.
    *   Tích hợp hệ thống trích xuất tin tức tự sửa lỗi mẫu (Self-healing extraction) bằng mô hình LLM khi cấu trúc trang HTML nguồn thay đổi *(Source: Observed từ UI, "UI_3.jpg")*.
*   **Inferred (Suy diễn):** Không có.

### Chỉ tiêu kỹ thuật / Chỉ tiêu vận hành (Goals)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   **Quy mô tải hiện tại:** Phục vụ **100 người dùng đồng thời**, xử lý **20 backtests/giờ**, hỗ trợ **1 cặp BTCUSDT**, vận hành trên cụm hạ tầng gồm **1 server + 1 database** *(Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục 2 & 6)*.
    *   **Kịch bản tăng trưởng (Mục tiêu mở rộng):** Đạt khả năng đáp ứng **50.000 người dùng đồng thời**, cung cấp **4 chart realtime/người dùng**, đáp ứng **5.000 lượt đọc Leaderboard/giây** và xử lý **100.000 lượt backtest/ngày** *(Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục 2 & 6)*.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   Khả năng tự động chạy tối ưu hóa liên tục (Discovery Loop) thử nghiệm lên tới 500 vòng lặp (iterations) *(Source: Observed từ UI, "UI_1.jpg")*.
    *   Cho phép giả lập backtest với số vốn mặc định là 100 USD *(Source: Observed từ UI, "UI_2.jpg", "778426143_3961774807465063_4066970941457598332_n.jpg")*.
*   **Inferred (Suy diễn):** Không có.

### Phạm vi (Scope)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   **Yêu cầu tối thiểu (MVP):**
        *   **Market:** Dữ liệu sàn Binance, biểu đồ nến (Candlestick chart), cập nhật thời gian thực (Realtime update), theo dõi tối đa 4 khung thời gian đồng thời *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 8, Mục 37)*.
        *   **Strategy:** Tối thiểu 4 chiến lược đơn lẻ (MA, RSI, Bollinger Bands, Support/Resistance) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 8, Mục 37)*.
        *   **Combination:** Khả năng kết hợp tạo Composite Strategy bằng thuật toán biểu quyết đa số (Majority Vote) hoặc thang điểm trọng số (Weighted Score) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 8, Mục 37; "project_full_description.pdf", Trang 1, Mục 5)*.
        *   **Backtest:** Giả lập giao dịch trên dữ liệu lịch sử lịch quá khứ *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 8, Mục 37)*.
        *   **Evaluation:** Đánh giá hiệu quả chiến lược dựa trên tối thiểu 4 chỉ số: Return (Lợi nhuận), Win Rate (Tỷ lệ thắng), Max Drawdown (Mức sụt giảm tài sản lớn nhất), Trades (Số lượng lệnh đã thực hiện) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 8, Mục 37; "project_full_description.pdf", Trang 1)*.
        *   **Search:** Tối thiểu hỗ trợ thuật toán tìm kiếm ngẫu nhiên (Random Search) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 8, Mục 37)*.
        *   **Leaderboard:** Xếp hạng danh sách Top-K tốt nhất (mặc định K = 10) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 22; Trang 8, Mục 37)*.
        *   **Visualization:** Biểu đồ hiển thị rõ ràng tín hiệu giao dịch Buy/Sell và điểm Entry/Exit *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 8, Mục 37)*.
        *   **News:** Thu thập tin tức và phân loại sentiment (POSITIVE, NEGATIVE, NEUTRAL) làm chiến lược giao dịch độc lập *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 8, Mục 37)*.
    *   **Phần mở rộng (Optional):**
        *   **Search nâng cao:** Genetic Search, Evolutionary Search, Bayesian Optimization, Reinforcement Learning, LLM-generated Strategy, Agent-based Search, AlphaEvolve-style optimization, Loop Engineering *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 8, Mục 38; Image 70, 159)*.
        *   **Trading nâng cao:** Quản lý giao dịch LONG/SHORT, Stop Loss, Take Profit, Trailing Stop, Position Sizing *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 8, Mục 38; Image 160)*.
        *   **Market nâng cao:** Hỗ trợ đa sàn giao dịch (Multiple Exchanges), đa cặp coin/pair (Multiple Coins) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 8, Mục 38; Image 161)*.
        *   **Machine Learning nâng cao:** Phân tích sentiment chuyên sâu, dự đoán giá (Price Prediction), nhận diện trạng thái thị trường (Market Regime Detection) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 8, Mục 38; Image 162)*.
        *   **Kiến trúc nâng cao:** Áp dụng Redis, Kafka/RabbitMQ, Worker Pool, Microservices, CQRS, Event Sourcing, Plugin Architecture *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 8, Mục 38; Image 163)*.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   Tự động phân tích các liên kết website (TradingView, Blogger, Medium, GitHub Gist...) chứa script để tự bóc tách chiến lược *(Source: Observed từ UI, "UI_4.jpg")*.
    *   News Crawler cho phép thu thập tin tức theo thời gian cấu hình tự động (Auto refresh từ 1 phút đến 5 phút) *(Source: Observed từ UI, "UI_3.jpg")*.
    *   News Crawler hiển thị bảng dữ liệu phân bổ sentiment tổng hợp, chỉ số tin cậy (Confidence Score) của tin phân tích, số lượng tin đã xử lý trong 24h, độ bao phủ nguồn tin *(Source: Observed từ UI, "UI_3.jpg")*.
    *   Trực quan hóa backtest chi tiết kết hợp hiển thị các vùng giá Support/Resistance trực tiếp trên biểu đồ giá trị và bảng chi tiết giao dịch hỗ trợ phân trang hiển thị *(Source: Observed từ UI, "UI_2.jpg")*.
*   **Inferred (Suy diễn):** Không có.

### Ngoài phạm vi (Out of Scope)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   Không bắt buộc sinh viên phải xây dựng đầy đủ các phương pháp phân tích kỹ thuật vô cùng phức tạp như Smart Money Concepts (SMC) hay Wyckoff trong Strategy Engine mà chỉ cần chứng minh kiến trúc hệ thống sẵn sàng hỗ trợ chúng *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 3, Mục 11)*.
    *   Không bắt buộc sinh viên phải hiểu sâu về tài chính định lượng chuyên sâu *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 20)*.
    *   Không tập trung vào việc tìm kiếm ra chiến lược sinh lợi thực tế để đầu cơ kiếm tiền *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 7, Mục 39; Trang 9, Mục 47)*.
*   **Observed (Quan sát trực tiếp từ UI):** Không có.
*   **Inferred (Suy diễn):**
    *   Không tích hợp tính năng quản lý tài khoản giao dịch, không thực hiện giao dịch thực tế trên sàn (không tích hợp API trade thực tế của Binance/OKX hay nạp rút tiền số).

### Người dùng mục tiêu (Target Users)
*   **Explicit (Nói trực tiếp trong nguồn):** Không có.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   Sinh viên Nguyễn Minh học ngành Công nghệ thông tin / Kiến trúc phần mềm, đang sử dụng tài khoản dạng "Pro Student" có thời hạn đến 20/06/2025 *(Source: Observed từ UI, "UI_1.jpg", "UI_2.jpg", "UI_3.jpg", "UI_4.jpg", "UI_5.jpg")*.
*   **Inferred (Suy diễn):**
    *   Các trader cá nhân quan tâm đến phân tích kỹ thuật, nhà phân tích chiến lược, người dùng muốn tối ưu hóa chiến lược crypto dựa trên dữ liệu lịch sử và phân tích tin tức thị trường.

### Personas (Hình mẫu người dùng)
*   **Explicit (Nói trực tiếp trong nguồn):** Không có.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   Nguyễn Minh - Email: `student@example.com`. Là một sinh viên công nghệ, có nhu cầu sử dụng công cụ để trực quan hóa biểu đồ nến, giả lập thử nghiệm backtest đa khung thời gian để hoàn thành bài tập lớn môn học hoặc nghiên cứu chuyên sâu về giao dịch tự động *(Source: Observed từ UI, "UI_1.jpg", "UI_2.jpg", "UI_3.jpg", "UI_4.jpg", "UI_5.jpg")*.
*   **Inferred (Suy diễn):** Không có.

### Actors (Tác nhân hệ thống)
*   **Explicit (Nói trực tiếp trong nguồn):** Không có.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   Người dùng (User / Trader) trực tiếp điều khiển qua UI *(Source: Observed từ UI, "UI_1.jpg", "UI_2.jpg")*.
*   **Inferred (Suy diễn):**
    *   Quản trị viên hệ thống (System Administrator) - thực hiện vận hành các server, điều phối worker, giám sát database (gián tiếp suy ra từ cấu trúc vận hành worker pool và db).

### Vai trò người dùng (User Roles)
*   **Explicit (Nói trực tiếp trong nguồn):** Không có.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   Vai trò Nguyễn Minh thuộc nhóm phân quyền tài khoản **"Pro Student"** *(Source: Observed từ UI, "UI_1.jpg")*.
*   **Inferred (Suy diễn):**
    *   Hệ thống có thể chia làm vai trò "Student" thông thường (giới hạn tính năng hoặc tài nguyên) và "Pro Student" (hỗ trợ nhiều khung thời gian, tài nguyên worker backtest lớn hơn).

### Các hệ thống bên ngoài (External Systems)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   **Binance API & WebSocket:** Cung cấp dữ liệu giá crypto lịch sử và cập nhật thời gian thực *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 4, Mục 20)*.
    *   **OKX, Bybit, Coinbase API:** Các sàn giao dịch đề xuất kết nối bổ sung trong tương lai dưới dạng các Market Data Provider mới thông qua Adapter Pattern *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 20; Trang 7, Mục 41; "project_full_description.pdf", Trang 2, Mục Adapter Pattern; Image 19)*.
    *   **Machine Learning Service / Sentiment Service:** Phân loại cảm xúc tin tức (BERT model) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 29; Trang 7, Mục 44; "project_full_description.pdf", Trang 2)*.
    *   **Nguồn tin tức (News Providers):** Hệ thống RSS, News API, Web Crawler từ các trang tin điện tử (như CoinDesk, The Block, Decrypt, Cointelegraph, Bankless, The Defiant) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 27, 28; "project_full_description.pdf", Trang 1; Observed từ UI, "UI_3.jpg")*.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   **LLM Service (Dịch vụ mô hình ngôn ngữ lớn):** Cung cấp API tích hợp phân tích ngôn ngữ tự nhiên từ Prompt thành JSON chiến lược, bóc tách cấu trúc HTML thô của tin tức (LLM-assisted Extraction) và tự động sửa cấu trúc lỗi template (Self-healing extraction) *(Source: Observed từ UI, "UI_3.jpg", "UI_4.jpg")*.
    *   **External Strategy Platforms:** Gồm TradingView, Blogger, Medium, GitHub Gist... đóng vai trò làm link website chứa script chiến lược để bóc tách *(Source: Observed từ UI, "UI_4.jpg")*.
*   **Inferred (Suy diễn):** Không có.

### Các thành phần lớn được đề cập (Major Components)
*   **Explicit (Nói trực tiếp trong nguồn):**
    1.  **Module 1 – Realtime Market Data:** Nhận cập nhật giá Binance, gồm các Adapter (BinanceAdapter, OKXAdapter...) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 20; Image 18, 119)*.
    2.  **Module 2 – Multi-Timeframe Chart:** Hiển thị tối đa 4 chart trên một màn hình *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 21)*.
    3.  **Module 3 – Strategy Engine:** Tiếp nhận dữ liệu thị trường và tạo ra tín hiệu BUY, SELL, HOLD *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 22; Image 119)*.
    4.  **Module 4 – Strategy Plugin:** Quản lý đăng ký chiến lược mới dễ dàng thông qua Registry *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 12; Image 119)*.
    5.  **Module 5 – Composite Strategy:** Tổ hợp tín hiệu qua Combination Engine *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 13; Image 119)*.
    6.  **Module 6 – Strategy Search Engine:** Tự động sinh và thử nghiệm các tổ hợp chiến lược khác nhau thông qua bộ Strategy Generator *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 15; Image 92)*.
    7.  **Module 7 – Backtesting Engine / Backtester:** Giả lập giao dịch trên dữ liệu quá khứ và đánh giá metrics hiệu năng *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 19; Image 92, 119)*.
    8.  **Module 8 – Leaderboard / Ranking Service:** Quản lý xếp hạng, lưu trữ và lọc kết quả Top-K chiến lược *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 21; Image 92, 119)*.
    9.  **Module 9 – Continuous Strategy Loop:** Quản lý vòng loop ngầm liên tục tự động hóa quy trình tìm kiếm tối ưu chiến lược *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 23)*.
    10. **Module 10 – News Crawler:** Tin tức crawler/collector *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 27; Image 119)*.
    11. **Module 11 – Sentiment Analysis / Sentiment Service:** Phân loại cảm xúc tin tức thành các nhãn để lưu vào Sentiment Database *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 29; Image 119)*.
    12. **Database:** Lưu trữ 6 nhóm dữ liệu chính: Market Data, Strategy, Experiment, Trades, News, Leaderboard *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6, Mục 35)*.
    13. **Message Queue & Workers:** Bộ điều phối công việc hàng đợi backtest, gồm Producer, Message và các Consumer (Backtest Workers) nhằm xử lý song song *(Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 2, Tình huống 4; Image 92, 126, 183)*.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   **LLM Prompt Parser Module:** Bộ tiếp nhận prompt mô tả của người dùng, phân tích cú pháp, sinh ra các điều kiện LONG, SHORT, Quản trị rủi ro bằng JSON *(Source: Observed từ UI, "UI_4.jpg")*.
    *   **News Crawler Template Extractor with Self-healing Logic:** Bộ trích xuất HTML của tin tức thời gian thực hỗ trợ tính năng tự sửa lỗi cấu trúc trang nguồn *(Source: Observed từ UI, "UI_3.jpg")*.
*   **Inferred (Suy diễn):** Không có.

### Các ràng buộc dự án (Project Constraints)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   **Đội ngũ thực hiện:** Chỉ gồm có **4 sinh viên** *(Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 2, Tình huống 6)*.
    *   **Thời gian giới hạn:** Chỉ có **8 tuần** để hoàn thành và nộp bản sản phẩm thử nghiệm MVP *(Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 2, Tình huống 6)*.
    *   **Ràng buộc tài nguyên ban đầu:** Phiên bản MVP chạy duy nhất trên cụm **1 server + 1 database** *(Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục 2 & 6)*.
    *   **Ràng buộc chất lượng kiến trúc (5 Anti-patterns cần tránh):** Bắt buộc không vi phạm các lỗi thiết kế: God Service, Hard-coded Strategy, Frontend chứa logic nghiệp vụ nặng, Strategy truy cập trực tiếp database, và Crawler phụ thuộc chặt vào mô hình ML *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7, Mục 44; "project_full_description.pdf", Trang 2)*.
    *   Mọi quyết định lựa chọn công nghệ và component mở rộng phải bắt đầu từ một vấn đề thực tế, đúng vị trí và có sự đánh giá, trade-off rõ ràng, tránh over-engineering gượng ép *(Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục Component nào thực sự cần...)*.
*   **Observed (Quan sát trực tiếp từ UI):** Không có.
*   **Inferred (Suy diễn):** Không có.

### Giới hạn hệ thống (System Limitations)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   Hệ thống chart trên một màn hình chỉ giới hạn hiển thị **tối đa 4 biểu đồ độc lập** *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 4, Mục 21)*.
    *   Leaderboard chỉ lưu giữ và xếp hạng các chiến lược tốt nhất **ở mức quy mô Top K (K = 10)** *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 22)*.
    *   Tính tái lập (Reproducibility): Hệ thống bắt buộc quản lý phiên bản chiến lược, không được ghi đè (overwrite) kết quả cũ *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6, Mục 36; "project_full_description.pdf", Trang 2)*.
    *   Stop Condition bắt buộc: Loop Discovery chạy ngầm không được dùng vòng lặp vô hạn `while(true)` không kiểm soát mà phải có điều kiện dừng được cấu hình sẵn (VD: đạt giới hạn iterations, đạt mốc thời gian, hoặc kết quả không cải thiện sau số lần thử nhất định) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 23; "project_full_description.pdf", Trang 2)*.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   **Giới hạn mô tả chiến lược:** Ô nhập Prompt tối đa **1000 ký tự** *(Source: Observed từ UI, "UI_4.jpg")*.
    *   **Giới hạn hiển thị biểu đồ:** Mỗi ô biểu đồ thời gian thực tải tối đa **1000 nến lịch sử gần nhất** *(Source: Observed từ UI, "UI_5.jpg")*.
    *   **Giới hạn vốn giả lập:** backtest mặc định áp dụng mốc vốn ban đầu là **100 USD** *(Source: Observed từ UI, "UI_2.jpg"; "778426143_3961774807465063_4066970941457598332_n.jpg")*.
    *   **Giới hạn cấu hình dừng loop cụ thể:** Dừng khi kiểm tra đủ **100 candidates**, hoặc chạy liên tục **1 giờ**, hoặc **không cải thiện kết quả sau 50 vòng lặp (iterations)** *(Source: "project_full_description.pdf", Trang 2; Image 89)*.
*   **Inferred (Suy diễn):** Không có.

---

# 2. SYSTEM BOUNDARY (Ranh giới hệ thống)

### Hệ thống làm gì (System Responsibilities / Scope of Action)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   Lấy dữ liệu giá crypto nến lịch sử và giá thời gian thực của cặp BTCUSDT từ sàn Binance *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 4, Mục 20)*.
    *   Phát market update nến thời gian thực đến frontend với độ trễ thấp thông qua đường truyền WebSocket *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 20; Trang 7, Mục 32.3)*.
    *   Hiển thị tối đa 4 biểu đồ giá độc lập, tự động thay đổi khung thời gian của từng chart (1m, 5m, 15m, 1h, 4h, 1d) độc lập mà không cần reload trang *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 3; Trang 4, Mục 21)*.
    *   Trực quan hóa (visualize) Candlestick, Volume, chỉ báo MA, Bollinger Bands, vùng Support/Resistance, tín hiệu Buy/Sell, các điểm Entry/Exit, Stop Loss, Take Profit lên biểu đồ *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 4, Mục 21; Trang 5, Mục 25)*.
    *   Đăng ký chiến lược mới dễ dàng thông qua Registry pattern không sửa code cũ *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 12; "project_full_description.pdf", Trang 1)*.
    *   Tự động tổ hợp các chiến lược đơn lẻ bằng Majority Vote hoặc Weighted Score *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 5, Mục 13, 14)*.
    *   Tự động sinh và tìm kiếm tối ưu hóa tổ hợp chiến lược bằng thuật toán ngẫu nhiên (Random Search) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 5, Mục 15, 16)*.
    *   Giả lập giao dịch (backtest) trên dữ liệu quá khứ, tự động tính toán Return, Win Rate, Max Drawdown, Trades *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 5, Mục 19, 20)*.
    *   Xếp hạng các strategy dựa trên hiệu quả giao dịch và hiển thị Top-10 trên Leaderboard tự động mà không cần reload trang *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2 & 3; Trang 5, Mục 21, 22)*.
    *   Vận hành vòng lặp ngầm liên tục (Continuous Strategy Loop) tự động hóa quy trình tìm kiếm chiến lược ứng viên, thực thi backtest, chấm điểm, xếp hạng cho đến khi đạt Stop Condition *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 23)*.
    *   Thu thập tin tức, chuẩn hóa thành thực thể `NewsItem` đồng nhất từ nhiều nhà cung cấp dữ liệu tin tức *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 27, 28)*.
    *   Phân tích sentiment của tin tức bằng ML, phân loại thành nhãn POSITIVE/NEGATIVE/NEUTRAL và tích hợp sentiment thành một trading strategy độc lập (NewsSentimentStrategy) trong Strategy Engine *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 5, Mục 29; Trang 6, Mục 30)*.
    *   Lưu trữ kết quả thực nghiệm lâu dài và lưu trữ phiên bản chiến lược cụ thể trong MySQL database *(Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục 5; "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6, Mục 35)*.
    *   Xử lý ngắt kết nối WebSocket sàn Binancegracefully (reconnect, retry, đảm bảo không mất dữ liệu nến) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7, Mục 32.4; "project_full_description.pdf", Trang 2)*.
    *   Giảm coupling giữa các thành phần thông qua kiến trúc hướng sự kiện phi tập trung với các Event như `StrategyEvaluatedEvent`, `LeaderboardUpdated` *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6, Mục 34; "project_full_description.pdf", Trang 2)*.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   Cho phép phân tích prompt mô tả chiến lược thành cấu trúc điều kiện LONG, SHORT bằng mô hình LLM, tự động kiểm tra logic, rà soát thiếu trường bắt buộc, kiểm định chỉ báo hỗ trợ và cấp trạng thái hợp lệ để lưu vào thư viện chiến lược *(Source: Observed từ UI, "UI_4.jpg")*.
    *   Cho phép bóc tách cấu trúc HTML thô của tin tức dựa trên LLM (LLM-assisted Extraction) thành các trường dữ liệu tiêu đề, tóm tắt, nguồn, thời gian, tài sản coin liên quan đi kèm điểm số tin cậy cụ thể *(Source: Observed từ UI, "UI_3.jpg")*.
    *   Thực thi cơ chế tự phục hồi lỗi cấu trúc trích xuất tin tức (Self-healing extraction) hoạt động bằng cách đo lường tỷ lệ lỗi (VD: tỷ lệ lỗi vượt ngưỡng 10% sẽ kích hoạt LLM sửa đổi template và tự động lưu phiên bản mẫu trích xuất mới v1.4.3 để áp dụng ngay) *(Source: Observed từ UI, "UI_3.jpg")*.
    *   Cung cấp bảng biểu phân tích chi tiết kết quả backtest (vẽ biểu đồ giá, khối lượng đi kèm các nhãn Long Entry, Short Entry, Take Profit, Stop Loss, Exit rõ ràng trực quan) và hiển thị bảng 178 danh sách lệnh giao dịch cụ thể chứa đầy đủ phí giao dịch và độ trượt giá *(Source: Observed từ UI, "UI_2.jpg")*.
    *   Giải quyết trùng lặp nến khi cập nhật nến thời gian thực bằng cơ chế: nếu trùng nến cuối thì ghi đè (Update candle), nếu xuất hiện nến mới hoàn toàn thì nối thêm vào hàng đợi (Append candle) *(Source: Observed từ UI, "UI_5.jpg")*.
    *   Cho phép người dùng chọn nhanh các chiến lược kết hợp được gợi ý sẵn (VD: MA + RSI, RSI + Bollinger, MA + RSI + S/R) *(Source: Observed từ UI, "UI_1.jpg")*.
    *   Hiển thị tiến trình Discovery Loop thực tế (VD: Iteration hiện tại 47/500, Best strategy so far, tổng số candidates đã kiểm tra) *(Source: Observed từ UI, "UI_1.jpg")*.
*   **Inferred (Suy diễn):** Không có.

### Hệ thống không làm gì (System Exclusions / Out of System Scope)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   Không gửi lệnh giao dịch thực tế lên sàn giao dịch Binance hay bất kỳ sàn giao dịch nào *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 9, Mục 47)*.
    *   Không đóng vai trò tìm kiếm chiến lược đầu tư sinh lợi tài chính tuyệt đối để kiếm tiền thật *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2, Trang 7, Mục 39; Trang 9, Mục 47)*.
    *   Frontend tuyệt đối không tính toán trực tiếp chiến lược giao dịch, backtest hay lợi nhuận, mà logic nghiệp vụ này hoàn toàn xử lý ở phía Backend *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7, Mục 44; "project_full_description.pdf", Trang 2)*.
    *   Hệ thống không được kết nối Frontend trực tiếp với Binance API để tránh phụ thuộc *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 20)*.
    *   Chiến lược giao dịch trong Strategy Engine tuyệt đối không được truy cập và đọc dữ liệu trực tiếp từ cơ sở dữ liệu (Database), mà phải nhận qua lớp trừu tượng (Abstraction) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7, Mục 44; "project_full_description.pdf", Trang 2)*.
    *   Vòng lặp ngầm (Continuous Loop) không được chạy vô hạn bằng lệnh `while(true)` không có kiểm soát mà bắt buộc phải chịu sự quản trị của Stop Condition *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 23; "project_full_description.pdf", Trang 2)*.
    *   Trình crawl tin tức tuyệt đối không được thiết kế phụ thuộc chặt (gắn cứng) với một mô hình ML phân tích sentiment cụ thể (như BERT) nhằm bảo đảm tính dễ thay đổi *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7, Mục 44; "project_full_description.pdf", Trang 2)*.
*   **Observed (Quan sát trực tiếp từ UI):** Không có.
*   **Inferred (Suy diễn):**
    *   Hệ thống không quản lý ví cá nhân, tài sản số thực tế, không hỗ trợ chức năng nạp rút tiền hoặc các hoạt động nạp rút tiền tệ pháp định (fiat).

### Những chức năng thuộc hệ thống (Internal System Functions)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   Realtime WebSocket Price updates push to UI *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 20)*.
    *   Multi-Timeframe Chart visualization with individual timeframe switches *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 21)*.
    *   Indicator calculation (MA, RSI, Bollinger Bands, Support/Resistance) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 21)*.
    *   Strategy Registration & Plugin management *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 12)*.
    *   Composite Strategy Voting Calculation *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 13, 14)*.
    *   Strategy Search Strategy generation (Random Search) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 15, 16)*.
    *   Historical Transaction backtest simulator & Metrics Evaluation *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 19, 20)*.
    *   Leaderboard Ranking management & filtration *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 21, 22)*.
    *   Continuous Strategy Loop worker dispatching, pausing, resuming, retry management *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 23, 24)*.
    *   News Collector normalization pipeline *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Trang 27, 28)*.
    *   Sentiment Analysis matching with strategy execution *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 29; Trang 6, Mục 30)*.
    *   Database Management for Candidates, Candles, Experiments, News, Trades, and Leaderboards *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6, Mục 35)*.
    *   Broker Event Publishing System *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6, Mục 34)*.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   LLM-assisted Prompt Parsing & Strategy JSON schema generation *(Source: Observed từ UI, "UI_4.jpg")*.
    *   Link Strategy Web Parser (bóc tách script từ TradingView, Blogger, Medium...) *(Source: Observed từ UI, "UI_4.jpg")*.
    *   LLM news HTML parser and self-healing extraction templates supervisor *(Source: Observed từ UI, "UI_3.jpg")*.
    *   Transaction Cost & Slippage simulation adjuster *(Source: Observed từ UI, "UI_2.jpg")*.
    *   Duplicate / New Candle update detector *(Source: Observed từ UI, "UI_5.jpg")*.
*   **Inferred (Suy diễn):**
    *   Hệ thống xác thực và quản lý gói tài khoản (VD: "Pro Student").

### Những chức năng phụ thuộc hệ thống bên ngoài (External System Functions)
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   Nhận luồng dữ liệu K-line/Candlestick trực tiếp từ sàn Binance *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 20)*.
    *   Phân tích nhãn cảm xúc tin tức thị trường (POSITIVE, NEGATIVE, NEUTRAL) thông qua Sentiment Service sử dụng mô hình học máy bên ngoài *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 5, Mục 29; Trang 7, Mục 44)*.
    *   Nhận thông tin thô của thị trường từ các website tin tức điện tử *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 27)*.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   Xử lý tự nhiên ngôn ngữ và trích xuất cấu trúc dữ liệu chiến lược từ Prompt/URL phụ thuộc hoàn toàn vào dịch vụ API của mô hình ngôn ngữ lớn (LLM) bên ngoài *(Source: Observed từ UI, "UI_3.jpg", "UI_4.jpg")*.
*   **Inferred (Suy diễn):** Không có.

### Các external systems & external data sources
*   **Explicit (Nói trực tiếp trong nguồn):**
    *   **Binance API & WebSocket:** Nguồn cung cấp giá lịch sử và thời gian thực *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 4, Mục 20)*.
    *   **OKX, Bybit, Coinbase API:** Đề xuất làm nguồn dữ liệu nến bổ sung *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 20; Trang 7, Mục 41; Image 19)*.
    *   **External News feeds (RSS, News API, Web crawlers):** Của các trang tin Coindesk, The Block, Decrypt, Cointelegraph, Bankless, The Defiant *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 27, 28; Observed từ UI, "UI_3.jpg")*.
    *   **Sentiment Machine Learning Model (như BERT):** Để xử lý dữ liệu tâm lý *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 29; Trang 7, Mục 44)*.
*   **Observed (Quan sát trực tiếp từ UI):**
    *   **Large Language Model (LLM):** Đóng vai trò là hệ thống bên ngoài để phân tích Prompt và cấu trúc HTML trích xuất tin *(Source: Observed từ UI, "UI_3.jpg", "UI_4.jpg")*.
    *   **TradingView, Blogger, Medium, GitHub Gist:** Đóng vai trò là nguồn dữ liệu import link chiến lược *(Source: Observed từ UI, "UI_4.jpg")*.
*   **Inferred (Suy diễn):** Không có.

---

# 3. ACTORS (Tác nhân hệ thống)

### ACTOR 1: USER / TRADER (Người dùng / Nhà giao dịch)
*   **Name (Tên tác nhân):** User / Trader / Nguyễn Minh *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 5, Mục 25; "UI_1.jpg")*.
*   **Description (Mô tả):**
    *   Người dùng tương tác trực tiếp với giao diện Frontend của hệ thống để phân tích xu hướng thị trường, định nghĩa và kiểm thử hiệu năng chiến lược giao dịch tự động thông qua dữ liệu lịch sử hoặc phân tích tâm lý tin tức *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 5, Mục 25)*.
    *   Trong bối cảnh thực tế bài học, người dùng được minh họa cụ thể bằng sinh viên mang tên Nguyễn Minh đang sử dụng tài khoản dạng "Pro Student" *(Source: Observed từ UI, "UI_1.jpg")*.
*   **Role (Vai trò):**
    *   Nhà nghiên cứu chiến lược (Strategy Researcher) / Người dùng kiểm thử giao dịch (Trading Evaluator).
*   **Capabilities (Khả năng):**
    *   Theo dõi 4 biểu đồ nến thời gian thực của cặp BTCUSDT đồng thời và thay đổi khung thời gian của từng chart hoàn toàn độc lập *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 4, Mục 21)*.
    *   Xem trực quan hóa các chỉ báo (MA, Bollinger Bands, Support/Resistance), các tín hiệu Buy/Sell, Entry/Exit, Stop Loss, Take Profit trên biểu đồ giá *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 4, Mục 21)*.
    *   Tự tạo hoặc bổ sung chiến lược đơn lẻ vào thư viện *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 4, Mục 12)*.
    *   Thiết lập quy tắc kết hợp nhiều chiến lược thành một Composite Strategy (Majority Vote hoặc Weighted Combination) *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 5, Mục 13, 14)*.
    *   Cấu hình tham số và thực thi Backtest chiến lược trên dữ liệu lịch sử lịch sử *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 5, Mục 19)*.
    *   Đọc xếp hạng các chiến lược tốt nhất và lọc/sắp xếp bảng xếp hạng Top-K Leaderboard *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 5, Mục 21, 22)*.
    *   Kích hoạt chạy vòng lặp ngầm liên tục (Continuous Strategy Loop) để tự động hóa quy trình tìm kiếm chiến lược ứng viên tối ưu *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 23)*.
    *   Cấu hình nguồn bò tin tức và theo dõi kết quả tổng hợp Sentiment phân tích thị trường *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 2; Trang 5, Mục 27, 29)*.
*   **Interactions with system (Tương tác với hệ thống):**
    *   **Thao tác trên màn hình Realtime:** Chọn cặp tiền, chọn khung thời gian và bật/tắt chế độ nhận dữ liệu Realtime *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 21; Observed từ UI, "UI_5.jpg")*.
    *   **Thao tác trên màn hình Strategy Engine:** Nhập prompt mô tả chiến lược (tối đa 1000 ký tự) hoặc dán link URL, nhấn nút "Phân tích bằng LLM" hoặc "Trích xuất từ website" để nhận lại định nghĩa chiến lược JSON tự động từ hệ thống. Tiếp đó, người dùng đặt tên chiến lược, gắn tag và nhấn "Lưu Strategy" để đưa vào thư viện *(Source: Observed từ UI, "UI_4.jpg"; "773981388_1629771268733623_2672886499038526550_n.jpg")*.
    *   **Thao tác trên màn hình Discovery:** Chọn các chiến lược đơn lẻ cần kết hợp, điều chỉnh trọng số (slider từ 0.00 đến 1.00) để quy định ngưỡng vào lệnh, chọn phương pháp Discovery (Random Search, Domain-guided Search hoặc Genetic Search), và bấm nút "START SEARCH" để chạy hoặc "Lưu strategy kết hợp" hoặc "Backtest ngay" *(Source: Observed từ UI, "UI_1.jpg"; "778426143_3961774807465063_4066970941457598332_n.jpg")*.
    *   **Thao tác trên màn hình Backtest:** Lựa chọn Pair, Timeframe, khoảng thời gian (From date - To date), vốn (USD), chọn chiến lược cần test trong dropdown, điều chỉnh phí giao dịch (%), mức trượt giá (bps), và kích hoạt test để xem biểu đồ kết quả cùng bảng danh sách giao dịch chi tiết *(Source: Observed từ UI, "UI_2.jpg")*.
    *   **Thao tác trên màn hình News Crawler:** Chọn nguồn thu thập (Website, RSS, HTML), cấu hình thời gian Auto refresh, chọn cặp tài sản áp dụng (BTC, ETH, SOL...), nhấn "Cấu hình nguồn" và bấm "Bắt đầu crawl" *(Source: Observed từ UI, "UI_3.jpg")*.

### ACTOR 2: SYSTEM DEVELOPER / OPERATOR (Nhà phát triển / Người vận hành hệ thống)
*   **Name (Tên tác nhân):** System Developer / Operator / Nhóm phát triển *(Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 2, Tình huống 6; "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7, Mục 41, 45)*.
*   **Description (Mô tả):**
    *   Nhóm sinh viên chịu trách nhiệm thiết kế, triển khai mã nguồn, cấu hình hạ tầng phần mềm, phân tích trade-off và bảo trì vận hành hệ thống Crypto Strategy Lab hoạt động ổn định *(Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Mục Component nào thực sự cần...; Trang 2, Tình huống 6)*.
*   **Role (Vai trò):**
    *   Kiến trúc sư phần mềm (Software Architect) / Nhà phát triển (Developer) / Người vận hành (System Operator).
*   **Capabilities (Khả năng):**
    *   Thiết kế và triển khai mã nguồn toàn bộ hệ thống (MVP ban đầu gồm 1 server + 1 database; cấu hình scale-out load balancer, cache, sharding database, queue và worker pool khi mở rộng hệ thống) *(Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 1, Tình huống 1, 2, 3, 4, 5, 6)*.
    *   Bổ sung chiến lược mới dễ dàng bằng cách viết một class chiến lược mới kế thừa `Strategy` interface và gọi đăng ký thông qua `StrategyRegistry.register(NewStrategy)` mà không phải sửa đổi cấu trúc Strategy Engine hiện tại *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 4, Mục 12; Trang 7, Mục 41; Image 173)*.
    *   Bổ sung Market Data Provider mới dễ dàng thông qua Adapter Pattern *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7, Mục 41; "project_full_description.pdf", Trang 2)*.
    *   Thay đổi thuật toán tìm kiếm chiến lược (ví dụ thay đổi từ Random Search sang Domain-guided Search hoặc Genetic Search) độc lập, không ảnh hưởng đến Backtesting Engine hiện tại *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7, Mục 32.6, 41)*.
    *   Vận hành và giám sát (monitor) vòng lặp ngầm: loop đang chạy hay dừng, số lượng chiến lược đã thử nghiệm, thời gian chạy backtest, số lượng job lỗi của worker pool, và xác định chiến lược đứng Top 1 hiện tại *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7, Mục 32.7; Image 129, 130)*.
    *   Kiểm tra tính tái lập (Reproducibility) của thực nghiệm kết quả trên Leaderboard bằng cách đối chiếu chính xác phiên bản strategy lưu trữ trong database *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 6, Mục 36; Trang 7, Mục 40.8)*.
*   **Interactions with system (Tương tác với hệ thống):**
    *   Triển khai mã nguồn hoàn chỉnh vào repository, viết hướng dẫn cài đặt, khởi chạy (README), xây dựng tài liệu kiến trúc, mô tả các quyết định kiến trúc quan trọng (ADR) và chuẩn bị demo kịch bản vận hành hệ thống *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 7, Mục 45)*.
    *   Trực tiếp can thiệp vào mã nguồn backend để cấu hình các worker trong Worker Pool, điều phối Job Queue, tối ưu hóa câu lệnh truy vấn database MySQL/cache Redis khi số lượng experiments lên đến hàng triệu *(Source: "Bai_tap_nhom_Architecture_Fit_Crypto_Strategy_Lab.docx.pdf", Trang 2, Tình huống 3, 4, 5)*.

---

### 📊 Điểm mâu thuẫn hoặc biến thể cần lưu ý giữa các nguồn (No Conflict Resolution)

Để hỗ trợ bạn viết **Software Specification** tốt nhất, dưới đây là thống kê các điểm khác biệt nhỏ về dữ liệu đầu vào giữa tài liệu lý thuyết (PDF) và thiết kế mockup giao diện thực tế (UI) cần giữ lại để xem xét:

1.  **Về Khung thời gian (Timeframes):**
    *   *Tài liệu lý thuyết viết:* Hệ thống hỗ trợ tối đa 4 khung thời gian đồng thời trên màn hình, ví dụ có thể đổi: 5m $\rightarrow$ 1m, 15m $\rightarrow$ 30m, 1h $\rightarrow$ 2h, 4h $\rightarrow$ 1d *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 1, Mục 3; Trang 4, Mục 21)*.
    *   * Mockup thực tế hiển thị:*
        *   Màn hình Realtime *(UI_5.jpg)* hiển thị 4 biểu đồ với các khung mặc định là: **1m, 5m, 15m, 1h** và hỗ trợ các nút chuyển đổi nhanh gồm: **1m, 5m, 15m, 1h, 4h**.
        *   Màn hình Backtest *(UI_2.jpg)* hiển thị dropdown chọn khung thời gian chỉ có tùy chọn **5m** (đang chọn).
2.  **Về cách tính điểm tổng hợp chiến lược (Overall Score / Signals Scoring):**
    *   *Phục vụ tổ hợp tín hiệu (Weighted Voting):* Công thức tính tín hiệu kết hợp là: $Score = MA \times 0.2 + RSI \times 0.3 + SR \times 0.5$ với điều kiện vào lệnh $|score| \ge 0.30$ *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 14; Observed từ UI, "UI_1.jpg")*.
    *   *Phục vụ đánh giá xếp hạng (Leaderboard Score):* Công thức tính điểm tổng hợp để xếp hạng chiến lược trên Leaderboard là: $Score = 0.5 \times Return + 0.2 \times WinRate + 0.3 \times RiskScore$ *(Source: "Crypto Strategy Lab – Đồ án cuối kỳ.pdf", Trang 5, Mục 21; Image 80)*.

---

📝 **Bước tiếp theo:** Dựa trên kho thông tin (Information Inventory) cực kỳ chi tiết này, tôi có thể giúp bạn soạn thảo cấu trúc một bản **Đặc tả yêu cầu phần mềm (Software Requirement Specification - SRS)** chuẩn IEEE để định hình đầy đủ các yêu cầu chức năng (Functional Requirements) và yêu cầu phi chức năng (Non-functional Requirements) cho đồ án của bạn nhé?