# AI Strategy — sinh, kiểm duyệt, thực thi và đưa vào Search

Tài liệu mô tả **những gì đã build thật**. Nguồn sự thật: `service/src/modules/ai-strategy/`,
`service/src/modules/strategy-plugin/plugins/ai-strategy-plugin.adapter.ts`, `workers/ai-strategy/`.

---

## 1. Vấn đề cần giải

Prototype yêu cầu: người dùng mô tả chiến lược bằng tiếng Việt → LLM sinh file Python → hệ thống
kiểm duyệt → lưu vào thư viện → **được đưa vào sinh tổ hợp** cùng 4 strategy hệ thống.

Ba ràng buộc kiến trúc va nhau ở đây:

1. Đề bài cấm **gắn cứng một model ML** — không được `import openai` rải rác trong code.
2. Đề bài cấm **thêm điều kiện theo từng loại strategy** trong Strategy Engine — mà AI strategy lại
   khác hẳn strategy hệ thống về bản chất thực thi.
3. Strategy hệ thống chạy **trong tiến trình, mỗi nến một lần**. AI strategy là Python, chạy
   **ngoài tiến trình, một lần cho cả chuỗi nến**. Hai mô hình chi phí lệch nhau hàng bậc.

---

## 2. Provider LLM — cấu hình, không hard-code

```
LlmProviderFactory
├── OpenAiCompatibleProvider   ← đọc OPENAI_BASE_URL / OPENAI_MODEL / OPENAI_API_KEY
└── FakeProvider               ← dùng cho test, trả code Python mẫu tất định
```

Đổi model hay đổi nhà cung cấp = đổi biến môi trường, **không sửa dòng code nào**. Endpoint hiện
dùng là GitHub Models (tương thích OpenAI), nhưng OpenAI/OpenRouter/Azure đều cắm được.

`FakeProvider` được chọn tự động khi không có API key. Nhờ vậy **toàn bộ 238 test chạy không cần
key, không cần mạng, không tốn tiền** — điều kiện bắt buộc để CI có ý nghĩa.

Khi không có key mà người dùng bấm *sinh strategy*, API trả lỗi rõ ràng — **không** âm thầm trả code
mẫu giả vờ là model sinh ra.

---

## 3. Contract của code sinh ra

LLM được yêu cầu sinh đúng một hàm:

```python
def generate_signals(candles) -> list[str]:   # mỗi phần tử là "BUY" | "SELL" | "HOLD"
```

**Toàn chuỗi, không phải từng nến.** Đây là quyết định cố ý: một backtest duyệt hàng nghìn nến; gọi
subprocess Python mỗi nến là hàng nghìn lần khởi tạo tiến trình — chậm tới mức không dùng được.

---

## 4. Cổng kiểm duyệt (`AiStrategyValidatorService` → `workers/ai-strategy/validate.py`)

Bốn bước, kết quả hiện thẳng lên panel `Kiểm tra & validation`:

| # | Kiểm tra |
|---|---|
| 1 | Parse được (`ast.parse`) |
| 2 | Có đúng hàm `generate_signals` với đúng số tham số |
| 3 | **Quét AST** theo allowlist — chặn `os`, `sys`, `subprocess`, `socket`, `open`, `eval`, `exec`, `__import__`, truy cập thuộc tính dunder, mọi thứ chạm mạng |
| 4 | Chạy thử trên chuỗi nến tổng hợp nhỏ, trong subprocess có timeout cứng — phải trả đúng số lượng tín hiệu hợp lệ và không treo |

Bước 3 **duyệt cây AST chứ không regex source code**. Regex kiểu `/import os/` bị né dễ dàng bằng
`__import__('o'+'s')`; duyệt AST thì không.

### ⚠️ Đây là cổng kiểm duyệt, KHÔNG phải sandbox bảo mật

Nói thẳng để nhóm chủ động trả lời khi bị hỏi: chạy code do LLM sinh trong subprocess kèm timeout
**không đủ** để chặn một kẻ tấn công có chủ đích. Nó chặn được tai nạn và code sai, không chặn được
tấn công. Chấp nhận được vì đây là đồ án chạy cục bộ, một người dùng tin cậy. Muốn thật sự an toàn
thì cần container cách ly, giới hạn seccomp/cgroup, chạy user không đặc quyền — nằm ngoài phạm vi.

---

## 5. Lưu trữ — bất biến theo version

Dùng lại đúng bảng `strategies`, **không thêm migration nào**:

| Cột | Giá trị cho AI strategy |
|---|---|
| `type` | `AI_GENERATED` |
| `language` | `PYTHON` |
| `source_code` | code Python sinh ra |
| `owner_user_id` | chủ sở hữu — user khác không thấy, không chạy được |
| `version` | tăng dần, unique `(name, version)` |

