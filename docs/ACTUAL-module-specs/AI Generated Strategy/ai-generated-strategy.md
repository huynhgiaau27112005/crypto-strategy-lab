# AI-Generated Strategy — mô tả luồng hoạt động

Tài liệu vấn đáp cho **module đã build thật**. Đọc file này cùng sơ đồ
[`architecture-c4-level-3-ai-strategy.puml`](architecture-c4-level-3-ai-strategy.puml)
là đủ hiểu module chạy thế nào — mọi tên hộp trong sơ đồ đều là tên class/file có thật trong `service/src/modules/ai-strategy/`, `service/src/modules/strategy-plugin/`, `workers/ai-strategy/`, `web-platform/src/`.

Sơ đồ tổng: `artifacts/architecture-c4-level-3.png`. Chi tiết sâu hơn: `artifacts/ai-strategy.md`, `artifacts/queue.md` §4.1, `artifacts/decisions.md` F20/F17.

> Đây là **phần mở rộng ngoài MVP** — đề bài không bắt buộc dùng LLM. Nhưng nó đã được build đầy đủ và cắm vào **cùng** vòng Search/Backtest với MA, RSI, Bollinger, Support/Resistance.

---

## 1. Module này làm gì

Người dùng gõ một câu mô tả chiến lược bằng ngôn ngữ tự nhiên ("mua khi giá vượt trung bình 20 nến và RSI dưới 60"). Hệ thống nhờ LLM **sinh ra một hàm Python**, **kiểm duyệt** hàm đó, cho người dùng **sửa và lưu thành một version**, rồi thả nó vào **đúng cỗ máy backtest** đang chạy cho các strategy hệ thống — cùng trọng số, cùng weighted vote, cùng leaderboard.

Nói ngắn: *biến một câu văn thành một thành viên hợp lệ của tổ hợp chiến lược, mà Strategy Engine không cần biết nó là AI.*

---

## 2. Cách đọc sơ đồ

Sơ đồ chia làm 6 vùng, mỗi vùng là **một ranh giới tiến trình hoặc ranh giới sở hữu** — đó là điều quan trọng nhất phải nhớ:

| Vùng trên sơ đồ | Là gì | Điểm phải nhớ |
|---|---|---|
| **Frontend** | `AiStrategyPage` + `AiGenerateContext` | Context nằm ở `/app` nên trạng thái generate **sống qua việc đổi tab và F5** |
| **API Process** | NestJS `main.ts` | Nhận HTTP. **Không bao giờ tự gọi LLM** |
| **Worker Process** | NestJS `worker.ts` | Cùng codebase, khác tiến trình. **Chỉ nơi này gọi LLM** |
| **Python Workers** | `workers/ai-strategy/` | `validate.py`, `run.py`. **Không có HTTP client — không gọi mạng** |
| **Redis** | queue `ai-generate` | Vừa là hàng đợi, vừa là **nơi giữ bản nháp** (job returnvalue) |
| **PostgreSQL** | bảng `strategies` | Chỉ chứa strategy **đã được bấm Lưu** |

Ba mũi tên hay bị hiểu sai, nói trước cho gọn:

- `API → Worker` **không tồn tại**. Chúng đi qua Redis: `API → Redis → Worker`.
- Mũi tên đi tới **LLM API** xuất phát từ **Worker**, không phải API, và tuyệt đối không phải từ Python.
- Có **hai** mũi tên spawn vào Python vì đó là **hai việc khác nhau** (kiểm duyệt và chạy thật), không phải vẽ trùng.

---

## 3. Luồng 1 — Sinh code từ mô tả (bất đồng bộ)

Đây là luồng dài nhất (10–90 giây) nên nó là luồng duy nhất đi qua hàng đợi.

**Bước 1 — Người dùng bấm "Sinh chiến lược".**
`AiStrategyPage` không tự gọi API. Nó gọi `useAiStrategy`, hook này ủy quyền cho `AiGenerateContext`. Context mới là chỗ giữ trạng thái job — đặt ở `/app` chứ không ở trang, để người dùng đổi sang tab Backtest rồi quay lại vẫn thấy job đang chạy.

**Bước 2 — API chỉ nhận và bỏ vào hàng đợi.**

```
POST /ai-strategy/generate   →  202 Accepted
```

`AiStrategyController.generate()` **không** gọi `AiStrategyService.generate()`. Nó gọi `AiGenerateQueueService.enqueue(userId, prompt)`:

- kiểm tra tài khoản này đã có job đang chạy chưa → nếu có thì trả **409 Conflict** (không xếp thêm, không thay thế);
- đọc `correlationId` đang active (do `ObservabilityMiddleware` gán khi request tới) và **ghi vào job data**, để log trong Worker vẫn truy ngược được về đúng request HTTP ban đầu;
- `attempts: 1` — hỏng thì **không** tự retry (retry LLM = đốt token lần hai cho một kết quả không chắc khác đi).

