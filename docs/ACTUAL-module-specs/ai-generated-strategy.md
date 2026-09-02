# AI-Generated Strategy

Tài liệu vấn đáp — **kiến trúc đã build**. Đối chiếu sơ đồ:

- Level 1: `artifacts/architecture-c4-level-1.png`
- Level 2: `artifacts/architecture-c4-level-2.png`
- Level 3: `artifacts/architecture-c4-level-3.png`

Nguồn chi tiết: `artifacts/ai-strategy.md`, `artifacts/queue.md` mục 4.1, `artifacts/decisions.md` F20 / F17, `artifacts/api-contract.md` mục 3c.

Đây là **phần mở rộng** so với MVP (đề bài không bắt buộc LLM search). Đã build và gắn vào cùng vòng Search/Backtest với strategy hệ thống.

---
## 1. Mục đích

Người dùng mô tả chiến lược bằng ngôn ngữ tự nhiên → hệ thống **sinh code Python** → **kiểm duyệt** → **lưu version** → **tham gia tổ hợp / search** giống MA, RSI, BB, Support/Resistance.

Ba ràng buộc đề bài va nhau:

1. Không hard-code một model ML (`import openai` rải rác).
2. Không thêm `if` theo loại strategy trong Strategy Engine.
3. Strategy hệ thống: in-process, **mỗi nến**. Code AI: subprocess Python, **cả chuỗi nến**. Lệch chi phí hàng bậc — gọi Python mỗi nến = anti-pattern vòng lặp không kiểm soát.

Module giải cả ba mà **không** biến Engine thành chỗ biết “đây là AI”.

---

## 2. Level 1 — System Context

Trên C4 Level 1, Crypto Strategy Lab **gọi LLM API** (OpenAI-compatible) để sinh strategy. Trader không nói chuyện trực tiếp với model.

```
Trader  →  Crypto Strategy Lab  →  LLM API     (sinh source)
                              →  Binance      (nến để validate / run / backtest)
```

Python `workers/ai-strategy/` **không** phải external system trên Level 1 — nó nằm trong biên hệ thống (Level 2).

---

## 3. Level 2 — Container (luồng generate vs validate/run)

Hộp liên quan:

| Container | Vai trò với AI strategy |
|---|---|
| Web Application | Tab AI Strategy; poll trạng thái generate |
| API Application | Enqueue generate; HTTP đồng bộ validate / save / run |
| Redis (BullMQ) | Queue `ai-generate`; returnvalue kết quả job |
| Background Worker | Gọi LLM + spawn validate sau generate |
| AI Strategy Worker (Python) | `validate.py` / `run.py` — **không gọi LLM** |
| Database | Bảng `strategies` (`type = AI_GENERATED`, version, `owner_user_id`) |
| LLM API | `/chat/completions` từ **NestJS**, không từ Python |

**Cách đọc mũi tên (quan trọng khi chỉ slide Level 2):**

- API **không** HTTP-gọi Worker. Generate: `API → Redis → Worker`.
- **Generate code** đi từ **Background Worker → LLM API** (TypeScript `OpenAiCompatibleProvider`).
- Hai mũi tên **Spawn** vào Python AI là **đúng, hai việc khác nhau**:
  - Worker: spawn `validate.py` sau khi LLM trả code (job `ai-generate`).
  - API: spawn `validate.py` / `run.py` cho sửa code / chạy thử (`POST /validate`, `POST /save`, `POST /:id/run`).

Nếu một bản Level 2 cũ còn vẽ `API → LLM`, đó là generate **đồng bộ** trước F20. Hiện trạng khớp Level 3: caller LLM là Worker.

News Worker không tham gia generate.

---

## 4. Level 3 — Component

### 4.1. Sinh code (bất đồng bộ)

**Frontend:** `AiStrategyPage` → `useAiStrategy` / `useAiGenerate` → `AiGenerateContext` (mount ở `/app`, sống khi đổi tab).

```
POST /ai-strategy/generate          → 202 + job status
GET  /ai-strategy/generate/status   → poll 2s tới COMPLETED | FAILED
```

**API:**

```
AiStrategyController.generate()
  → AiGenerateQueueService.enqueue(userId, prompt)
       payload: { userId, prompt, correlationId }
       409 nếu cùng user đã có job in-flight
```

Controller **không** gọi `AiStrategyService.generate()`.

