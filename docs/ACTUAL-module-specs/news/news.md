# Phân Tích Kiến Trúc & Cách Hoạt Động Phân Hệ Tin Tức (News Module)

> **Tài liệu tham chiếu trong dự án**:
>
> - [01-repository-architecture-evidence.md](file:///home/ltp/Code/Course/Software_Architecture/Project/crypto-strategy-lab/temp/01-repository-architecture-evidence.md)
> - [02-news-sentiment-deep-analysis.md](file:///home/ltp/Code/Course/Software_Architecture/Project/crypto-strategy-lab/temp/02-news-sentiment-deep-analysis.md)
> - [report-news.md](file:///home/ltp/Code/Course/Software_Architecture/Project/crypto-strategy-lab/temp/report-news.md)
> - [architecture-c4-component-news.puml](file:///home/ltp/Code/Course/Software_Architecture/Project/crypto-strategy-lab/temp/architecture-c4-component-news.puml)
> - [flow-news-crawl.puml](file:///home/ltp/Code/Course/Software_Architecture/Project/crypto-strategy-lab/temp/flow-news-crawl.puml)

---

## 1. Tổng Quan Phân Hệ Tin Tức

**News Module (Mô-đun 10)** là phân hệ chịu trách nhiệm thu thập thông tin thị trường phi cấu trúc từ các nguồn tin tức công khai (RSS, HTML Web, REST API), thực hiện chuẩn hóa dữ liệu, bóc tách thực thể tiền mã hóa (coin tags), đánh giá cảm xúc văn bản, và lưu trữ vào cơ sở dữ liệu để phục vụ hiển thị cho người dùng cũng như cung cấp tín hiệu định lượng cho bộ máy Backtest.

### Nhiệm vụ cốt lõi:

1. **Thu thập tin tức đa nguồn (Multi-Source Ingestion)**: Cào dữ liệu theo chu kỳ từ các trang báo crypto lớn (CoinDesk, Cointelegraph, Binance News) dựa trên cấu hình YAML.
2. **Làm sạch & Chuẩn hóa (Cleaning & Normalization)**: Loại bỏ thẻ HTML rác, unescape các thực thể ký tự đặc biệt, chuẩn hóa URL tuyệt đối để phục vụ định danh duy nhất.
3. **Bóc tách thực thể (Coin Entity Extraction)**: Tự động quét và nhận diện các mã coin được nhắc tới trong tiêu đề và nội dung bài viết (`BTC`, `ETH`, `SOL`, `XRP`...).
4. **Cô lập kiến trúc & Độc lập dữ liệu (Architectural Decoupling)**: Hoàn toàn không phụ thuộc vào luồng dữ liệu giá thời gian thực (`MarketDataModule`). Sự cố mạng khi cào tin tức không thể làm gián đoạn việc khớp lệnh hay luồng WebSocket đẩy giá.
5. **Mô hình tiến trình kép (Dual-Runtime Architecture)**: Tầng HTTP REST và hàng đợi chạy trong **Node.js 22 (NestJS)**; toàn bộ tác vụ cào tin nặng và xử lý văn bản chạy trong một tiến trình con ngắn hạn **Python 3.13** (`workers/news/main.py`).

---

## 2. Sơ Đồ Kiến Trúc Hệ Thống (C4 Level 1 → Level 3)

### 2.1. C4 Level 1 — System Context

```mermaid
C4Context
    title System Context — News Module (Thu thập Tin tức)

    Person(user, "Trader / Người dùng", "Xem danh sách tin tức tiền mã hóa, lọc bài viết theo coin/sentiment, và kích hoạt cào tin mới.")
    System(system, "Crypto Strategy Lab - News Module", "Thu thập, làm sạch, trích xuất mã coin, gắn nhãn sentiment và phục vụ dữ liệu tin tức.")
    System_Ext(newsOutlets, "Cổng Tin tức Bên ngoài", "CoinDesk, Cointelegraph, Binance News (RSS feeds & trang web HTML).")

    Rel(user, system, "Xem danh sách tin tức, kích hoạt / hủy cào tin", "HTTPS / REST")
    Rel(system, newsOutlets, "Tải nội dung RSS XML và trang HTML", "HTTP GET")
```

### 2.2. C4 Level 2 — Container View

```mermaid
C4Container
    title Container Diagram — News Module (Level 2)

    Person(user, "Trader", "Người dùng tương tác qua giao diện web.")

    Container_Boundary(csl, "Crypto Strategy Lab System") {
        Container(spa, "Web Platform", "React 19, Vite", "Hiển thị danh sách tin tức, bộ lọc sentiment, nút kích hoạt/hủy cào tin.")
        Container(api, "API Application", "Node.js 22, NestJS (main.ts)", "Cung cấp REST API (/news, /news/crawl), đưa job vào Redis, truy vấn dữ liệu tin tức trả về client.")
        Container(worker, "Worker Runtime", "Node.js 22 (worker.ts)", "Lắng nghe hàng đợi 'news-crawl' và quản lý vòng đời tiến trình con Python.")
        ContainerDb(redis, "Redis 7", "Redis Alpine", "Lưu trữ hàng đợi BullMQ 'news-crawl' và cờ hủy tác vụ cancelRequested.")
        Container(py_news, "Python News Worker", "Python 3.13 (workers/news/main.py)", "Tiến trình con độc lập cào tin tức đa nguồn, phân tích cảm xúc và lưu DB.")
        ContainerDb(db, "PostgreSQL Database", "Table: news", "Lưu trữ các bài viết chuẩn hóa, nhãn cảm xúc, độ tin cậy và danh sách coin.")
    }

    System_Ext(ext_news, "Nguồn Tin tức Ngoài", "CoinDesk, Cointelegraph, Binance News.")

    Rel(user, spa, "Xem tin & điều khiển cào tin", "HTTPS")
    Rel(spa, api, "Gọi REST API", "HTTP REST")
    Rel(api, redis, "Đưa job 'news-crawl' vào hàng đợi", "Redis Protocol")
    Rel(redis, worker, "Điều phối job cho NewsCrawlProcessor", "BullMQ")
    Rel(worker, py_news, "Khởi chạy tiến trình con workers/news/main.py", "OS child_process")
    Rel(py_news, ext_news, "Cào RSS / HTML", "HTTP GET")
    Rel(py_news, db, "Ghi bài viết trực tiếp qua psycopg2 UPSERT", "TCP 5432")
    Rel(api, db, "Truy vấn phân trang và lọc tin tức", "TCP 5432")
```

### 2.3. C4 Level 3 — Component Diagram

```mermaid
C4Component
    title Component Diagram — Phân hệ Tin tức (Level 3)

    Container_Boundary(api_proc, "API Process (service/src/modules/news)") {
        Component(nc, "NewsController", "NestJS Controller", "Endpoints: GET /news, POST /news/crawl, GET /news/crawl/status, POST /news/crawl/cancel.")
        Component(ns, "NewsService", "NestJS Service", "Xử lý phân trang, lọc theo coin/thời gian, loại bỏ thẻ HTML thừa trước khi trả về.")
        Component(ncqs, "NewsCrawlQueueService", "BullMQ Producer", "Đẩy job vào 'news-crawl', kiểm tra chống cào trùng lặp (coalescing).")
    }

    Container_Boundary(worker_proc, "Worker Process (service/src/modules/news/crawl)") {
        Component(ncp, "NewsCrawlProcessor", "BullMQ Consumer (concurrency: 1)", "Kéo job cào tin, định kỳ poll cờ cancelRequested trên Redis để hỗ trợ hủy tác vụ.")
        Component(ncs, "NewsCrawlService", "Subprocess Manager", "Gọi child_process.spawn thực thi main.py, áp đặt timeout 10 phút, đọc JSON summary ra stdout.")
    }

    Container_Boundary(shared_zone, "Shared Repositories & Precompute") {
        Component(nr_ts, "NewsRepository (TypeScript)", "NestJS Repository", "Thực hiện các câu lệnh SELECT đọc và tổng hợp thống kê tin tức từ SQL.")
        Component(nsp, "NewsSentimentPrecomputeService", "NestJS Service", "Thuật toán two-pointer quét cửa sổ trượt để tiền tính toán mảng điểm cảm xúc cho Backtest.")
    }

    Container_Boundary(py_crawler, "Python Auxiliary Worker (workers/news)") {
        Component(py_main, "main.py", "CLI Orchestrator", "Nạp cấu hình YAML, điều phối cào tin, gọi phân tích cảm xúc và lưu DB.")
        Component(py_core, "NewsCrawler", "Pipeline Coordinator", "Điều phối chuỗi: Fetch -> Parse -> Normalize -> Extract -> Validate -> Deduplicate.")
        Component(py_fetch, "HTTPFetcher", "HTTP Client", "Thực hiện HTTP GET với custom User-Agent và timeout.")
        Component(py_parse, "ParserFactory", "Factory", "Khởi tạo RSSParser hoặc HTMLParser theo cấu hình nguồn tin.")
        Component(py_norm, "NewsNormalizer", "Text Cleaner", "Chuẩn hóa URL, xóa thẻ rác, giải mã HTML entities.")
        Component(py_ext, "CoinEntityExtractor", "Entity Extractor", "Khớp biểu thức chính quy (Regex) gắn tag coin (BTC, ETH...).")
        Component(py_val, "NewsValidator", "Validator", "Kiểm tra độ dài tối thiểu của tiêu đề, nội dung và tính hợp lệ của URL.")
        Component(py_repo, "NewsRepository (Python)", "psycopg2 Repository", "Thực thi lệnh INSERT INTO news ... ON CONFLICT (url) DO UPDATE.")
    }

    ContainerDb(db, "PostgreSQL Database", "Table: news", "Bảng lưu trữ bài viết, sentiment và mã coin.")
    ContainerQueue(redis_q, "Redis 7", "Queue 'news-crawl'", "Hàng đợi quản lý job cào tin.")
    System_Ext(ext_outlets, "External News Outlets", "RSS feeds & HTML pages.")

    Rel(nc, ns, "Gọi lấy danh sách tin", "Method Call")
    Rel(nc, ncqs, "Kích hoạt / hủy cào tin", "Method Call")
    Rel(ns, nr_ts, "Đọc dữ liệu tin tức", "Method Call")
    Rel(ncqs, redis_q, "Đưa job vào queue", "Redis Protocol")

    Rel(redis_q, ncp, "Dispatch job", "BullMQ")
    Rel(ncp, ncs, "Yêu cầu thực thi", "Method Call")
    Rel(ncs, py_main, "Spawn tiến trình con", "child_process")

    Rel(py_main, py_core, "Chạy pipeline cào tin", "Python Call")
    Rel(py_core, py_fetch, "Tải dữ liệu web", "Python Call")
    Rel(py_fetch, ext_outlets, "HTTP GET", "HTTPS")
    Rel(py_core, py_parse, "Parse nội dung", "Python Call")
    Rel(py_core, py_norm, "Làm sạch & chuẩn hóa", "Python Call")
    Rel(py_core, py_ext, "Trích xuất mã coin", "Python Call")
    Rel(py_core, py_val, "Kiểm tra tính hợp lệ", "Python Call")

    Rel(py_main, py_repo, "Lưu danh sách NewsItem hợp lệ", "Python Call")
    Rel(py_repo, db, "Batch UPSERT", "SQL")
    Rel(nr_ts, db, "SELECT dữ liệu", "SQL")
    Rel(nsp, db, "Đọc tin tức trong dải nến", "SQL")
```

---

## 3. Phân Tích Chi Tiết Các Thành Phần

### 3.1. Bảng Thành phần (Component Inventory)

| Component                                | Trách nhiệm                                   | Input                                                                | Output                                                           | Phụ thuộc                                       |
| :--------------------------------------- | :---------------------------------------------- | :------------------------------------------------------------------- | :--------------------------------------------------------------- | :------------------------------------------------ |
| **NewsController**                 | Cung cấp REST endpoints cho tin tức           | HTTP Requests (`/news`, `/news/crawl`, `/status`, `/cancel`) | HTTP JSON Response                                               | `NewsService`, `NewsCrawlQueueService`        |
| **NewsService**                    | Nghiệp vụ hiển thị tin tức                 | Tham số lọc (coin, khoảng thời gian, sentiment, trang)           | Danh sách bài viết sạch thẻ HTML                            | `NewsRepository (TypeScript)`                   |
| **NewsCrawlQueueService**          | Producer hàng đợi cào tin tức              | Yêu cầu cào tin từ người dùng                                 | Thêm job vào`'news-crawl'`, chống trùng lặp job           | BullMQ`Queue`                                   |
| **NewsCrawlProcessor**             | Consumer hàng đợi cào tin tức              | Job data từ BullMQ (concurrency = 1)                                | Điều phối tiến trình con Python, lắng nghe cờ hủy        | `NewsCrawlService`, BullMQ                      |
| **NewsCrawlService**               | Quản lý tiến trình cào tin bên ngoài     | Lệnh chạy kèm thời gian timeout 10 phút                         | Chuỗi JSON tổng hợp (`NEWS_CRAWL_SUMMARY`) từ stdout       | `child_process.spawn`, Python CLI               |
| **NewsRepository (TypeScript)**    | Truy vấn dữ liệu tin tức từ SQL            | Điều kiện lọc SQL                                                | Danh sách bài viết và các thống kê phân trang            | `DatabaseService` (PostgreSQL)                  |
| **NewsSentimentPrecomputeService** | Tiền tính toán điểm cảm xúc cho Backtest | Dải nến (`candles`) của đợt thử nghiệm                      | Mảng điểm cảm xúc`SignalContext.sentimentScores`          | `DatabaseService`                               |
| **main.py (Python)**               | Điểm vào của tiến trình cào tin tức     | Cấu hình nguồn tin từ YAML                                       | Điều phối crawler, gọi sentiment và lưu DB                 | `NewsCrawler`, `NewsRepository (Python)`      |
| **NewsCrawler (Python)**           | Điều phối luồng xử lý cào tin            | Danh sách cấu hình nguồn tin                                     | Mảng`NewsItem` đã làm sạch và loại trùng               | Fetcher, Parser, Normalizer, Extractor, Validator |
| **HTTPFetcher (Python)**           | Tải mã nguồn HTML và RSS feed               | URL nguồn tin, User-Agent, timeout                                  | Chuỗi thô HTML / XML                                           | `requests` / `urllib`                         |
| **ParserFactory (Python)**         | Khởi tạo parser theo loại nguồn tin         | Định dạng nguồn (`rss`, `html`, `api`)                     | Thể hiện tương ứng (`RSSParser`, `HTMLParser`)          | `BeautifulSoup4`, `feedparser`                |
| **NewsNormalizer (Python)**        | Làm sạch và chuẩn hóa văn bản            | Dữ liệu văn bản thô, URL ban đầu                              | Văn bản sạch, unescape HTML, URL tuyệt đối                 | Python built-ins                                  |
| **CoinEntityExtractor (Python)**   | Bóc tách mã coin liên quan                  | Tiêu đề và nội dung bài viết                                  | Danh sách mã coin (`["BTC", "ETH"]`...)                      | Regex Token Patterns                              |
| **NewsValidator (Python)**         | Xác thực bài viết hợp lệ                  | Dữ liệu bài viết                                                 | `True` / `False` (loại bỏ bài thiếu trường bắt buộc) | Quy tắc độ dài tối thiểu                    |
| **NewsRepository (Python)**        | Lưu bài viết trực tiếp vào database       | Danh sách`NewsItem` hợp lệ                                      | Số lượng bài thêm mới và cập nhật                       | `psycopg2`, PostgreSQL                          |

---

## 4. Chi Tiết Đường Ống Cào Tin & Xử Lý (Crawl Pipeline Flow)

```mermaid
sequenceDiagram
    autonumber
    actor User as Trader / UI
    participant NC as NewsController
    participant NCQ as NewsCrawlQueueService
    participant Redis as Redis ('news-crawl')
    participant NCP as NewsCrawlProcessor
    participant NCS as NewsCrawlService
    participant Py as main.py (Python)
    participant Crawler as NewsCrawler
    participant DB as PostgreSQL (Table: news)

    User->>NC: POST /news/crawl
    NC->>NCQ: enqueue()
    NCQ->>Redis: Kiểm tra job đang chạy (Coalescing Check)
    alt Đã có job đang chạy / chờ
        Redis-->>NCQ: Trả về jobId hiện tại
    else Chưa có job
        NCQ->>Redis: queue.add('crawl', data, { attempts: 1 })
        Redis-->>NCQ: Trả về jobId mới
    end
    NC-->>User: HTTP 202 Accepted { jobId, status: 'WAITING' }

    Redis->>NCP: Dispatch job (concurrency = 1)
    activate NCP
    NCP->>NCS: execute({ timeout: 600000 })
    activate NCS
    NCS->>Py: child_process.spawn("python3 workers/news/main.py")
    activate Py

    Py->>Crawler: crawl()
    activate Crawler
    loop Mỗi nguồn tin cấu hình (RSS / HTML)
        Crawler->>Crawler: HTTPFetcher tải dữ liệu thô
        Crawler->>Crawler: ParserFactory bóc tách link & nội dung
        Crawler->>Crawler: NewsNormalizer xóa thẻ HTML rác
        Crawler->>Crawler: CoinEntityExtractor gắn tag coin (\bBTC\b, \bETH\b...)
        Crawler->>Crawler: NewsValidator kiểm tra độ dài tối thiểu
    end
    Crawler->>Crawler: In-memory Deduplication (nhóm theo hash của URL)
    Crawler-->>Py: Danh sách NewsItem hợp lệ
    deactivate Crawler

    Py->>Py: Phân tích cảm xúc văn bản qua SentimentProvider
    Py->>DB: psycopg2: INSERT INTO news ... ON CONFLICT (url) DO UPDATE
    DB-->>Py: Số bản ghi ghi nhận thành công

    Py->>NCS: Ghi chuỗi JSON NEWS_CRAWL_SUMMARY ra stdout
    deactivate Py
    NCS-->>NCP: Hoàn thành tác vụ cào tin
    deactivate NCS
    NCP->>Redis: Đánh dấu job COMPLETED
    deactivate NCP
```

---

## 5. Hợp Đồng Dữ Liệu & Nguồn Tin Ngoại Bộ

### 5.1. Cấu trúc Mô hình Bài viết (`NewsItem`)

```python
class NewsItem(BaseModel):
    id: str                 # Mã SHA-256 tạo từ URL chuẩn hóa (Primary Key)
    title: str              # Tiêu đề bài viết sau khi làm sạch
    content: str            # Tóm tắt hoặc nội dung chính
    url: str                # URL gốc chuẩn hóa (Ràng buộc UNIQUE)
    source: str             # Định danh nguồn tin (ví dụ: "coindesk", "cointelegraph")
    published_at: datetime  # Thời gian xuất bản (UTC)
    coins: list[str]        # Danh sách mã coin liên quan (ví dụ: ["BTC", "ETH"])
    sentiment: Optional[str]# 'positive' | 'negative' | 'neutral'
    sentiment_score: Optional[float] # Điểm tin cậy (0.0 đến 1.0)
```

### 5.2. Nhận diện Mã Coin & Cấu hình Nguồn tin

- **Bóc tách thực thể Coin**: `CoinEntityExtractor` sử dụng các biểu thức chính quy với ranh giới từ (`\bBTC\b`, `\bBITCOIN\b`, `\bETH\b`, `\bETHEREUM\b`, `\bSOL\b`...) để quét qua cả tiêu đề và nội dung bài viết.
- **Nguồn tin ngoại bộ**: Được cấu hình bằng YAML trong `workers/news/config/`:
  - `rss_sources.yml`: Cấu hình danh sách RSS feeds (CoinDesk, Cointelegraph).
  - `html_sources.yml`: Cấu hình CSS selector cho các trang web HTML phức tạp (Binance News).
  - Thêm nguồn tin mới chỉ cần bổ sung file YAML mà không cần sửa đổi mã nguồn crawler.

---

## 6. Mối Quan Hệ Với Các Phân Hệ Khác

1. **Với Job Queue**:
   - Sử dụng hàng đợi `NEWS_CRAWL_QUEUE` (`"news-crawl"`) với `concurrency: 1` để đảm bảo cào tin tuần tự, tránh bị nhà cung cấp dịch vụ mạng chặn truy cập (HTTP 429 Rate Limit).
   - Cơ chế hủy mềm (Cooperative Cancellation): Khi có request `POST /news/crawl/cancel`, API đặt `cancelRequested: true` trên Redis. Worker thăm dò cờ này định kỳ mỗi 1 giây để gửi tín hiệu `SIGTERM` tắt tiến trình Python một cách an toàn.
2. **Với Sentiment Module**:
   - Ngay sau khi cào và loại bỏ bài viết trùng lặp, `main.py` chuyển tiếp trực tiếp nội dung bài báo tới `SentimentProvider` (FinBERT hoặc bộ từ vựng Lexicon). Nhờ đó, điểm số cảm xúc được ghi trực tiếp vào các cột `sentiment` và `sentiment_score` của bảng `news` trong cùng một lượt ghi.
3. **Với Backtest Engine (`NewsSentimentPrecomputeService`)**:
   - Trước khi đợt thử nghiệm chiến lược bắt đầu, `NewsSentimentPrecomputeService` nạp toàn bộ bài viết trong khoảng `[firstCandle - 48h, lastCandle]`.
   - Áp dụng thuật toán **hai con trỏ (Two-pointer Sliding Window)** duyệt đồng thời chuỗi nến và chuỗi tin tức với độ phức tạp $O(\text{candles} + \text{news})$ để tiền tính toán mảng điểm cảm xúc.
   - Trong quá trình chạy giả lập, `NewsSentimentPlugin` chỉ việc tra cứu mảng điểm này trong bộ nhớ theo $O(1)$, tuân thủ tuyệt đối quy tắc cấm query database trong vòng lặp nến.

---

## 7. Các Điểm Kiểm Thử & Đảm Bảo Tính Toàn Vẹn (Verification Guardrails)

1. **Cô lập lỗi theo từng bài viết (Per-Article Try/Catch Containment)**: Trong `HTMLParser`, việc truy cập và bóc tách từng bài viết được bọc trong khối `try/catch` riêng biệt. Nếu một bài báo bị lỗi kết nối hoặc cấu trúc DOM bị hỏng, lỗi chỉ được ghi vào log cảnh báo và tiến trình tiếp tục xử lý các bài báo khác mà không bị sập.
2. **Tính Idempotent trong Cơ sở dữ liệu**: Bảng `news` thiết lập ràng buộc duy nhất trên cột `url`. Câu lệnh `psycopg2` áp dụng cú pháp:
   ```sql
   INSERT INTO news (id, title, content, url, source, published_at, coins, sentiment, sentiment_score, created_at)
   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
   ON CONFLICT (url) DO UPDATE SET
       title = EXCLUDED.title,
       content = EXCLUDED.content,
       coins = EXCLUDED.coins,
       sentiment = EXCLUDED.sentiment,
       sentiment_score = EXCLUDED.sentiment_score;
   ```
   Sử dụng điều kiện hệ thống PostgreSQL `xmax = 0` để phân biệt chính xác số lượng bài viết thực sự thêm mới so với các bài viết chỉ cập nhật dữ liệu.
3. **Giới hạn thời gian cứng (Hard Timeout)**: Tiến trình Node.js quản lý tiến trình con Python với bộ đếm thời gian tối đa 10 phút (`timeout: 600000`). Nếu tiến trình cào tin bị nghẽn mạng, Node.js sẽ gửi tín hiệu `SIGTERM`, và nếu sau 10 giây tiến trình không dừng, sẽ gửi tiếp `SIGKILL` để giải phóng tài nguyên.