**Bước 3 — Worker nhấc job.**
`AiGenerateProcessor` (`concurrency 5`, `lockDuration 120s`) mở lại context correlation bằng đúng id trong job, rồi gọi `AiStrategyService.generate(prompt)` — **cùng một class** mà API cũng dùng cho các thao tác khác, không có bản logic thứ hai dành riêng cho Worker.

**Bước 4 — Gọi LLM.**
`AiStrategyService.generate()` gọi provider do `LlmProviderFactory` chọn từ env: `OpenAiCompatibleProvider` khi có `OPENAI_API_KEY`, `FakeProvider` khi không (test, hoặc chạy offline).
Prompt gửi đi không phải câu của người dùng nguyên bản — `contract-prompt.ts` bọc nó lại và **ép contract**: model bắt buộc phải trả về một hàm

```python
def generate_signals(candles) -> list[str]:   # mỗi phần tử là "BUY" | "SELL" | "HOLD"
```

Contract nhận **cả chuỗi nến**, không phải một nến — lý do ở §7.

**Bước 5 — Kiểm duyệt ngay, không đợi người dùng bấm.**
Vẫn trong cùng job đó, `AiStrategyValidatorService` spawn `validate.py` qua `python-process.util` (timeout + SIGKILL + giới hạn output). `validate.py` chạy 4 check và trả nguyên văn lên UI:

| Check | Nội dung |
|---|---|
| `parses` | `ast.parse()` được không |
| `contract` | có đúng `generate_signals(candles)` với một tham số vị trí không |
| `safety` | quét AST: cấm `import`, `eval`, `exec`, truy cập file/mạng… |
| `smoke` | chạy thử trên ~30 nến tổng hợp, trong restricted globals + time limit |

**Bước 6 — Kết quả về Redis, không về Postgres.**
Worker trả `{ code, raw, providerName, validation }` làm **returnvalue của job**. Trong lúc đó frontend poll `GET /ai-strategy/generate/status` mỗi 2 giây (`AiGenerateQueueService.getStatus` lọc theo `userId`: tìm job in-flight trước, không có thì lấy job kết thúc gần nhất). Khi status thành `COMPLETED`, trang hiện code và bảng 4 check.

Lý do không ghi Postgres: đây mới là **bản nháp**, người dùng có thể sửa hoặc vứt. Đổi lại, `removeOnComplete/Fail: 50` nghĩa là bản nháp chỉ sống một cửa sổ ngắn — bỏ đi quá lâu rồi F5 thì mất.

---

## 4. Luồng 2 — Sửa, kiểm tra lại, và Lưu (đồng bộ, trong API)

Từ đây trở đi **không còn LLM**. Người dùng sửa tay đoạn code trên trang rồi bấm kiểm tra hoặc lưu — cả hai là thao tác ngắn, chủ động, người dùng đang ngồi đợi, nên đi thẳng HTTP đồng bộ, không qua queue.

```
POST /ai-strategy/validate  →  AiStrategyService.validateCode()  →  spawn validate.py
POST /ai-strategy/save      →  AiStrategyService.save()          →  validate lại  →  INSERT
```

Hai chi tiết đáng nói khi vấn đáp:

- **`save()` luôn validate lại**, không tin kết quả validate của request trước — code có thể đã bị sửa giữa chừng. Không hợp lệ thì trả 400 kèm đúng check nào hỏng; không bao giờ lưu code hỏng.
- **`createVersion()` luôn `INSERT` một row mới**, không `UPDATE` đè. Đây là chống trực tiếp anti-pattern *overwrite strategy history*: một experiment cũ phải trỏ đúng `source_code` mà nó đã thật sự chạy.

Row được ghi vào bảng `strategies` dùng chung với strategy hệ thống: `type = 'AI_GENERATED'`, `language = 'PYTHON'`, `source_code`, `version`, `owner_user_id`, và `parameters.domain`.

**`domain` là người dùng chọn, hệ thống không đoán từ prompt** — TREND / MOMENTUM / VOLATILITY / STRUCTURE. Generator của Strategy Search dùng domain để ghép vai trò trong tổ hợp; đoán sai sẽ làm lệch tổ hợp mà không ai nhìn thấy.

Sau khi lưu, strategy xuất hiện ở hai chỗ: bảng "Strategy AI của tài khoản" (`GET /ai-strategy/mine`) và **catalog chọn strategy của Strategy Engine** — vì `StrategyPluginService.listCatalog(userId)` ghép built-in lấy từ registry với `AiStrategyRepository.listLatestPerName(userId)`.

---

## 5. Luồng 3 — Chạy thử một strategy đã lưu