**Worker:**

```
AiGenerateProcessor  @Processor("ai-generate")
                     concurrency 5, lockDuration 120s
  → AiStrategyService.generate(prompt)     // cùng class, không fork
       → LlmProviderFactory
            OpenAiCompatibleProvider  |  FakeProvider (test / không key)
       → contract-prompt.ts  (bắt buộc generate_signals(candles))
       → AiStrategyValidatorService → spawn validate.py
```

Kết quả job nằm **Redis returnvalue**, không bảng Postgres. User bấm **Lưu** mới INSERT `strategies`.

### 4.2. Validate / save / run (đồng bộ, tiến trình API)

```
AiStrategyController
  → AiStrategyService.validateCode / save / run
       → AiStrategyValidatorService → validate.py
       → AiStrategyRunnerService    → run.py + sandbox.py
       → AiStrategyRepository       → INSERT version mới (không UPDATE đè)
```

Save: `type = AI_GENERATED`, `language = PYTHON`, `owner_user_id`, `domain` **bắt buộc** (user chọn — không suy từ prompt).

### 4.3. Vào Continuous Strategy Loop (cùng Level 3 Search)

Định danh search: `AI:<strategyId>`.

```
StrategyRegistry.resolve("AI:...")  →  một AiStrategyPluginAdapter (stateless)
StrategyEngineService               →  không if theo AI vs MA
```

Trước vòng backtest của **một** experiment run:

```
StrategySearchService.run()
  → AiStrategySignalPrecomputeService.precompute()
       tuần tự từng AI strategy đã chọn
       spawn run.py một lần trên toàn bộ chuỗi nến
       lỗi từng cái → loại strategy khỏi run, log, không crash experiment
  → SignalContext.aiSignals[...]
```

Trong vòng nến:

```
AiStrategyPluginAdapter.analyze()  =  tra mảng theo index  O(1)
```

Cùng weighted vote, cùng `BacktestingService`, cùng event leaderboard. AI strategy **không** có không gian tham số để generator dò — mỗi strategy đã lưu là một điểm cố định trong tổ hợp.

---

## 5. Luồng đầu-cuối (nói khi chỉ sơ đồ)

**Generate (Level 2–3):**

```
Trader → SPA → API (202 enqueue)
              → Redis queue ai-generate
              → Worker → LLM API → source Python
                       → spawn validate.py
              → Redis returnvalue
SPA poll status → hiện code + kết quả cổng kiểm duyệt
```

**Save:**

```
SPA → API → Postgres strategies (version mới, ownership)
```

**Search (nối sang Continuous Strategy Loop):**

```
SPA chọn AI:<id> + built-in → POST experiments
Worker run() → precompute Python một lần
            → loop candidate (adapter O(1) mỗi nến)
            → backtest.completed → leaderboard
```

---

## 6. Quyết định kiến trúc (hỏi / đáp)

### Q: Vì sao generate đi queue, còn validate/run thì không?

**A:** Generate = gọi LLM + validate, 10–90 giây, user có thể đổi tab / refresh. Validate khi sửa và `POST /:id/run` là thao tác ngắn, do người dùng chủ động. Queue chỉ việc **nặng và fire-and-forget** (F20).

### Q: Vì sao theo dõi generate bằng poll, không WebSocket?

**A:** Cùng pattern experiment progress và news crawl (2 giây). Một namespace socket chỉ cho một tab là over-engineering. Poll đọc Redis, sống sau F5 nhờ `AiGenerateProvider` ở `/app`.

### Q: Việc trùng: coalesce như search, hay 409?

**A:** **409 Conflict**, message cố định: `"A generate job is already running for this account."` Không coalesce prompt khác nhau (sai kết quả), không replace (tốn token song song, race UI).

### Q: Kết quả generate lưu Postgres hay Redis?

**A:** Redis returnvalue. Generate là bản nháp trước Save. Tránh migration bảng job. Job completed/failed chỉ giữ một cửa sổ ngắn (`removeOnComplete/Fail`) — reload quá lâu có thể mất bản nháp cũ.

### Q: Ai gọi LLM — Python worker hay NestJS?

**A:** **NestJS** `OpenAiCompatibleProvider`, chạy trong **Background Worker** khi process job. `workers/ai-strategy/` không có HTTP client. Vẽ `Python → LLM` là sai.

