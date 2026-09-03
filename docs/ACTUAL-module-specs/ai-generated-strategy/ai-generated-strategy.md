# Phân Tích Kiến Trúc & Cách Hoạt Động Phân Hệ Chiến Lược AI (AI-Generated Strategy Module)

> **Tài liệu tham chiếu trong dự án**:
> - [01-repository-architecture-evidence.md](file:///home/ltp/Code/Course/Software_Architecture/Project/crypto-strategy-lab/temp/01-repository-architecture-evidence.md)
> - [04-ai-generated-strategy-deep-analysis.md](file:///home/ltp/Code/Course/Software_Architecture/Project/crypto-strategy-lab/temp/04-ai-generated-strategy-deep-analysis.md)
> - [report-ai-strategy.md](file:///home/ltp/Code/Course/Software_Architecture/Project/crypto-strategy-lab/temp/report-ai-strategy.md)
> - [architecture-c4-component-ai-strategy.puml](file:///home/ltp/Code/Course/Software_Architecture/Project/crypto-strategy-lab/temp/architecture-c4-component-ai-strategy.puml)
> - [flow-ai-strategy-generation.puml](file:///home/ltp/Code/Course/Software_Architecture/Project/crypto-strategy-lab/temp/flow-ai-strategy-generation.puml)

---

## 1. Tổng Quan Phân Hệ Chiến Lược Do AI Tự Động Sinh

**AI-Generated Strategy Module (Mô-đun 12 / Artifact 24)** là phân hệ cho phép người dùng mô tả chiến lược giao dịch bằng ngôn ngữ tự nhiên (ví dụ: *"Mua khi giá vượt lên trên MA 20 và RSI dưới 60, bán khi giá chạm dải trên Bollinger Bands"*). Hệ thống sử dụng mô hình ngôn ngữ lớn (LLM) để tổng hợp thành mã nguồn hàm Python thực thi được, kiểm duyệt an toàn tĩnh và động qua 4 lớp chốt chặn AST, lưu trữ dưới dạng các phiên bản bất biến, và kết nối liền mạch vào bộ máy Backtest thông qua một Plugin Adapter không trạng thái.

### Nhiệm vụ cốt lõi:
1. **Tổng hợp chiến lược bằng LLM (Natural Language Synthesis)**: Chuyển đổi prompt tự do của người dùng thành một hàm Python tuân thủ nghiêm ngặt hợp đồng giao diện kỹ thuật (`contract-prompt.ts`).
2. **Cổng kiểm duyệt an toàn hai lớp (Dual Safety Validation Gate)**: Quét cây cú pháp trừu tượng (AST) để loại trừ triệt để mã độc hại (cấm lệnh `import`, cấm truy cập dunder `__subclasses__`, cấm hàm hệ thống `os`, `sys`, `subprocess`...) và thực thi chạy thử (smoke run) trên nến mẫu.
3. **Quản lý phiên bản bất biến (Immutable Versioning)**: Mỗi lần người dùng lưu chiến lược, hệ thống luôn ghi một bản ghi mới với `version = MAX(version) + 1`, không bao giờ ghi đè, đảm bảo khả năng tái lập và kiểm chứng kết quả trong quá khứ.
4. **Cô lập bộ máy cốt lõi qua Adapter Pattern**: Bộ máy Backtest và Engine hoàn toàn không cần biết chi tiết triển khai của AI. Chúng tương tác với chiến lược AI thông qua `AiStrategyPluginAdapter` như một `StrategyPlugin` tiêu chuẩn.
5. **Tiền tính toán toàn chuỗi nến (Whole-Series Precomputation)**: Thực thi hàm Python **đúng một lần duy nhất** cho toàn bộ dải nến của đợt thử nghiệm, giảm thiểu chi phí khởi tạo tiến trình hệ điều hành từ $O(10^7)$ lần xuống còn $O(1)$ lần.

---

## 2. Sơ Đồ Kiến Trúc Hệ Thống (C4 Level 1 → Level 3)

### 2.1. C4 Level 1 — System Context

```mermaid
C4Context
    title System Context — AI-Generated Strategy Module

    Person(user, "Trader / Người dùng", "Nhập mô tả chiến lược bằng ngôn ngữ tự nhiên, chỉnh sửa mã, kiểm duyệt và lưu phiên bản chiến lược AI.")
    System(system, "Crypto Strategy Lab - AI Strategy", "Tổng hợp mã Python từ prompt, kiểm duyệt an toàn AST, lưu phiên bản và cắm vào bộ máy Backtest.")
    System_Ext(llm, "External LLM Providers", "OpenAI, OpenRouter, vLLM (API Chat Completions sinh mã nguồn Python).")

    Rel(user, system, "Nhập prompt, xem mã nguồn, chạy thử và lưu chiến lược", "HTTPS / REST")
    Rel(system, llm, "Gửi prompt bọc hợp đồng, nhận mã nguồn Python", "HTTPS / REST (JSON)")
```

### 2.2. C4 Level 2 — Container View

```mermaid
C4Container
    title Container Diagram — AI-Generated Strategy Module (Level 2)

    Person(user, "Trader", "Người dùng web app.")

    Container_Boundary(csl, "Crypto Strategy Lab System") {
        Container(spa, "Web Platform", "React 19, Vite", "UI nhập prompt, trình soạn thảo mã nguồn Python (Monaco/CodeMirror), bảng báo cáo 4 chốt chặn kiểm duyệt.")
        Container(api, "API Application", "Node.js 22, NestJS (main.ts)", "Cung cấp REST API cho sinh mã, kiểm tra mã, lưu phiên bản và chạy thử.")
        Container(worker, "Worker Runtime", "Node.js 22 (worker.ts)", "Xử lý job sinh mã ngầm ('ai-generate') và tiền tính toán tín hiệu toàn chuỗi trước khi backtest.")
        ContainerDb(redis, "Redis 7", "Redis Alpine", "Lưu trữ hàng đợi BullMQ 'ai-generate' và bản nháp kết quả trả về.")
        ContainerDb(db, "PostgreSQL Database", "Table: strategies (type='AI_GENERATED')", "Lưu trữ mã nguồn chiến lược kèm số phiên bản bất biến.")
        Container(py_val, "Python Validator Subprocess", "Python 3.13 (workers/ai-strategy/validate.py)", "Tiến trình con quét AST tĩnh, kiểm tra arity và chạy smoke run trên 5 nến mẫu.")
        Container(py_run, "Python Runner Subprocess", "Python 3.13 (workers/ai-strategy/run.py)", "Tiến trình con thực thi generate_signals trên toàn bộ chuỗi nến (whole-series runner).")
    }

    System_Ext(ext_llm, "External LLM API", "OpenAI / OpenRouter API.")

    Rel(user, spa, "Nhập prompt & quản lý chiến lược", "HTTPS")
    Rel(spa, api, "Gọi REST API (/ai-strategy/*)", "HTTP REST")
    Rel(api, ext_llm, "Gọi LLM sinh mã (trực tiếp hoặc qua Worker)", "HTTPS POST")
    Rel(api, redis, "Đưa job sinh mã vào 'ai-generate'", "Redis Protocol")
    Rel(redis, worker, "Điều phối job cho AiGenerateProcessor", "BullMQ")
    Rel(api, py_val, "Gọi kiểm tra an toàn AST (đồng bộ)", "OS Process / stdin-stdout")
    Rel(worker, py_run, "Precompute tín hiệu AI 1 lần cho cả đợt backtest", "OS Process / stdin-stdout")
    Rel(api, db, "Ghi nhận phiên bản chiến lược bất biến", "TCP 5432")
    Rel(worker, db, "Đọc mã chiến lược AI khi chạy backtest", "TCP 5432")
```

### 2.3. C4 Level 3 — Component Diagram

```mermaid
C4Component
    title Component Diagram — Phân hệ Chiến lược AI (Level 3)

    Container_Boundary(api_ai, "API Process (service/src/modules/ai-strategy)") {
        Component(aic, "AiStrategyController", "NestJS Controller", "Endpoints: POST /generate, POST /validate, POST /save, POST /run, GET /mine.")
        Component(ais, "AiStrategyService", "NestJS Service", "Điều phối sinh mã, gọi kiểm duyệt, lưu phiên bản và chạy thử nghiệm.")
        Component(aiqs, "AiGenerateQueueService", "BullMQ Producer", "Đẩy job sinh mã bất đồng bộ vào 'ai-generate'.")
        Component(llm_fact, "LlmProviderFactory", "Provider Factory", "Khởi tạo OpenAiCompatibleProvider hoặc FakeProvider theo biến môi trường.")
        Component(aiv, "AiStrategyValidatorService", "NestJS Service", "Cầu nối gọi validate.py qua stdin/stdout JSON với giới hạn thời gian 10s.")
        Component(air, "AiStrategyRunnerService", "NestJS Service", "Cầu nối gọi run.py qua stdin/stdout JSON với giới hạn thời gian 30s.")
        Component(airepo, "AiStrategyRepository", "NestJS Repository", "Thực hiện giao dịch DB atomic: version = MAX(version) + 1.")
    }

    Container_Boundary(worker_ai, "Worker Process & Background Queue") {
        Component(aip, "AiGenerateProcessor", "BullMQ Consumer (concurrency: 2)", "Xử lý job gọi LLM chạy ngầm trong Worker, đặt kết quả vào returnvalue.")
        Component(aipre, "AiStrategySignalPrecomputeService", "NestJS Service", "Chạy run.py một lần duy nhất trên toàn bộ nến của đợt thử nghiệm.")
    }

    Container_Boundary(py_scripts, "Python Subprocesses (workers/ai-strategy)") {
        Component(py_val, "validate.py", "Python Validator", "Thực thi 4 chốt chặn: AST parse, contract arity, safety scanner, smoke run.")
        Component(py_sandbox, "sandbox.py", "AST Visitor Scanner", "Danh sách trắng ALLOWED_BUILTIN_NAMES, cấm dunder và cấm import.")
        Component(py_run, "run.py", "Whole-Series Runner", "Thực thi hàm generate_signals(candles) với signal.alarm(20).")
    }

    Container_Boundary(engine_bridge, "Strategy Engine Integration Layer") {
        Component(adapter, "AiStrategyPluginAdapter", "StrategyPlugin", "Đóng vai trò cầu nối: tra cứu SignalContext.aiSignals trong O(1).")
        Component(registry, "StrategyRegistry", "Registry Hub", "Định tuyến các strategy type có tiền tố 'AI:<id>' tới Adapter.")
    }

    ContainerDb(db, "PostgreSQL Database", "Table: strategies (type='AI_GENERATED')", "Lưu trữ mã nguồn và thông tin phiên bản.")
    ContainerQueue(redis_ai, "Redis 7", "Queue 'ai-generate'", "Hàng đợi sinh mã LLM.")
    System_Ext(ext_llm, "External LLM Provider", "OpenAI / OpenRouter API.")

    Rel(aic, ais, "Gọi trực tiếp", "Method Call")
    Rel(aic, aiqs, "Enqueue job bất đồng bộ", "Method Call")
    Rel(aiqs, redis_ai, "Thêm job", "BullMQ")
    Rel(redis_ai, aip, "Dispatch job", "BullMQ")
    Rel(aip, ais, "Thực thi sinh mã", "Method Call")

    Rel(ais, llm_fact, "Lấy provider", "Method Call")
    Rel(llm_fact, ext_llm, "Gọi Chat Completion", "HTTPS")
    Rel(ais, aiv, "Validate mã", "Method Call")
    Rel(aiv, py_val, "Spawn process", "child_process")
    Rel(py_val, py_sandbox, "Kiểm tra AST", "Python Call")
    Rel(ais, airepo, "Lưu chiến lược", "Method Call")
    Rel(airepo, db, "INSERT phiên bản mới", "SQL")

    Rel(aipre, air, "Precompute chuỗi tín hiệu", "Method Call")
    Rel(air, py_run, "Spawn process", "child_process")
    Rel(py_run, py_sandbox, "Kiểm tra AST an toàn", "Python Call")

    Rel(registry, adapter, "Định tuyến type 'AI:<id>'", "Registry Hook")
    Rel(adapter, aipre, "Đọc precomputed signals từ SignalContext", "Memory Lookup")
```

---

## 3. Phân Tích Chi Tiết Các Thành Phần

### 3.1. Bảng Thành phần (Component Inventory)

| Component | Trách nhiệm | Input | Output | Phụ thuộc |
| :--- | :--- | :--- | :--- | :--- |
| **AiStrategyController** | REST API tiếp nhận yêu cầu liên quan đến AI | HTTP Requests (`/generate`, `/validate`, `/save`, `/run`, `/mine`) | HTTP JSON Response | `AiStrategyService`, `AiGenerateQueueService` |
| **AiStrategyService** | Điều phối nghiệp vụ sinh mã và kiểm duyệt | Prompt người dùng hoặc mã nguồn chỉnh sửa | Thực thể chiến lược đã kiểm duyệt an toàn | `LlmProviderFactory`, `AiStrategyValidatorService`, `AiStrategyRepository` |
| **AiGenerateQueueService** | Producer hàng đợi sinh mã AI | `userId`, `prompt`, cấu hình model | Đưa job vào queue `'ai-generate'` | BullMQ `Queue` |
| **AiGenerateProcessor** | Consumer hàng đợi sinh mã AI | Job data chứa prompt | Đặt mã nguồn và kết quả kiểm duyệt vào returnvalue của job | `AiStrategyService`, BullMQ |
| **LlmProviderFactory** | Lựa chọn bộ cung cấp mô hình ngôn ngữ | Biến môi trường `AI_STRATEGY_LLM_PROVIDER` | Đối tượng triển khai interface `LlmProvider` | `OpenAiCompatibleProvider`, `FakeProvider` |
| **OpenAiCompatibleProvider** | Kết nối trực tiếp với LLM API | Prompt đã bọc hợp đồng, API Key, Base URL | Chuỗi mã Python trích xuất từ phản hồi của model | OpenAI / OpenRouter / vLLM API |
| **FakeProvider** | Bộ giả lập sinh mã ngoại tuyến (Offline) | Prompt người dùng | Mã Python hợp lệ định sẵn phục vụ test và CI/CD | Không |
| **AiStrategyValidatorService** | Cầu nối kiểm duyệt an toàn mã nguồn | Chuỗi mã nguồn Python | Kết quả kiểm duyệt 4 chốt chặn (`valid`, `checks`) | `python-process.util`, `validate.py` |
| **AiStrategyRunnerService** | Cầu nối thực thi kiểm thử mã nguồn | Mã Python và danh sách nến giả lập | Mảng tín hiệu đầu ra (`['BUY', 'SELL', 'HOLD']`) | `python-process.util`, `run.py` |
| **AiStrategyRepository** | Quản lý lưu trữ phiên bản chiến lược | Dữ liệu chiến lược (`name`, `code`, `prompt`, `domain`) | Bản ghi chiến lược với `version` tăng tự động | `DatabaseService` (PostgreSQL) |
| **AiStrategySignalPrecomputeService** | Tiền tính toán tín hiệu toàn chuỗi nến | Mảng nến của đợt thử nghiệm, ID chiến lược AI | Mảng tín hiệu gán vào `SignalContext.aiSignals` | `AiStrategyRunnerService` |
| **AiStrategyPluginAdapter** | Adapter kết nối với Core Strategy Engine | Yêu cầu phân tích nến từ Engine | Tín hiệu `BUY`/`SELL`/`HOLD` lấy từ bộ nhớ trong $O(1)$ | `SignalContext.aiSignals` |
| **StrategyRegistry** | Đăng ký và định tuyến chiến lược | Loại chiến lược có tiền tố `'AI:'` | Thể hiện singleton của `AiStrategyPluginAdapter` | `AiStrategyPluginAdapter` |
| **validate.py (Python)** | Kiểm tra AST và chạy thử smoke test | Mã nguồn qua JSON stdin | Báo cáo chi tiết qua JSON stdout | Python `ast`, restricted globals |
| **run.py (Python)** | Thực thi mã trên toàn bộ chuỗi nến | Mã nguồn và chuỗi nến qua JSON stdin | Mảng tín hiệu qua JSON stdout | `signal.alarm(20)` |
| **sandbox.py (Python)** | Quét cây cú pháp trừu tượng (AST) | Cây cú pháp của mã nguồn | Báo cáo các vi phạm bảo mật | Python `ast.NodeVisitor` |

---

## 4. Quy Trình 3 Giai Đoạn Của AI Strategy

```mermaid
sequenceDiagram
    autonumber
    actor User as Trader / UI
    participant AIC as AiStrategyController
    participant AIQ as AiGenerateQueueService
    participant Redis as Redis ('ai-generate')
    participant AIP as AiGenerateProcessor
    participant AIS as AiStrategyService
    participant LLM as LlmProvider
    participant Val as validate.py
    participant Repo as AiStrategyRepository
    participant DB as PostgreSQL (Table: strategies)

    Note over User, DB: GIAI ĐOẠN 1: SINH MÃ BẤT ĐỒNG BỘ QUA HÀNG ĐỢI
    User->>AIC: POST /ai-strategy/generate { prompt }
    AIC->>AIQ: enqueue(userId, prompt)
    AIQ->>Redis: queue.add('generate', data, { attempts: 1 })
    AIQ-->>AIC: jobId
    AIC-->>User: HTTP 202 Accepted { jobId, status: 'WAITING' }

    Redis->>AIP: Dispatch job (concurrency = 2)
    activate AIP
    AIP->>AIS: generate(prompt)
    activate AIS
    AIS->>LLM: generateCode(contractPrompt)
    LLM-->>AIS: rawPythonCode
    AIS->>Val: spawn validate.py (JSON stdin)
    Val-->>AIS: { valid: true, checks: [...] }
    AIS-->>AIP: { code, valid: true }
    deactivate AIS
    AIP->>Redis: Lưu kết quả vào job returnvalue
    deactivate AIP
    User->>AIC: GET /ai-strategy/generate/status (Polling)
    AIC-->>User: Trả về mã nháp kèm bảng kiểm duyệt 4 chốt chặn

    Note over User, DB: GIAI ĐOẠN 2: CHỈNH SỬA & LƯU PHIÊN BẢN (ĐỒNG BỘ QUA API)
    User->>AIC: POST /ai-strategy/save { name, code, domain }
    AIC->>AIS: save(dto)
    activate AIS
    AIS->>Val: re-validate code (Không tin tưởng client)
    Val-->>AIS: { valid: true }
    AIS->>Repo: createVersion(dto)
    activate Repo
    Repo->>DB: BEGIN TRANSACTION<br/>SELECT MAX(version)+1 FROM strategies WHERE name = $1<br/>INSERT INTO strategies (version = MAX+1, type='AI_GENERATED')<br/>COMMIT
    DB-->>Repo: SavedStrategy (id: uuid, version: N)
    Repo-->>AIS: StrategyEntity
    deactivate Repo
    AIS-->>AIC: SavedStrategyDetail
    deactivate AIS
    AIC-->>User: HTTP 201 Created { id, name, version }
```

---

## 5. Cổng Kiểm Duyệt An Toàn Hai Lớp (AST Safety Gate)

Trước khi bất kỳ đoạn mã Python do AI sinh ra được phép lưu vào cơ sở dữ liệu hoặc chạy trong hệ thống, nó phải vượt qua **4 chốt chặn kiểm duyệt nghiêm ngặt** trong `workers/ai-strategy/validate.py`:

| Chốt chặn | Phương thức kiểm tra | Tiêu chuẩn vượt qua |
| :--- | :--- | :--- |
| **1. parses** | `ast.parse(source)` | Mã nguồn tuân thủ đúng ngữ pháp Python, không có lỗi syntax. |
| **2. contract** | Phân tích cây AST hàm định nghĩa | Tồn tại đúng hàm `def generate_signals(candles: list[dict]) -> list[str]` với đúng 1 tham số vị trí duy nhất. |
| **3. safety** | Bộ duyệt `ast.NodeVisitor` trong `sandbox.py` | **Cấm toàn bộ các lệnh `import` và `import from`**. Cấm truy cập thuộc tính dunder (`__class__`, `__subclasses__`...). Cấm các hàm/module nhạy cảm (`eval`, `exec`, `open`, `globals`, `os`, `sys`, `subprocess`...). Chỉ cho phép danh sách trắng các hàm cơ bản (`abs`, `min`, `max`, `len`, `sum`, `range`...). |
| **4. smoke** | Chạy thử nghiệm trong sandbox | Thực thi hàm trên 5 cây nến mẫu với môi trường `restricted globals` (`__builtins__ = safe_builtins`). Kiểm tra kết quả trả về phải là một mảng chuỗi có độ dài khớp chính xác với mảng nến và chỉ chứa các giá trị `'BUY'`, `'SELL'`, hoặc `'HOLD'`. |

### Giới hạn thời gian hai lớp (Dual-Timer Protection):
- **Tầng Python**: Sử dụng `signal.alarm(20)` (20 giây) để ngắt các vòng lặp vô tận (infinite loops) bên trong mã của người dùng.
- **Tầng Node.js**: Tiện ích `python-process.util` áp đặt giới hạn cứng của hệ điều hành (10 giây cho validate, 30 giây cho runner); nếu vượt quá thời gian, Node.js sẽ gửi tín hiệu `SIGKILL` để hủy tiến trình con ngay lập tức.

---

## 6. Tiền Tính Toán Toàn Chuỗi & Mối Quan Hệ Với Strategy Plugin

### 6.1. Bài toán chi phí giao tiếp tiến trình (IPC Cost Asymmetry)
- Một plugin kỹ thuật viết bằng TypeScript (`MAPlugin`, `RSIPlugin`) tính toán tín hiệu cho 1 cây nến trong khoảng $10\,\mu\text{s}$.
- Nếu mỗi cây nến đều spawn một tiến trình Python con để tính toán, trong 1 đợt tìm kiếm gồm 1.000 nến và 10.000 ứng viên sẽ cần tới $10^7$ lần spawn process, tiêu tốn hàng trăm giờ CPU!

### 6.2. Giải pháp kiến trúc: Whole-Series Precomputation
Hệ thống giải quyết triệt để vấn đề này qua mô hình 3 lớp phân cấp:

```
[AI-generated Strategy (Mã Python)]
                │
                ▼ (Chạy 1 lần duy nhất trước khi Backtest: Whole-Series Precomputation)
[SignalContext.aiSignals: Mảng tín hiệu BUY/SELL/HOLD trong bộ nhớ]
                │
                ▼ (Tra cứu theo index cây nến trong O(1))
[AiStrategyPluginAdapter (Triển khai interface StrategyPlugin)]
                │
                ▼ (Đăng ký vào kho định tuyến)
[StrategyRegistry (Điều phối type 'AI:<id>')]
                │
                ▼ (Nhận tín hiệu chuẩn hóa)
[StrategyEngineService / BacktestingService]
```

1. **Thực thi một lần duy nhất (`AiStrategySignalPrecomputeService`)**: Trước khi vòng lặp backtest bắt đầu, tiến trình Node.js truyền toàn bộ chuỗi nến qua stdin tới `workers/ai-strategy/run.py` đúng một lần. Kết quả mảng tín hiệu `['BUY', 'HOLD', ...]` được lưu trữ trực tiếp trên đối tượng bộ nhớ `SignalContext.aiSignals[strategyId]`.
2. **Adapter không trạng thái (`AiStrategyPluginAdapter`)**: Khi `BacktestingService` duyệt qua từng cây nến $i$, `StrategyRegistry` điều phối yêu cầu tới `AiStrategyPluginAdapter`. Adapter chỉ việc đọc phần tử thứ $i$ từ `SignalContext` với độ phức tạp **$O(1)$**.
3. **Tính độc lập của Core Engine**: Bộ máy `StrategyEngineService` không hề biết chiến lược này được sinh ra bởi AI hay viết bằng Python. Đối với Engine, nó chỉ là một `StrategyPlugin` hợp lệ trả về tín hiệu giao dịch.

---

## 7. Các Quyết Định Kiến Trúc Quan Trọng (ADR & Guardrails)

| Mã Quyết Định | Tên Quyết Định | Nội Dung & Lý Do Kiến Trúc |
| :--- | :--- | :--- |
| **ADR-004** | **Whole-Series AI Execution** | Chạy tiến trình Python 1 lần duy nhất cho toàn bộ mảng nến thay vì spawn process theo từng nến. Giảm chi phí giao tiếp IPC từ $O(N)$ xuống $O(1)$. |
| **DEC-006** | **Stateless Plugin Adapter** | Sử dụng `AiStrategyPluginAdapter` làm cầu nối giúp Core Strategy Engine không bị ô nhiễm bởi các chi tiết kỹ thuật của LLM và Python. |
| **DEC-007** | **Cổng Kiểm Duyệt AST Gate** | Quét cây cú pháp tĩnh kết hợp smoke run trên 5 nến mẫu giúp chặn đứng mã độc trước khi mã được phép lưu vào cơ sở dữ liệu. |
| **DEC-008** | **Phiên Bản Hóa Bất Biến (Immutable Versioning)** | Không bao giờ dùng lệnh SQL UPDATE trên mã nguồn chiến lược. Luôn INSERT phiên bản mới (`version = MAX + 1`) để đảm bảo các kết quả backtest trong quá khứ có thể tái lập 100%. |