```
POST /ai-strategy/:id/run
```

`AiStrategyService.run()` kiểm tra quyền sở hữu (`findMineById(id, userId)`), nạp nến thật từ `CandleRepository` rồi **đảo lại thành thứ tự cũ → mới** (contract giả định đọc xuôi thời gian, ví dụ `closes[i-20:i]`), sau đó `AiStrategyRunnerService` spawn `run.py` **một lần cho cả chuỗi**. Trả về `{ candleCount, signals }`.

Đây là bằng chứng end-to-end rằng strategy đã lưu là **code chạy được**, không phải một đoạn text nằm trong DB.

Lỗi ở đây là **400, không phải 500** — source code là dữ liệu người dùng, strategy hỏng là lỗi của họ, không phải bug của hệ thống.

---

## 6. Luồng 4 — AI strategy tham gia Continuous Strategy Loop

Đây là phần trả lời câu hỏi "tính mở rộng" của đề bài. Định danh của một AI strategy trong search là chuỗi **`AI:<strategyId>`**.

**Lúc tạo experiment (`POST /experiments`, chạy ở API).**
`StrategySearchService.start()` duyệt danh sách trọng số người dùng gửi lên. Gặp một type dạng `AI:*`, nó gọi `AiStrategyRepository.findOwnedActiveById(id, userId)` — sai chủ sở hữu hoặc strategy đã `is_active = false` thì **400 ngay tại đây**, không để lọt vào job. Domain lấy từ chính row đó, không từ một bảng tra cứu cứng.

**Lúc chạy experiment (`run()`, chạy ở Worker):**

```
1.  nạp chuỗi nến của experiment
2.  AiStrategySignalPrecomputeService.precompute(aiStrategies, candles)   ← MỘT LẦN
3.  build run catalog  (bỏ mọi AI strategy precompute thất bại)
4.  vòng lặp candidate → BacktestingService → StrategyEngineService → registry.resolve()
```

Bước 2 là điểm mấu chốt của cả module. `precompute()` chạy **tuần tự** từng AI strategy, mỗi cái một lần spawn `run.py` trên **toàn bộ** chuỗi nến, và **bắt lỗi riêng từng cái**: strategy nào hỏng / timeout / trả sai số lượng signal thì bị **loại khỏi lần run đó** kèm log cảnh báo — không throw, không kéo sập cả experiment 100 candidate. Kết quả nằm ở `SignalContext.aiSignals`.

Vì sao tuần tự chứ không fan-out song song: để chặn bùng nổ subprocess — đúng cái anti-pattern *uncontrolled infinite loop* mà đề bài cấm.

Bước 4 thì Engine **không biết gì về AI**. `StrategyEngineService.analyze()` chỉ gọi `registry.resolve(type).analyze()`. `StrategyRegistry` cố ý tách hai đường:

```
has("AI:...")      →  false                     (registry chỉ "chứa" built-in)
resolve("AI:...")  →  AiStrategyPluginAdapter   (một instance duy nhất, stateless)
```

Và `AiStrategyPluginAdapter.analyze()` chỉ còn một dòng có ý nghĩa:

```ts
return context.aiSignals.get(member.type)[context.index] ?? 'HOLD'
```

— tra mảng **O(1)**, rẻ ngang một plugin built-in, nhìn từ vòng lặp backtest.

Từ đó trở đi mọi thứ y hệt strategy hệ thống: cùng `experiment_config_strategies` cho trọng số, cùng công thức `Σ(w × signal) / Σw → BUY/SELL/HOLD`, cùng `BacktestingService`, cùng event `backtest.completed` → leaderboard.

**Giới hạn đã biết, nên nói thẳng:** AI strategy **không có không gian tham số** để generator dò như MA (period 10/20/50). Mỗi `AI:<id>` là **một điểm cố định** trong tổ hợp; generator chỉ có thể thay đổi việc ghép nó với ai và trọng số bao nhiêu.

---

## 7. Ba ràng buộc va nhau — và cách module giải

Đây là phần nên nói khi giám khảo hỏi "vì sao thiết kế phức tạp thế".

**Ràng buộc 1 — cấm gắn cứng một model ML.**
Giải: `LlmProviderFactory` + interface `LlmProvider`. Đổi model / nhà cung cấp = đổi `OPENAI_BASE_URL` / `OPENAI_MODEL` / `OPENAI_API_KEY`, không sửa code. Không có `import openai` rải rác trong các service.

**Ràng buộc 2 — cấm `if` theo loại strategy trong Strategy Engine.**
Giải: `registry.resolve()` trả về adapter. Engine gọi `analyze()` y như với MA. Không có `if (type.startsWith('AI:'))` trong Engine.