Lưu = **INSERT row version mới**, không bao giờ UPDATE đè. Nhờ vậy một experiment cũ vẫn trỏ đúng
version `source_code` đã thực sự chạy, và kết quả cũ vẫn giải thích được — đúng yêu cầu chống
"overwrite strategy history" của đề bài.

---

## 6. Đưa vào Search — phần khó nhất

### 6.1 Định danh: `AI:<strategyId>`

AI strategy vào hệ thống dưới dạng một `SearchStrategyType` có tiền tố `AI:`.

### 6.2 Một adapter dùng chung, không đăng ký từng cái

`StrategyRegistry.resolve()` định tuyến **mọi** type `AI:*` về **một** instance
`AiStrategyPluginAdapter` duy nhất, stateless.

Lý do không đăng ký từng strategy vào registry: strategy hệ thống có 4 cái, cố định, đăng ký một lần
lúc `onModuleInit`. AI strategy thì thuộc về từng user, sinh ra lúc chạy, nằm trong Postgres, và số
lượng không giới hạn. Một registry nạp lúc khởi động không thể biết trước chúng — mà nạp lại registry
mỗi lần user lưu strategy mới sẽ biến registry thành trạng thái chia sẻ có thể đổi giữa chừng, nguy
hiểm hơn nhiều.

`registry.has('AI:...')` trả `false` (không có đăng ký), nhưng `registry.resolve('AI:...')` trả
adapter. Hai hàm tách bạch có chủ đích.

### 6.3 Hoà giải chênh lệch chi phí — `AiStrategySignalPrecomputeService`

Đây là chỗ đắt nhất của thiết kế:

```
Trước vòng lặp backtest, MỘT LẦN CHO CẢ EXPERIMENT:
  với mỗi AI strategy được chọn:
      chạy workers/ai-strategy/run.py trên toàn chuỗi nến
      → mảng tín hiệu, lưu vào SignalContext.aiSignals

Trong vòng lặp backtest, mỗi nến:
  AiStrategyPluginAdapter.analyze() = tra mảng theo index — O(1)
```

Chạy **một lần cho cả experiment**, không phải mỗi candidate — vì mọi candidate trong cùng một lần
search dùng chung một chuỗi nến. Chi phí subprocess được chia đều cho cả trăm candidate thay vì trả
lại từ đầu mỗi candidate.

Kết quả: từ góc nhìn của vòng lặp backtest, AI strategy **rẻ ngang** strategy hệ thống. Và
`StrategyEngineService` không hề biết có sự khác biệt — nó vẫn chỉ gọi
`registry.resolve(type).analyze(...)`, **không có một câu `if` nào phân biệt loại strategy**.

### 6.4 Domain

AI strategy phải có domain (`TREND` / `MOMENTUM` / `VOLATILITY` / `STRUCTURE`) mới ghép tổ hợp được,
vì generator bắt buộc có ít nhất một domain định hướng và một domain xác nhận.

**Người dùng chọn domain lúc lưu strategy.** Không suy đoán tự động: suy đoán sai sẽ làm tổ hợp mất
cân bằng theo cách không ai nhìn ra. Cột `domain` cho phép `NULL` để tương thích với row lưu trước
khi có tính năng này; row `NULL` không tham gia sinh tổ hợp.

### 6.5 Trọng số

Không có cơ chế riêng. AI strategy nằm trong `experiment_config_strategies` y hệt strategy hệ thống,
và tham gia đúng công thức `Σ(trọng số × tín hiệu) / Σ trọng số`.

### 6.6 Cô lập lỗi

`precompute()` chạy **tuần tự** từng strategy (giới hạn số subprocess đồng thời — tránh fan-out không
kiểm soát), và **bắt lỗi từng cái**:

- validate bị lệch so với lúc lưu → bỏ qua
- subprocess timeout → bỏ qua
- trả sai số lượng tín hiệu → bỏ qua

Strategy lỗi bị **loại khỏi lần search đó** và ghi log, **không** làm hỏng cả experiment. Một AI
strategy hỏng không được phép kéo sập một lần search đã chạy 100 candidate.

---

## 7. Giới hạn đã biết

| Giới hạn | Ảnh hưởng |
|---|---|
| Cổng validate không phải sandbox bảo mật (mục 4) | Chỉ an toàn với người dùng tin cậy |
| AI strategy không có tham số điều chỉnh được | Generator không dò tham số cho nó như với strategy hệ thống — mỗi AI strategy là một điểm cố định trong không gian tìm kiếm |
| Precompute chạy tuần tự | Chọn nhiều AI strategy thì thời gian khởi động search tăng tuyến tính |
| Đổi `OPENAI_MODEL` không version hoá theo strategy | Không truy được row nào sinh bởi model nào |