### Q: Vì sao API vẫn spawn Python nếu generate đã ở Worker?

**A:** User sửa code tay rồi bấm kiểm tra / chạy thử — không đi LLM. Hai spawn = hai use-case, không phải vẽ trùng.

### Q: Đổi model / nhà cung cấp có phải sửa code không?

**A:** Không. `OPENAI_BASE_URL` / `OPENAI_MODEL` / `OPENAI_API_KEY`. Factory chọn `OpenAiCompatibleProvider` hoặc `FakeProvider`. Cấm import SDK rải rác (anti-pattern gắn cứng ML).

### Q: Không có API key thì sao? Test có gọi mạng không?

**A:** FakeProvider cho unit test (code mẫu tất định). Request generate thật khi thiếu key **lỗi rõ**, không trả code giả như thể model sinh.

### Q: Contract bắt `generate_signals(candles)` cả chuỗi — vì sao không `analyze(candle)` từng nến?

**A:** Backtest hàng nghìn nến. Spawn Python mỗi nến không dùng được. Precompute một lần/run, adapter O(1) — Engine không cần biết sự khác biệt.

### Q: Vì sao một `AiStrategyPluginAdapter` cho mọi `AI:*`, không register từng strategy?

**A:** Built-in: 4 plugin, biết lúc `onModuleInit`. AI: vô hạn, theo user, nằm Postgres, sinh lúc runtime. Nạp lại registry mỗi lần Save biến registry thành state chia sẻ. `has('AI:...')` = false, `resolve('AI:...')` = adapter — cố ý tách.

### Q: Precompute tuần tự, bắt lỗi từng strategy — vì sao không parallel fan-out?

**A:** Tránh bùng nổ subprocess. Một AI hỏng **không** được kéo sập experiment 100 candidate. Strategy lỗi bị loại khỏi **lần run đó**, không FAIL cả job search.

### Q: Cổng AST có phải security sandbox không?

**A:** **Không.** Chặn tai nạn (`os`, `eval`, mạng…). Không chặn attacker có chủ đích. Đồ án local, user tin cậy. Sandbox thật (container, seccomp) ngoài phạm vi. Nói thẳng khi bị hỏi.

### Q: Timeout Python xử lý thế nào trên Windows?

**A:** Tầng ngoài (bắt buộc): Nest `python-process.util` timeout + SIGKILL. Tầng trong: `signal.alarm` POSIX; Windows không có `SIGALRM` → `threading.Timer`. Interpreter: env → venv news nếu có (đúng `Scripts\` / `bin`) → `python` trên PATH (F17).

### Q: Lưu strategy có UPDATE đè version cũ không?

**A:** Không. INSERT row version mới. Experiment cũ trỏ đúng `source_code` đã chạy — anti-pattern overwrite history.

### Q: `domain` lúc Save — hệ thống có đoán từ prompt không?

**A:** Không. User chọn TREND / MOMENTUM / VOLATILITY / STRUCTURE. Đoán sai làm tổ hợp lệch mà không ai thấy. Generator cần domain để ghép hướng + xác nhận.

### Q: Trọng số AI strategy có công thức riêng không?

**A:** Không. Cùng `experiment_config_strategies` và `Σ(w × signal) / Σw`.

### Q: `attempts` generate = 1, search = 3 — mâu thuẫn?

**A:** Search idempotent theo DB, retry an toàn. Generate fail do LLM/mạng: retry tự động tốn token trùng. User bấm lại.

### Q: `lockDuration` 120s để làm gì?

**A:** BullMQ mặc định lock ngắn hơn thời gian LLM + validate. Hết lock lúc job còn chạy → job bị coi stale / đụng lần 2.

### Q: AI strategy có tham gia fingerprint / random period như MA không?

**A:** Không. Không có tham số dò. Mỗi `AI:<id>` là một thành viên cố định trong tổ hợp. Giới hạn đã thừa nhận khi vấn đáp.

---

## 7. Câu chốt khi trình bày

> LLM là **dependency cấu hình** của NestJS Worker. Python chỉ **cổng và máy chạy**. Engine chỉ thấy plugin. Chi phí Python được **trả một lần trước loop**, không phải mỗi nến — nhờ đó AI strategy đi chung Continuous Strategy Loop mà không phá Open/Closed của Strategy Engine.