**Ràng buộc 3 — lệch chi phí per-candle vs whole-series.**
Plugin built-in tính trong tiến trình, gọi **mỗi nến**, rẻ. Code AI phải spawn Python. Một backtest có hàng nghìn nến × hàng trăm candidate → spawn mỗi nến là không dùng được, và chính là anti-pattern bị cấm.
Giải: **trả chi phí Python một lần, trước vòng lặp**. Precompute whole-series 1 lần / experiment run (mọi candidate trong một run dùng chung một chuỗi nến), rồi adapter chỉ tra bảng.

Ba cái này được giải **mà không** biến Engine thành chỗ "biết đây là AI".

---

## 8. Hỏi — đáp khi vấn đáp

**Q: Vì sao generate đi queue mà validate/run thì không?**
Generate = LLM + validate, 10–90 giây, người dùng có thể bỏ đi. Validate/run là thao tác ngắn, người dùng đang ngồi đợi. Queue chỉ dành cho việc **nặng và fire-and-forget** (F20).

**Q: Vì sao poll 2 giây, không WebSocket?**
Cùng pattern với experiment progress và news crawl. Một namespace socket riêng chỉ cho một tab là over-engineering. Poll đọc Redis, và sống sau F5 nhờ `AiGenerateProvider` mount ở `/app`.

**Q: Trùng job thì coalesce như search, hay 409?**
**409**, message cố định `"A generate job is already running for this account."` Không coalesce vì hai prompt khác nhau cho hai kết quả khác nhau; không replace vì tốn token song song và race UI.

**Q: Ai gọi LLM — Python hay NestJS?**
NestJS (`OpenAiCompatibleProvider`), chạy trong **Worker**. `workers/ai-strategy/` không có HTTP client. Vẽ `Python → LLM` là sai.

**Q: Generate đã ở Worker rồi, sao API vẫn spawn Python?**
Vì đó là use-case khác: người dùng sửa code tay rồi bấm kiểm tra / chạy thử — không đi qua LLM.

**Q: Không có API key thì sao? Test có gọi mạng không?**
`FakeProvider` cho unit test (code mẫu tất định, không mạng). Request generate thật khi thiếu key thì **lỗi rõ ràng** (400), không trả code giả như thể model đã sinh. Ngoài ra `GET /ai-strategy/provider` cho UI biết đang nối vào provider nào và có key thật hay không.

**Q: Cổng AST có phải sandbox bảo mật không?**
**Không.** Nó chặn tai nạn (`os`, `eval`, mạng, vòng lặp treo), không chặn kẻ tấn công có chủ đích. Đồ án chạy local, người dùng tin cậy. Sandbox thật (container, seccomp) ngoài phạm vi. Nên nói thẳng điều này thay vì né.

**Q: Timeout Python trên Windows xử lý sao?**
Hai tầng. Tầng ngoài (bắt buộc): `python-process.util` của Nest — timeout + SIGKILL. Tầng trong: `sandbox.py` dùng `signal.alarm` trên POSIX; Windows không có `SIGALRM` nên chuyển sang `threading.Timer`. Interpreter chọn theo thứ tự: env → venv của news worker nếu có (đúng `Scripts\` hay `bin`) → `python` trên PATH (F17).

**Q: `attempts` generate = 1 còn search = 3, có mâu thuẫn không?**
Không. Search idempotent theo DB nên retry an toàn. Generate hỏng do LLM/mạng mà tự retry là đốt token lần hai — để người dùng bấm lại.

**Q: `lockDuration` 120s để làm gì?**
Lock mặc định của BullMQ ngắn hơn thời gian LLM + validate. Hết lock trong lúc job còn chạy thì job bị coi là stale và có thể bị nhặt lần hai.

**Q: Vì sao một adapter dùng chung cho mọi `AI:*`, không register từng strategy vào registry?**
Built-in là 4–5 plugin, biết hết lúc `onModuleInit`. AI strategy là vô hạn, theo từng user, nằm trong Postgres, sinh lúc runtime. Nạp lại registry mỗi lần Save sẽ biến registry thành shared mutable state. Adapter stateless nên một instance là đủ.

**Q: Trọng số của AI strategy có công thức riêng không?**
Không. Nó là một row `strategies` bình thường → dùng nguyên `experiment_config_strategies` và `Σ(w × signal) / Σw`.

---

## 9. Câu chốt khi trình bày

> LLM chỉ là một **dependency cấu hình** của NestJS Worker. Python chỉ là **cổng kiểm duyệt và máy chạy**. Strategy Engine chỉ nhìn thấy một plugin. Và chi phí gọi Python được **trả một lần trước vòng lặp** chứ không phải mỗi nến — nhờ vậy strategy do AI sinh đi chung Continuous Strategy Loop với MA/RSI/BB mà không phá nguyên tắc Open/Closed của Strategy Engine.
