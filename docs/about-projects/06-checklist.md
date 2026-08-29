**KIẾN TRÚC CHO CRYPTO STRATEGY LAB Từ "chạy được" đến một nền tảng có thể thay đổi, mở rộng và kiểm chứng Software Architecture Mục tiêu:** thấy một yêu cầu thay đổi làm hệ thống "vỡ" — rồi dùng kiến thức kiến trúc để cứu nó. **Đối chiếu syllabus:** Topic 1 → 11 · **Cơ sở:** [S], [P], [R1–R26], [W1–W8] Tran Quy 

1 

# **0. Bố cục** 

|**Phần**|**Thời gian**|**Vấn đề trọng tâm**|**Syllabus**|
|---|---|---|---|
|Mở màn|0–5'|Bot trade đầu tiên|Topic 1|
|Act 1|5–15'|Yêu cầu mới làm code vỡ|Topic 2|
|Act 2|15–27'|Không có bản đồ chung|Topic 3|
|Act 3|27–42'|God Service và coupling|Topic 4, 6|
|Act 4|42–58'|100.000 strategy candidates|Topic 8, 9|
|Act 5|58–72'|Scale, deploy, failure|Topic 5|
|Act 6|72–84'|Kết quả có tái lập được không?|Topic 8, 10, 11|
|Act 7|84–97'|Kiến trúc đẹp có thật sự tốt?|Topic 4 – ADD/ATAM|
|Kết|97–100'|Architecture Proof|Review|



2 

# **1. Nhiệm vụ: Crypto Strategy Lab cần làm gì?** 

Market data realtime từ Binance (nhiều timeframe) · nhiều strategy (MA, RSI, Bollinger...) Composite strategy, backtest, evaluate + leaderboard, tự động search combinations News → Sentiment ML · mở rộng được **không cần viết lại toàn bộ hệ thống Trọng tâm là Kiến trúc phần mềm, không phải tìm strategy đầu tư tốt nhất. Nguồn:** [P §2, §47] · [S Topic 1] 

3 

# **2. Bot đầu tiên: "Chạy rồi!"** 

Mọi thứ được viết vào **một class duy nhất** : 

```
TradingService: getBinanceData, calculateMA, calculateRSI, crawlNews,
 analyzeSentiment, backtest, rank, saveDatabase, sendWebSocket
```

**Có thể chạy rất tốt.** Đây gọi là "God Service" — một class biết và làm mọi thứ. Chưa sai về chức năng — nhưng **nguy hiểm khi hệ thống phải thay đổi** , vì mọi lý do thay đổi trên đời đều dồn vào đúng một chỗ. 

**Syllabus:** Topic 1 – Software Architecture Concepts **Nguồn:** [P §44 – God Service anti-pattern] · [R2] · [R10] 

4 



<!-- Start of picture text -->
God Service: 5 lý do thay đổi, 1 nơi bị đụng<br>Binance đổi API RSI đổi công thức<br>"Lý do: data provider" "Lý do: logic chiến lược"<br>DB đổi schema TradingService UI realtime đổi<br>(getData, calcMA, RSI, news,<br>"Lý do: lưu trữ dữ liệu" "Lý do: hiển thị"<br>sentiment, backtest, rank, save, ws)<br>Sentiment model đổi<br>"Lý do: machine learning"<br><!-- End of picture text -->

_5 lý do thay đổi khác nhau — nhưng chỉ có MỘT chỗ trong code phải sửa mỗi lần._ 

5 

**3. Bảy yêu cầu thay đổi ập đến Mỗi thay đổi buộc ta sửa bao nhiêu nơi?** _(sơ đồ đầy đủ ở slide sau)_ **Nguồn:** [P §40–43] 

6 

### **7 yêu cầu thay đổi ập đến cùng lúc** 

**1. Thêm MACDStrategy** strategy mới 

**5. WebSocket mất kết nối** phải tự phục hồi 

**2. Binance lỗi → OKX 3. Random → Genetic 4. 100 → 100.000** đổi data provider đổi search algorithm backtests 

**6. News Service lỗi** chart vẫn phải chạy 

**7. Sáu tháng sau: Top #1 dùng strategy/model/data version nào?** cần truy vết được (provenance) 

**TradingService** (một class làm tất cả) chịu được đến đâu? 

###### **Mỗi thay đổi buộc sửa BAO NHIÊU nơi?** 

_Đây là câu hỏi mà kiến trúc phần mềm phải trả lời được — không phải "chạy có được không"._ 

7 

# **ACT 1 — Không bắt đầu bằng Kafka** 

**Bắt đầu bằng Architectural Drivers (lý do buộc ta phải thiết kế theo cách nhất định)** · **Đúng: đi từ lý do đến công cụ Sai: chọn công cụ trước rồi mới tìm lý do** 

```
Business goal          "Em thích Kafka"
  ↓                       ↓
ASR (yêu cầu ảnh          "Dùng microservices"
hưởng cấu trúc)            ↓
```

```
  ↓                      "Kubernetes luôn"
Quality Attribute          ↓
Scenarios (đo được)      ...rồi mới tìm lý do
  ↓                     để biện minh
Architectural decisions
```

```
  ↓
Patterns / tactics
  ↓
Technology (Kafka, K8s...)
```

**Syllabus:** Topic 2 – ASRs, Quality Attributes **Nguồn:** [R1], [R6], [W1] 

8 

# **4. Architectural Drivers của Crypto Strategy Lab** 

**8 "đèn cảnh báo" mà kiến trúc phải thiết kế sẵn** **_(xem bảng điều khiển ở slide sau)_ Nguồn:** [P §32, §36] · Syllabus Topic 2 

9 

### **8 "đèn cảnh báo" của Crypto Strategy Lab** 

"Xe chạy tốt" chưa đủ — mỗi đèn dưới đây phải sáng đúng lúc 

**Modifiability Scalability Performance Realtime** Thêm MACD phải 100 → 100.000 1.000 backtests: tuần tự Candle mới đến chart sửa mấy nơi? candidates thì sao? hay song song? trễ bao lâu? **Reliability Maintainability Observability Reproducibility** Binance disconnect Đổi search algorithm có Loop đang chạy? Top #1 sinh ra từ có mất candle? viết lại backtester? Bao nhiêu job lỗi? version nào? 

###### **Mỗi driver cần một Quality Attribute Scenario** 

đo được, kiểm tra được — không phải slogan mơ hồ như "nhanh", "ổn định", "dễ mở rộng" 

_Không có driver nào quan trọng hơn driver nào — quan trọng là driver nào ĐÚNG cho bài toán này._ 

10 

# **5. Biến "hệ thống phải tốt" thành scenario đo được** 

## **Template đơn giản (nhớ tắt: S-S-E-A-R-M)** 

```
SOURCE      Ai/cái gì gây sự kiện?
STIMULUS    Chuyện gì xảy ra?
ENVIRONMENT Trong hoàn cảnh nào?
ARTIFACT    Thành phần nào bị tác động?
RESPONSE    Hệ thống phải làm gì?
MEASURE     Đo thế nào để biết đạt?
```

```
Modifiability: thêm MACDStrategy → đăng ký plugin mới
              → không sửa Backtester, Evaluator, UI
Reliability:   Binance WebSocket disconnect → reconnect
              + recover missing candles → không mất/duplicate
```

#### **Nguồn:** [R1], [R6] 

11 

# **6. Mini challenge: "Yêu cầu nào mới thật sự lái kiến trúc?"** 

#### **A** 

"Chart phải đẹp." 

#### **B** 

"Khi đổi timeframe 5m → 1h, chỉ chart đó cập nhật, không reload toàn hệ thống." 

#### **C** 

"Logo đặt góc trái." 

#### **D** 

"News Service lỗi không làm Market Data pipeline ngừng." 

**Chọn ASR (yêu cầu ảnh hưởng cấu trúc) và giải thích vì sao** 

**Đáp án kỳ vọng:** B, D — vì cả hai đều buộc hệ thống phải có ranh giới (boundary) và cơ chế cách ly (isolation) rõ ràng, còn A và C chỉ là chi tiết giao diện, không đòi hỏi thay đổi cấu trúc. 

12 

# **ACT 2 — "Mỗi người đang hình dung một hệ thống khác nhau"** 

**Ta cần bản đồ** 

Architecture documentation không phải để làm đẹp báo cáo. Nó là **shared mental model** — bản đồ chung để cả nhóm nhìn về một hướng. **Syllabus Topic 3** 

4+1 View Model (5 góc nhìn kiến trúc) C4 Model (4 mức phóng to dần) Architecture Views (góc nhìn kiến trúc) UML Architecture Diagrams **Nguồn:** [R5], [R7], [R8], [W2] 

13 

# **7. C4 Level 1 — System Context** 

## **"Hệ thống của chúng ta sống trong thế giới nào?"** 



<!-- Start of picture text -->
            ┌──────────────┐<br>            │ User/Trader  │<br>            └──────┬───────┘<br>                   │<br>                   ▼<br>       ┌────────────────────────┐<br>       │   Crypto Strategy Lab  │<br>       └─────┬───────────┬──────┘<br>             │           │<br>             ▼           ▼<br>          Binance    News Providers<br><!-- End of picture text -->

#### **Không cần đưa vào đây** 

`Redis` · `Kafka` · `React` · `PostgreSQL` · `Python` 

**Mục đích:** boundary + people + external systems — trả lời câu "hệ thống này nói chuyện với ai ở bên ngoài?", chưa quan tâm công nghệ bên trong. 

14 

# **8. C4 Level 2 — Container** 

## **"Bên trong Crypto Strategy Lab có những khối chạy độc lập nào?"** 

|`┌──────────── Crypto Strategy Lab ────────────┐`<br>`│ Frontend ──API/WS──> Backend/API            │`<br>`│        ──────────────┼──────────────      │`|
|---|
|`┌┐`<br>`│        ▼              ▼              ▼      │`|
|`│ Market Data     Strategy/Search    News      │`<br>|
|`│  → Exchange       → Backtest Jobs   → Sentiment`<br>`│    Adapter              │                    │`<br>`│                         ▼                    │`<br>`│                     Database                 │`<br>`└───────────────────────────────────────────────┘`|



##### **Candidate architecture** — một đề xuất khả dĩ, không phải đáp án duy nhất. 

#### **Project:** [P §31] 

15 

# **9. C4 Level 3 — Component** 

## **Zoom vào Strategy/Search** 

```
Strategy/Search: StrategyRegistry (MA, RSI...) · StrategyGenerator → CandidateStrategy
 → CombinationPolicy · SearchCoordinator → BacktestPort
```

**Câu hỏi view này trả lời:** Ai đăng ký strategy? Ai sinh candidate? Ai combine signal? Search có biết backtest implementation không? _(sơ đồ 3 mức ở slide sau)_ 

16 

#### **C4 Model: cùng một hệ thống, 3 mức phóng to** 



<!-- Start of picture text -->
Level 1 — Context Level 2 — Container Level 3 — Component<br>"Hệ thống sống trong thế giới nào?" "Bên trong có những khối nào?" Zoom vào Strategy/Search<br>User / Trader Frontend → Backend/API StrategyRegistry (MA, RSI...)<br>Strategy /<br>Market Data Search News Service StrategyGenerator → Candidate<br>Crypto Strategy Lab<br>Exchange Adapter · Backtest Jobs · Sentiment CombinationPolicy<br>🔍 🔍<br>Binance News Providers<br>Database<br>SearchCoordinator → BacktestPort<br>Zoom = thành phố trên bản đồ Zoom = quận / tòa nhà trên bản đồ Zoom = từng con hẻm trên bản đồ<br><!-- End of picture text -->

_Cùng một hệ thống — chỉ khác câu hỏi đang muốn trả lời và mức độ chi tiết cần thiết._ 

17 

# **10. Static view chưa đủ: hãy kể một runtime story Scenario: candidate mới lên Leaderboard ("dynamic view" — góc nhìn theo thời gian)** 

```
User → START SEARCH → SearchCoordinator → generate → CandidateStrategy
 → enqueue → BacktestWorker → result → Evaluator → score
 → Ranking → LeaderboardUpdated → Frontend
```

Cho thấy điều sơ đồ tĩnh không thể hiện được: sync/async boundary · data flow · failure point · latency path **Đối chiếu:** 4+1 / Architecture Views · [R5], [R7] 

18 

# **ACT 3 — Chia đúng trách nhiệm trước khi chia server** 

## **"Một nhà hàng không để đầu bếp kiêm thu ngân, shipper và kế toán"** 

```
Chef       → nấu
Cashier    → thanh toán
Waiter     → phục vụ
Accountant → kế toán
```

: Crypto Lab cũng vậy — mỗi khối chỉ nên có **một lý do để thay đổi** `MarketData ≠ Strategy ≠ Backtest ≠ Evaluate ≠ Rank ≠ UI` 

**Syllabus:** Topic 4 + Topic 6 **Nguồn:** [R2], [R3], [R9], [R10], [R20], [R21] _(sơ đồ ánh xạ đầy đủ ở slide sau)_ 

19 

##### **Mỗi vai trò một trách nhiệm — một lý do để thay đổi** 



<!-- Start of picture text -->
Chef Cashier Waiter Accountant<br>nấu ăn thanh toán phục vụ kế toán<br>Market Data Strategy Backtest/Evaluate/Rank UI / Presentation<br><!-- End of picture text -->

###### **Mỗi khối chỉ nên có MỘT lý do để thay đổi** 

MarketData ≠ Strategy ≠ Backtest ≠ Evaluate ≠ Rank ≠ UI 

6 slide tiếp theo sẽ bóc tách từng ranh giới này 

_Nếu đầu bếp kiêm luôn thu ngân: đổi máy tính tiền cũng phải nghỉ nấu để học lại — dù món ăn chẳng liên quan gì đến máy tính tiền._ 

20 

# **11. DDD: Đừng để "Trading" trở thành một khối mơ hồ Có thể nhìn domain thành các capability (Domain-Driven Design — thiết kế theo nghiệp vụ)** 

**Bounded Context Khái niệm bên trong** Market Data Candle, Pair, Timeframe Strategy StrategyDefinition, Signal, Combination Experiment Candidate, Backtest, Evaluation, Ranking News Intelligence NewsItem, Sentiment 

`Signal` trong Strategy Context không nhất thiết là cùng khái niệm với `Trade` trong Experiment Context. **Syllabus:** Domain-Driven Design **Nguồn:** [R3], [R20], [R21] 

21 

##### **4 Bounded Context — 4 "thế giới" khái niệm riêng biệt** 



<!-- Start of picture text -->
Market Data Strategy Experiment<br>Candle StrategyDefinition Candidate, Backtest<br>Pair Signal Evaluation<br>Timeframe Combination Ranking<br>News Intelligence<br>NewsItem<br>Sentiment<br><!-- End of picture text -->

_`Signal` ở Strategy Context ≠ `Trade` ở Experiment Context — cùng nói về "mua/bán" nhưng khác nghĩa, giống từ "Ly" đổi nghĩa theo ngữ cảnh._ 

22 

# **12. Clean Architecture: dependency hướng vào policy** 

```
Không nên:  RSIStrategy → MySQL → Binance JSON  (business logic tự gọi hạ tầng)
```

```
Nên:        RSIStrategy → MarketContext/Port → BinanceAdapter | RepositoryAdapter
           (đảo hướng phụ thuộc — dependency inversion)
```

Strategy cần **data nó cần** , không cần biết data đến từ đâu. _(Sơ đồ đầy đủ ở slide sau.)_ 

**Project:** [P §44] **Syllabus:** The Clean Architecture **Nguồn:** [R2] 

23 

#### **Clean Architecture: đảo hướng phụ thuộc qua "Port"** 



<!-- Start of picture text -->
✗  Không nên ✓  Nên<br>RSIStrategy RSIStrategy<br>MySQL MarketContext / Port<br>Binance JSON BinanceAdapter RepositoryAdapter<br>Business logic gọi thẳng Strategy chỉ biết "Port" —<br>hạ tầng cụ thể → đổi DB/exchange đổi database hay đổi sàn giao dịch<br>là phải sửa RSIStrategy. chỉ cần đổi Adapter, không đụng Strategy.<br><!-- End of picture text -->

_"Business policy không nên biết infrastructure cụ thể — chỉ nên biết một cổng giao tiếp chuẩn."_ 

24 

# **13. Strategy + Plugin + Registry** 

## **"Ngày mai có MACD thì sao?"** 

```
interface Strategy { analyze(context) -> Signal }
```

```
StrategyRegistry: MA, RSI, Bollinger, SupportResistance, + MACD ← thêm mới
```

**Architecture test: thêm** **`MACDStrategy` mà không sửa Backtester, Evaluator, Leaderboard, Frontend core Project:** [P §12, §41] **Syllabus:** Architectural Patterns **Nguồn:** [R9] 

25 

# **14. Composite Strategy: khi ba strategy "cãi nhau"** 

```
MA → BUY, RSI → SELL, SR → BUY — ai quyết định cuối cùng?
```

**Policy A — Majority Vote:** BUY=2 → BUY **Policy B — Weighted Vote:** score = 1×0.2 + (-1)×0.3 + 1×0.5 = 0.4 **Kiến trúc cần tách:** Strategy signals ≠ CombinationPolicy _(sơ đồ ở slide sau)_ **Project:** [P §13–14] 

26 

##### **Khi 3 strategy "cãi nhau" — ai tổng hợp?** 



<!-- Start of picture text -->
MA RSI SR<br>→ BUY → SELL → BUY<br>CombinationPolicy<br>("thư ký ban giám khảo")<br>Policy A — Majority Vote: BUY=2 → BUY<br>Policy B — Weighted: MA=0.2, RSI=0.3, SR=0.5<br>score = 1×0.2 + (-1)×0.3 + 1×0.5 = 0.4<br>Strategy signals ≠ CombinationPolicy<br><!-- End of picture text -->

? 

_Mỗi giám khảo chỉ chấm điểm — không ai kiêm luôn việc tổng hợp._ 

27 

# **15. Adapter: Đừng để frontend "nói tiếng Binance"** 

```
Sai:       Frontend → Binance JSON (trực tiếp)
```

```
Tốt hơn:   Frontend → MarketDataService → MarketDataProvider
                       → BinanceAdapter | OKXAdapter | BybitAdapter
```

**Normalized contract:** `Candle { symbol, timeframe, openTime, open, high, low, close, volume }` _(sơ đồ đầy đủ ở slide sau)_ **Project:** [P §4] **Nguồn:** [R9], [R10] 

28 

#### **Adapter: frontend chỉ nên nói MỘT ngôn ngữ dữ liệu** 



<!-- Start of picture text -->
✗  Sai<br>Frontend<br>Binance JSON<br><!-- End of picture text -->

Frontend "học tiếng Binance". Thêm OKX = frontend phải học thêm một ngôn ngữ mới. 



<!-- Start of picture text -->
✓  Tốt hơn<br>Frontend<br>MarketDataProvider<br>(luôn trả về Candle chuẩn)<br>BinanceAdapter OKXAdapter BybitAdapter<br><!-- End of picture text -->

Mỗi Adapter tự "phiên dịch" — frontend chỉ cần biết đúng 1 định dạng Candle, dù thêm bao nhiêu sàn mới. 

_Candle { symbol, timeframe, openTime, open, high, low, close, volume }_ 

29 

# **16. Frontend: SPA, Micro-Frontends, JAMstack — dùng khi nào?** 

**MVP hợp lý:** Single SPA Dashboard (Chart, Strategy, Backtest, Leaderboard, News panel) **Micro-Frontend** chỉ đáng cân nhắc khi: nhiều team sở hữu feature độc lập, release cadence khác nhau, boundary UI rõ **JAMstack** hợp nội dung tĩnh/pre-render — realtime dashboard vẫn cần kênh dữ liệu thời gian thực riêng 

_(so sánh trực quan ở slide sau)_ **Syllabus Topic 6 Nguồn:** [R12], [R16], [R17], [R18], [R19] 

30 

##### **Frontend: dùng đúng style theo đúng bối cảnh** 



<!-- Start of picture text -->
SPA — 1 bếp Micro-Frontend JAMstack<br>Chart · Strategy · Backtest chuỗi nhượng quyền — tối ưu nội dung<br>Leaderboard · News mỗi chi nhánh tự quản bếp tĩnh / pre-render<br>✓  MVP hợp lý ⚠  Chỉ khi cần ✗  Không hợp realtime<br>quán nhỏ, 1 đội quản lý nhiều team độc lập, dashboard cần kênh dữ liệu<br>toàn bộ giao diện release cadence khác nhau thời gian thực riêng<br><!-- End of picture text -->

###### **Một nhóm nhỏ dùng mô hình nhượng quyền cho quán ăn nhỏ** 

###### **là tự làm khó mình.** 

_Không có style nào được điểm vì tên nghe hiện đại — mỗi style có bối cảnh riêng._ 

31 

**17. Transaction boundary: một kết quả backtest "hoàn tất" nghĩa là gì?** Worker: 1. Lưu trades → 2. Lưu metrics → 3. Đánh dấu `COMPLETED` → 4. Publish `BacktestCompleted` **Nếu crash sau bước 2:** Trades ✓, Metrics ✓, nhưng Status ✗, Event ✗ _(sơ đồ ATM ở slide sau)_ **Câu hỏi kiến trúc:** Atomicity cần tới đâu? Retry có tạo duplicate? Event publish và DB commit phối hợp thế nào? **Syllabus:** Transactional Processing **Nguồn:** [R11], [R10] 

32 

##### **Giống chuyển tiền ATM: hoặc cả hai bước, hoặc không bước nào** 

###### ✗ **Nếu crash giữa chừng** 

###### ✓ **Tư duy ATM: MỘT đơn vị** 

1. Lưu trades ✓ 



<!-- Start of picture text -->
2. Lưu metrics ✓<br><!-- End of picture text -->



<!-- Start of picture text -->
✗ CRASH<br><!-- End of picture text -->

###### **Rút tiền ATM: trừ tài khoản A + cộng tài khoản B** 

→ HOẶC cả hai cùng thành công, 

→ HOẶC cùng bị huỷ (rollback) 



<!-- Start of picture text -->
3. Status ✗ chưa cập nhật<br><!-- End of picture text -->



<!-- Start of picture text -->
4. Event ✗ chưa publish<br><!-- End of picture text -->

**Leaderboard đọc dữ liệu không nhất quán** 

###### **Backtest worker cần tư duy y hệt:** 

Trades + Metrics + Status + Event 

= một đơn vị toàn vẹn duy nhất 

###### **Câu hỏi kiến trúc:** 

Atomicity cần tới đâu? · Retry có tạo duplicate? Event publish và DB commit phối hợp thế nào? 

33 

# **ACT 4 — Strategy Search làm hệ thống "nổ"** 

## **4 strategy thì vui. 4 strategy × nhiều parameters thì sao?** 

```
Generate → Backtest → Evaluate → Rank
```

Mỗi tham số nhân thêm (MA windows, RSI thresholds, BB deviations...) → bùng nổ tổ hợp. _(chi tiết ở slide sau)_ 

**Project:** [P §15–18] 

34 

##### **Bùng nổ tổ hợp: vài tham số nhỏ → hàng chục nghìn candidate** 



<!-- Start of picture text -->
Ví dụ: chọn trang phục<br>5 × 4 × 3 =<br>60<br>áo quần giày<br>Generate → Backtest → Evaluate → Rank<br>phải chạy được với khối lượng này<br><!-- End of picture text -->

###### **Với strategy trading** 



<!-- Start of picture text -->
MA: 10/20, 20/50, 50/200<br>RSI: 14/30/70, 14/20/80...<br>BB: nhiều windows/deviations<br>SR: nhiều detection params<br>→ hàng chục nghìn tổ hợp<br><!-- End of picture text -->

### **100.000 candidates** 

_không còn là con số ngẫu nhiên — mà là hệ quả tất yếu của phép nhân tổ hợp._ 

35 

# **18. Continuous Strategy Loop** 

**"Generate → Execute → Measure → Improve"** `Generate → Backtest → Evaluate → Rank → Leaderboard ──┐ ▲                                                  │ └──────────────── generate tiếp ────────────────────┘` **Bắt buộc có Stop Condition (điều kiện dừng) — không** **`while(true)`** max candidates · max time · no improvement N iterations · user cancel **Project:** [P §23–24] 

36 

# **19. Từ for-loop sang Job Queue + Workers Kém scalable — một người làm hết** 

`Kém scalable:  for candidate in candidates: backtest(); evaluate(); update_ui() Tách pipeline: StrategyGenerator → Job Queue → [W1, W2, W3] → Evaluator → Ranking` **Mua được:** parallelism · retry · pause/resume · backpressure · observability **Project:** [P §24, §43] **Syllabus:** Message Brokers / EDA **Nguồn:** [R4], [R13], [R22], [W3] 

37 

#### **Một quầy thu ngân so với nhiều quầy song song** 

###### ✗ **For-loop tuần tự** 

###### ✓ **Job Queue + Workers** 



<!-- Start of picture text -->
10.000 candidates<br>1 Worker duy nhất<br><!-- End of picture text -->



<!-- Start of picture text -->
Job Queue (10.000 job)<br>Worker 1 Worker 2 Worker 3<br><!-- End of picture text -->

candidate #1 → #2 → #3 → ... lần lượt, không cái nào xen ngang 

### **≈ 5.5 giờ** 

(10.000 × 2 giây, chạy 1 luồng) 

nhiều worker xử lý song song, thêm worker khi cần nhanh hơn 

**≈ 1.8 giờ (3 workers)** càng nhiều worker càng nhanh 

_Số liệu minh họa (1 worker ≈ 2 giây/candidate) — mục đích là cảm nhận độ lớn, không phải cam kết hiệu năng._ 

38 

# **20. Event-Driven: "Tôi thông báo sự thật đã xảy ra"** 

```
Thay vì gọi chặt: BacktestWorker → direct call → LeaderboardService.update()
Publish event:     BacktestWorker → StrategyEvaluated → [Ranking, Audit]
```

**Producer không cần biết consumer là ai** _(sơ đồ ở slide sau)_ **Project:** [P §34] **Syllabus:** Event-Driven Architecture **Nguồn:** [R4], [R22], [W3] 

39 

#### **Gọi điện riêng từng người, so với phát loa thông báo** 



<!-- Start of picture text -->
✗  Direct call (gọi chặt)<br>BacktestWorker<br>LeaderboardService.update()<br><!-- End of picture text -->

Thêm consumer mới (vd: Audit) = phải sửa code BacktestWorker để gọi thêm một hàm nữa. 

✓ **Publish / Subscribe (phát loa)** 



<!-- Start of picture text -->
BacktestWorker<br>StrategyEvaluated (event)<br>Ranking Audit<br><!-- End of picture text -->

Thêm người nghe mới (consumer) = chỉ cần "đăng ký lắng nghe", BacktestWorker không đổi gì cả. 

40 

# **21. Event Catalog của Crypto Strategy Lab** 

9 sự kiện: MarketPriceUpdated, CandleClosed, StrategyGenerated, BacktestStarted/Completed, StrategyEvaluated, LeaderboardUpdated, NewsCollected, SentimentAnalyzed. **Với mỗi event, phải hỏi:** owner? schema/version? key/order? duplicate? consumer failure? cần replay không? _(chi tiết ở slide sau)_ 

**Event name dễ. Event semantics mới khó.** 

41 

##### **Event Catalog — mỗi "kiện hàng" cần nhãn chuẩn** 



<!-- Start of picture text -->
MarketPriceUpdated CandleClosed StrategyGenerated BacktestStarted<br>BacktestCompleted StrategyEvaluated LeaderboardUpdated NewsCollected<br>SentimentAnalyzed<br>Đặt tên sự kiện = dễ. Nhãn dán đầy đủ mới khó:<br>duplicate xử lý<br>owner là ai? schema/version? key/order theo gì?<br>thế nào?<br>consumer failure<br>cần replay không?<br>thì sao?<br><!-- End of picture text -->

###### **_"Event name dễ. Event semantics mới khó."_** 

42 

# **22. Event Streaming và "Kappa thinking": market data là dòng sự kiện liên tục** 

```
Binance WebSocket → Exchange Adapter → Normalized Market Events → Indicator/Strategy/UI/Storage
```

**Kappa-style intuition:** một luồng xử lý chính cho streaming, thay vì duy trì hai logic batch+speed riêng. Nhưng không phải project nào cũng cần Kafka/Kappa. _(minh họa ở slide sau)_ **Syllabus:** Event Streaming, Kappa Architecture **Nguồn:** [R22], [R23], [W6] 

43 

##### **Kappa thinking: một nguồn tín hiệu, hai cách dùng** 



<!-- Start of picture text -->
Phát trực tiếp (realtime)<br>người xem tại nhà xem ngay<br>Camera<br>trực tiếp<br>Ghi lại (replay/batch)<br>xem lại VAR, highlight sau trận<br><!-- End of picture text -->

###### **Tương đương với market data:** 

**Binance WebSocket → Exchange Adapter → Normalized Market Events** → dùng cho cả Indicator/Strategy/UI (realtime) lẫn Storage (batch) 

- _"Use streaming because your problem is a stream — not because Kafka is fashionable."_ 

44 

# **23. Serverless có thể nằm ở đâu?** 

## **Candidate hợp lý** 

```
Scheduled News Fetch
     ↓
```

```
Serverless Function
     ↓
Normalize NewsItem
     ↓
Publish NewsCollected
```

## **Không phải lựa chọn mặc định cho** 

long-running backtest worker (worker chạy dài) stateful high-throughput loop (vòng lặp lưu trạng thái, tải cao) low-latency connection giữ lâu (kết nối cần độ trễ thấp, giữ lâu) **Trade-off (đánh đổi)** 

- **+** scale-to-demand, ops nhẹ 

- execution limits, cold start, state/external dependency complexity 

45 

##### **Nhân viên thời vụ, so với nhân viên toàn thời gian** 

✓ **Serverless — thời vụ** 

###### ✗ **Không hợp cho việc dài** 

Scheduled News Fetch ↓ Serverless Function ↓ Normalize → Publish **Việc vài giây, mỗi giờ 1 lần → trả tiền theo lần gọi** (News Collector) 

long-running backtest worker stateful high-throughput loop low-latency connection giữ lâu **Việc chạy liên tục hàng giờ → cần nhân viên thường trực** (Backtest Worker) 

###### **Trade-off: + scale-to-demand, ops nhẹ** 

**− execution limits, cold start** 

_Thuê nhân viên thời vụ cho việc dài sẽ liên tục phải "đào tạo lại từ đầu" (cold start)._ 

46 

# **ACT 5 — "Có cần Microservices chưa?" Trước hết: Modular Monolith là một đáp án hợp lệ** 

`One deployable: [Market module | Strategy module | Experiment module | News module | API module]` **Tách process/service khi có driver:** độc lập scale · fault isolation · independent deployment · runtime/resource profile khác nhau **Syllabus:** Microservice Architecture **Nguồn:** [R13], [R14], [R15] 

47 

# **24. Docker: đóng gói execution environment (môi trường chạy)** 

```
image: crypto-backtest-worker:v1 → run → container #1, #2, #3
```

**Giải quyết:** runtime/dependency consistency · packaging · isolation · repeatable deployment **Không tự giải quyết:** service boundaries · scaling policy · data consistency · observability **Syllabus:** Containers (Docker) **Minh chứng:** [W4] 

48 

# **25. Kubernetes: khi "thêm worker" phải trở thành thao tác có hệ thống** 

```
Backtest Queue → [W1, W2, W3, W4]     replicas: 1 → 4
```

**Phù hợp khi cần:** scheduling · desired state · replicas · restart tự động · rolling deployment · autoscaling 

**Không bắt buộc cho MVP.** _(sơ đồ scale đầy đủ ở slide sau)_ **Syllabus:** Container Orchestration **Minh chứng:** [W5] 

49 

#### **Docker đóng gói → Kubernetes nhân bản theo tải** 

###### **1. Docker: 1 công thức, chạy ở đâu cũng giống** 

###### **2. Kubernetes: tăng bản sao khi hàng đợi dài** 



<!-- Start of picture text -->
image: backtest-worker:v1<br>container 1 container 2 container 3<br><!-- End of picture text -->



<!-- Start of picture text -->
replicas: 1<br>Backtest Queue<br>W1<br>backlog: dài<br>scale up<br>replicas: 4<br>W1 W2 W3 W4<br>Backtest Queue<br>backlog: rút ngắn<br><!-- End of picture text -->

_Điều kiện: worker phải stateless và job phải idempotent — nếu không, thêm worker chỉ tạo ra nhiều lỗi hơn nhanh hơn._ 

50 

**26. Service Mesh: chỉ xuất hiện khi network trở thành "một hệ thống"** Với 6 service (Market, Strategy, Backtest, Ranking, News, Sentiment), mới có vấn đề crosscutting: service-to-service traffic, retries/timeouts, mTLS, telemetry, traffic policy. **Nếu chỉ 2–3 process?** Service Mesh có thể là **chi phí lớn hơn lợi ích** . _(minh họa ở slide sau)_ **Syllabus:** Service Mesh **Nguồn nền:** [R14], [R13] 

51 

##### **Service Mesh: khu phố 3 nhà chưa cần xây metro** 

✓ **2–3 service — đi bộ là đủ** 

API Market Không cần Service Mesh — chi phí lớn hơn lợi ích 



<!-- Start of picture text -->
⚠  Nhiều service — cần điều phối<br>Market Strategy<br>API<br>News/<br>Backtest<br>Sentiment<br>Ranking<br><!-- End of picture text -->

retries · timeouts · mTLS · telemetry · traffic policy 

**→ đây mới cần Service Mesh** 

_Xây hệ thống đèn giao thông cho khu phố 3 nhà là lãng phí — không phải "chuyên nghiệp hơn"._ 

52 

# **ACT 6 — "Top #1 này từ đâu ra?"** 

**Kết quả demo: #1 MA+RSI+SR, Return 18.2%, MDD -6.1%, Trades 81** Câu hỏi kiểm tra: MA version nào? RSI parameters? dataset period? fee? code commit/model version? search config? 

"...không có câu trả lời." **Đây là kiến trúc của một Experiment Platform (nền tảng thí nghiệm có thể kiểm chứng lại). Project:** [P §35–36] 

53 

##### **Phòng thí nghiệm nghiêm túc: ghi lại MỌI điều kiện** 

✗ **"Thí nghiệm thành công"** ✓ **Experiment Platform** id, candidate spec **Return = 18.2%** strategy versions, parameters dataset / timeframe MA version? RSI params? execution config, metrics dataset? model version? timestamps, status model version (nếu có sentiment) **"...không có câu trả lời" → mọi kết quả đều truy vết được** 

###### **Nhà khoa học không chỉ ghi "thành công" — họ ghi nhiệt độ, nồng độ, thiết bị, thời gian** 

_để bất kỳ ai khác cũng có thể lặp lại thí nghiệm và ra cùng kết quả._ 

54 

# **27. CQRS: write model và read model có thể khác nhau** 

`Write side: RunBacktest → Experiment → Result/Metrics/Events Read side:  LeaderboardView (Rank | Strategy | Return | MDD | Trades)` **Vì sao tách?** Write tối ưu cho consistency/workflow; Read tối ưu cho tốc độ hiển thị. CQRS thêm complexity. Đừng dùng nếu CRUD đơn giản đã đủ. _(sơ đồ ở slide sau)_ **Syllabus:** CQRS (Command Query Responsibility Segregation) **Nguồn:** [R4], [R10] 

55 

#### **CQRS: bếp (ghi) và thực đơn (đọc) là hai mô hình khác nhau** 

###### **Write side — "bếp"** 

**Read side — "thực đơn"** 



<!-- Start of picture text -->
RunBacktest (command)<br>Experiment (state machine)<br>Result / Metrics / Events<br><!-- End of picture text -->

Nhiều bước, phức tạp, tối ưu cho tính đúng đắn. 



<!-- Start of picture text -->
LeaderboardView<br>#1 MA+RSI+SR 18.2%<br>#2 RSI+BB 15.4%<br>#3 MA 11.9%<br>#4 ...<br><!-- End of picture text -->

Đơn giản, hiển thị nhanh, tối ưu cho tốc độ đọc. 

_Chỉ tách khi CRUD đơn giản không còn đủ — CQRS là đánh đổi, không phải huy hiệu để khoe._ 

56 

# **28. Event Sourcing: "lưu lịch sử thay đổi" khác "lưu trạng thái cuối"** 

`State-only:    Experiment.status = COMPLETED Event history: ExperimentCreated → CandidateAssigned → BacktestStarted → BacktestCompleted → StrategyEvaluated → LeaderboardPromoted` **Lợi ích:** audit · replay · temporal history · debugging — **Chi phí:** schema evolution · storage · overhead **Không bắt buộc cho đồ án.** _(sơ đồ ở slide sau)_ **Syllabus:** Event Sourcing **Nguồn:** [R4], [W7] 

57 

#### **Số dư hiện tại, so với sao kê đầy đủ lịch sử** 

###### **State-only** 

###### **Event history (sao kê)** 

Số dư hiện tại 

**5.000.000đ** 

Biết ĐANG có bao nhiêu, không biết vì sao lại là con số đó. 

**Sao kê giao dịch** 01/08 ExperimentCreated 01/08 CandidateAssigned 02/08 BacktestStarted 03/08 BacktestCompleted 03/08 StrategyEvaluated 04/08 LeaderboardPromoted 

Biết CHÍNH XÁC điều gì xảy ra, theo thứ tự nào — dựng lại được state bất kỳ lúc nào. 

_Đổi lại: chi phí lưu trữ và độ phức tạp cao hơn — chỉ dùng khi audit/replay thực sự cần thiết._ 

58 

# **29. News + Sentiment: ML là một component, không phải "trung tâm vũ trụ"** 

```
News Provider → News Collector → Normalized NewsItem
```

```
 → Sentiment Service (BERT → FinBERT → LLM) → SentimentResult → SentimentStrategy
```

Strategy Engine **không nên biết model cụ thể** . _(sơ đồ ở slide sau)_ **Project:** [P §27–30, §44] **Syllabus:** Quality Attributes for AI Systems, MLOps 

59 

##### **ML là một component — không phải "trung tâm vũ trụ"** 



<!-- Start of picture text -->
News Collector Sentiment Service SentimentResult SentimentStrategy<br>News Provider<br>(chỉ collect) BERT → FinBERT → LLM Strategy Engine không biết model<br><!-- End of picture text -->

###### **Giống thuê công ty dịch thuật, không phải một phiên dịch cụ thể** 

Chỉ cần nhận bản dịch chuẩn — đổi phiên dịch viên (đổi model) không ai ở phía nhận biết được, miễn định dạng không đổi. 

_Đổi provider không đổi model · đổi model không đổi collector — mỗi khối thay đổi độc lập._ 

60 

# **30. MLOps: kết quả phải trả lời "model nào tạo ra nó?"** 

Một prediction record nên trace được: `newsId, sentiment, score, model{name, version}, inputVersion, createdAt` 

**Monitor ít nhất:** model/version đang deploy · inference failures · latency · input/data issues · quality drift _(chi tiết ở slide sau)_ **Syllabus:** Topic 11 – MLOps **Nguồn:** [R24] 

61 

##### **Tem nhãn lô sản xuất — truy vết chính xác model nào gây ra kết quả** 

🥛 **Hộp sữa** Ngày sản xuất · Dây chuyền · Lô hàng 

**Prediction record** model: SentimentModel v3 

`newsId: 8821 · sentiment: NEGATIVE · score: 0.91` **model: { name: SentimentModel, version: v3 }** inputVersion / preprocessingVersion / createdAt **Monitor: model/version deploy · inference failures · latency · input/data issues · quality drift** → có sự cố, truy đúng LÔ (version) — không nghi ngờ cả hệ thống 

_Nếu phát hiện lô sữa lỗi, nhà máy thu hồi đúng lô đó — không phải toàn bộ sản phẩm đã bán._ 

62 

# **31. AI Agent: mở rộng Search Engine, không thay toàn bộ architecture** 

```
Agent = Strategy Generator: Observe → Plan → Act → Evaluate → Stop/Improve
```

**Vẫn phải tuân theo contract:** `StrategyGenerator.generate() -> CandidateStrategy` _(sơ đồ ở slide sau)_ **Syllabus:** AI Agent Frameworks & Design Patterns **Nguồn:** [R25], [R26] 

63 

##### **AI Agent: nhân viên mới, vẫn theo đúng biểu mẫu cũ** 



<!-- Start of picture text -->
Vòng lặp Agent = Strategy Generator<br>Observe Plan Act Evaluate → Stop/Improve<br>leaderboard + failures propose candidate submit backtest receive score<br>interface StrategyGenerator<br>generate() -> CandidateStrategy<br>Backtester/Evaluator không biết candidate sinh bằng cách nào<br><!-- End of picture text -->

_Nhân viên mới (Agent) có thể tự học, tự nghĩ — nhưng vẫn nộp đúng biểu mẫu cũ._ 

64 

# **ACT 7 — Thiết kế kiến trúc có phương pháp** 

**ADD: Driver → Decision → Decomposition (chia nhỏ dần, 8 bước — xem slide sau) Áp dụng:** `Scalability of backtest` → Queue + worker pool → define BacktestJob contract → đo throughput/failure 

**Syllabus:** Attribute-Driven Design **Nguồn:** [R6], [W1] 

65 

#### **ADD: 8 bước, đi vòng tròn cho đến khi đạt yêu cầu** 



<!-- Start of picture text -->
1. Design purpose<br>Cần thiết kế cái gì?<br>8. Lặp lại 2. Chọn ASRs<br>Chưa đạt → quay lại bước 2 Yêu cầu nào quan trọng?<br>7. Verify vs ASRs 3. Chọn phạm vi<br>Có đáp ứng yêu cầu chưa? Crypto Strategy Lab Phần nào của hệ thống?<br>vd: Scalability of backtest<br>→ Queue + worker pool<br>6. Định nghĩa interface 4. Chọn pattern/tactic<br>Hợp đồng giữa các phần Giải pháp khả dĩ<br>5. Phân bổ trách nhiệm<br>Ai làm gì?<br><!-- End of picture text -->

_Bước 7 "verify" không đạt thì quay lại bước 2 — đây là vòng lặp, không phải đường thẳng một lần._ 

66 

# **32. ATAM: Architecture không được chấm bằng "nhìn đẹp"** 

**Ta đưa scenario vào "đập" kiến trúc Scenario A** Thêm MACD → sửa mấy component? **Scenario B** Binance disconnect → recover thế nào? **Scenario C** 100 → 100.000 backtests → bottleneck ở đâu? **Scenario D** News Service down → Market chart còn hoạt động? **Scenario E** Top #1 → truy được provenance? **Syllabus:** Architecture Evaluation / ATAM **Nguồn:** [R1], [W8] 

67 

##### **ATAM: crash-test 5 kịch bản vào kiến trúc** 



<!-- Start of picture text -->
Scenario A Scenario B Scenario C Scenario D Scenario E<br>Thêm MACD → Binance disconnect → 100 → 100.000 backtests News Service down → Top #1 →<br>sửa mấy component? recover thế nào? → bottleneck ở đâu? chart còn hoạt động? truy được provenance?<br>🚗💥  Crash-test kiến trúc<br>không chấm bằng "nhìn đẹp" — chấm bằng va chạm thật<br><!-- End of picture text -->

_Mỗi lần "đâm" thành công một quyết định, luôn có một cái giá đi kèm — bảng trade-off ở slide sau._ 

68 

# **33. Trade-off Matrix — không có "free lunch" (không có gì miễn phí)** 

|**Decision**|**Lợi ích**|**Giá phải trả**|
|---|---|---|
|Plugin architecture|thêm strategy dễ|contract/versioning|
|Async queue|scale, retry|eventual consistency|
|Microservices|độc lập deploy/scale|network + ops complexity|
|Event-driven|loose coupling|tracing/order/duplicate|
|CQRS|read model linh hoạt|sync/projection complexity|
|Event Sourcing|audit/replay|schema/replay overhead|
|Kubernetes|orchestration/replicas|operational complexity|
|AI Agent search|flexible exploration|cost, nondeterminism, eval|



Kiến trúc tốt = **trade-off phù hợp với driver** , không phải nhiều công nghệ. 

69 

# **34. Architecture Proof #1 — Extensibility Test (kiểm tra khả năng mở rộng)** 

**Yêu cầu ngay khi demo: "Thêm MACD."** 

```
Thiết kế tốt:  + MACDStrategy, + StrategyRegistry.register(MACDStrategy)   → 2 dòng
Coupling cao:  Controller, Backtester, UI, Database, CombinationEngine, Evaluator  → 6 nơi sửa
```

**Thay đổi thật là unit test của architecture. Project:** [P §41] 

70 

# **35. Architecture Proof #2 — Replaceability Test (kiểm tra khả năng thay thế)** 

```
Hiện tại:    RandomStrategyGenerator
Yêu cầu mới: DomainGuidedStrategyGenerator
Contract (không đổi): interface StrategyGenerator { generate() -> CandidateStrategy }
```

Downstream (Backtester, Evaluator, Leaderboard) **không cần biết** candidate sinh bằng cách nào. **Project:** [P §42] 

71 

**36. Architecture Proof #3 — Scalability & Failure Test (kiểm tra khả năng mở rộng và chịu lỗi)** 

**Test 1 — Scale:** Workers 1 → 3. Hỏi: throughput đổi? queue backlog? DB contention? duplicate? 

**Test 2 — Failure:** News Service = DOWN. Kỳ vọng: Realtime Chart ✓, Strategy ✓, Backtest ✓ — chỉ News/Sentiment degraded. 

**Test 3 — Realtime recovery:** Binance disconnect → reconnect → gap recovery. _(Sơ đồ đầy đủ ở slide ảnh kế tiếp.)_ 

**Project:** [P §32, §40, §43] 

72 

##### **3 bài kiểm tra "Architecture Proof" khi demo trực tiếp** 

###### **1. Extensibility — "Thêm MACD"** 



<!-- Start of picture text -->
Thiết kế tốt: 2 dòng thay đổi Coupling cao: 6 nơi phải sửa<br>Controller, Backtester, UI, DB, CombinationEngine, Evaluator<br>+ MACDStrategy, register()<br>2. Replaceability — "Đổi Random → Genetic Search"<br>interface StrategyGenerator Backtester · Evaluator · Leaderboard<br>RandomGenerator → GeneticGenerator<br>generate() -> CandidateStrategy — không đổi một dòng nào<br><!-- End of picture text -->

###### **3. Scalability & Failure — "Tăng worker" + "Tắt News Service"** 



<!-- Start of picture text -->
Workers: 1 → 3 News Service = DOWN Kỳ vọng: Realtime Chart  ✓  Strategy  ✓  Backtest  ✓<br>đo throughput/backlog Chart/Backtest có sống sót? News/Sentiment: degraded — KHÔNG kéo sập cả hệ thống<br>+ Binance disconnect → reconnect → gap recovery<br><!-- End of picture text -->

_"Một tài liệu kiến trúc chỉ là lời tuyên bố. Một thay đổi thật diễn ra trực tiếp mới là bằng chứng."_ 

73 

**37. 7 Milestone để làm đồ án không bị "vỡ trận" M1 Architecture Skeleton** — Context + Container + boundaries + interfaces **M2 Walking Skeleton** — Binance → backend → WebSocket → chart (chạy được end-toend) **M3 Strategy Plugin** — 4 strategies + extension test **M4 Experiment Pipeline** — Candidate → Backtest → Evaluate → Rank **M5 Continuous Loop** — Queue/worker nếu cần + stop condition **M6 News + Sentiment** — provider → collector → model → result **M7 Architecture Proof** — change + failure + scale + provenance 

74 

###### **7 Milestone: đổ móng cả căn nhà trước, hoàn thiện dần** 



<!-- Start of picture text -->
M1 M2 M3 M4 M5 M6 M7<br>Architecture Walking Strategy Experiment Continuous News + Architecture<br>Skeleton Skeleton Plugin Pipeline Loop Sentiment Proof<br>Context+Container+boundaries Binance→backend→WS→chart 4 strategies+extension test Candidate→Backtest→Rank<br>Queue/worker + stop condition provider→collector→model change+failure+scale+provenance<br><!-- End of picture text -->

_Thợ giỏi đổ móng và dựng khung cả căn nhà trước — không xây trọn từng phòng rồi mới ráp lại._ 

75 

# **38. Demo cuối kỳ = phần kết câu chuyện** 

```
BTCUSDT (5m|15m|1h|4h) → Select MA/RSI/BB/SR → START SEARCH
```

```
 → Candidates tested: 125 → Leaderboard updates → Click Top #1
```

```
 → Trades+Return+MDD+signals → News+Sentiment → Add SentimentStrategy
 → Run search again
```

**Sau đó mới "đập" architecture bằng change scenario Project:** [P §46] 

76 

# **39. Checklist: sinh viên phải trả lời được 10 câu này** 

   1. Architectural drivers là gì? 

   2. C4 Context và Container của nhóm? 

   3. Boundary của Market / Strategy / Experiment / News? 

   4. Thêm strategy mới sửa ở đâu? 

   5. Đổi search algorithm sửa ở đâu? 

   6. Provider mới có làm frontend đổi? 

   7. 100.000 backtests scale thế nào? 

   8. Service lỗi có lan failure không? 

   9. Duplicate/retry/event order xử lý thế nào? 

10. Leaderboard result truy được provenance thế nào? Không trả lời được → kiến trúc vẫn đang là "hộp và mũi tên". 

77 

# **40. Mental model cuối cùng** 

## **Làm kiến trúc theo thứ tự này** 

`1. Understand problem → 2. ASRs/Quality Attr. → 3. Write scenarios` 

- `→ 4. C4 views → 5. Boundaries & contracts → 6. Patterns/tactics` 

- `→ 7. Walking skeleton → 8. Measure/observe/fail → 9. Trade-offs` 

- `→ 10. Record ADRs + evidence` 

# _(Sơ đồ đầy đủ ở slide ảnh kế tiếp.)_ **Câu chốt** 

**Đừng hỏi "Dùng công nghệ gì?" trước.** Hãy hỏi: **"Điều gì sẽ thay đổi, điều gì có thể hỏng, và kiến trúc của ta chứng minh được gì?"** 

78 

###### **10 bước làm kiến trúc — từ hiểu vấn đề đến có bằng chứng** 

**1. Understand problem** Hiểu vấn đề thật sự là gì 

###### **10. Record ADRs** 

Ghi lại quyết định + bằng chứng 

**2. ASRs / Quality Attr.** Yêu cầu nào quan trọng 

**9. Evaluate trade-offs** Cân nhắc đánh đổi 

**3. Write scenarios** Biến yêu cầu thành đo được 

**8. Measure/observe/fail** Đo lường, quan sát, thử lỗi 

**4. C4 views** Vẽ bản đồ hệ thống 

**7. Walking skeleton** Chạy được end-to-end 

**5. Boundaries & contracts** Định rõ ranh giới 

**6. Patterns/tactics** Chọn giải pháp 

**"Đừng hỏi dùng công nghệ gì trước." Hãy hỏi: điều gì sẽ thay đổi, điều gì có thể hỏng, và kiến trúc của ta chứng minh được gì.** 

_Team 404 — Profit Not Found · Crypto Strategy Lab_ 

79 

# **PHỤ LỤC A — Đối chiếu Seminar ↔ Syllabus** 

- **Syllabus Topic Nơi xuất hiện trong câu chuyện** 

- 1. Software Architecture Concepts God Service → Architecture under change 2. Quality Attributes / ASRs / AI QA change requests, scenarios, ML subsystem 3. 4+1 / C4 / Views / UML Context, Container, Component, Dynamic view 4. Styles / Patterns / Reconstruction / ADD / ATAM Plugin, Adapter, ADD, ATAM-lite 5. Microservices / Docker / Kubernetes / Service Mesh scaling/deployment act 6. SPA / MFE / JAMstack / DDD / Clean / Transactions UI choices + boundaries 8. CQRS / Event Sourcing experiment/leaderboard/provenance 9. Brokers / Streaming / EDA / Serverless / Kappa strategy factory pipeline 10. AI Agents AgentStrategyGenerator extension 11. MLOps sentiment model lifecycle/versioning 

80 

# **PHỤ LỤC B — Gợi ý ADR (Architecture Decision Record)** 

```
ADR-001  Why MarketDataProvider + Adapter?
ADR-002  Why WebSocket for realtime UI?
ADR-003  Why Strategy Plugin/Registry?
ADR-004  Why separate Backtester and Evaluator?
ADR-005  Why queue/worker (or why NOT)?
ADR-006  Why modular monolith vs microservices?
```

```
ADR-007  How experiment/version provenance is stored?
```

```
ADR-008  Why separate News Collector and Sentiment Service?
ADR-009  Why CQRS/Event Sourcing is used — or deliberately not used?
ADR-010  Stop conditions and observability of Strategy Loop
```

**Format ngắn:** Context · Decision · Alternatives · Consequences · Evidence **Project:** [P §45] 

81 

# **PHỤ LỤC C — Rubric đánh giá kiến trúc (gợi ý)** 

**Tiêu chí Câu hỏi kiểm chứng** 

Modifiability (dễ sửa) thêm MACD sửa bao nhiêu component? Replaceability (dễ thay thế) Random → Domain-guided có ảnh hưởng Backtester? Scalability (mở rộng) worker count tăng có cần sửa code core? Reliability (tin cậy) kill News/Binance connection hệ thống degrade ra sao? Observability (quan sát được) có biết queue depth, job latency, failure count? Reproducibility (tái lập được) Top-K có link về exact experiment config/version? Documentation (tài liệu) Context/Container/Dynamic view nhất quán với code? Trade-off reasoning (lý giải đánh đổi) mỗi công nghệ có driver và consequence? 

82 

# **PHỤ LỤC D — Ký hiệu nguồn trong seminar** 

**[S]** `Syllabus - Software Architecture (4).docx` 

§5 Teaching Plan 

#### §7 Resources / References 

**[P]** `Crypto Strategy Lab – Đồ án cuối kỳ(1).pdf §` dùng số mục đúng theo project spec **[R#]** sách nằm trong mục **References** của syllabus (R1–R26) **[W#]** nguồn official/primary dùng để kiểm chứng thêm (W1–W8) 

Nội dung [P]/[S] được giữ theo framing của tài liệu môn học. Các mở rộng như "ATAM-lite", milestone, architecture proof là **cách tổ chức giảng dạy** được suy ra từ tài liệu và literature, không phải yêu cầu mới của đề nếu đề không ghi. Bản dễ hiểu này bổ sung thêm ví dụ minh họa và sơ đồ SVG so với bản gốc; các ví dụ đời thường (nhà hàng, ATM, sao kê ngân hàng...) là minh họa sư phạm do người biên soạn thêm vào, không phải trích dẫn từ [S]/[P]/[R#]/[W#]. 

83 

# **PHỤ LỤC E — References từ syllabus (1/3)** 

**[R1]** Len Bass, Paul Clements, Rick Kazman (2021). _Software Architecture in Practice_ , 4th ed. Addison-Wesley. **[R2]** Robert C. Martin (2017). _Clean Architecture: A Craftsman's Guide to Software Structure and Design_ . Pearson. **[R3]** Vlad Khononov (2021). _Learning Domain-Driven Design_ . O'Reilly. **[R4]** Ethan Garofolo (2020). . _Practical Microservices: Build Event-Driven Architectures with Event Sourcing and CQRS_ Pragmatic Bookshelf. 

**[R5]** Paul Clements et al. (2010). _Documenting Software Architectures: Views and Beyond_ . Pearson. **[R6]** Humberto Cervantes, Rick Kazman (2016). _Designing Software Architectures: A Practical Approach_ . Addison-Wesley Professional. **[R7]** Nick Rozanski, Eoin Woods (2012). 

84 

# **PHỤ LỤC F — References từ syllabus (2/3)** 

**[R9]** Erich Gamma et al. (1994). _Design Patterns: Elements of Reusable Object-Oriented Software_ . Addison-Wesley. **[R10]** Martin Fowler et al. (2002). _Patterns of Enterprise Application Architecture_ . Addison-Wesley. **[R11]** Philip A. Bernstein, Eric Newcomer (2009). _Principles of Transaction Processing_ , 2nd ed. Morgan Kaufmann. **[R12]** Emmit Scott (2015). _SPA Design and Architecture_ . Manning. **[R13]** Chris Richardson (2019). _Microservices Patterns: With Examples in Java_ . Manning. **[R14]** Sam Newman (2021). _Building Microservices: Designing Fine-Grained Systems_ . O'Reilly. **[R15]** Sam Newman (2019). _Monolith to Microservices_ . O'Reilly. 

85 

# **PHỤ LỤC G — References từ syllabus (3/3)** 

**[R18]** Mathias Biilmann, Phil Hawksworth (2019). _Modern Web Development on the JAMstack_ . O'Reilly. **[R19]** Raymond Camden, Brian Rinaldi (2022). _The Jamstack Book_ . Manning. **[R20]** Eric Evans (2003). _Domain-Driven Design: Tackling Complexity in the Heart of Software_ . Addison-Wesley. 

**[R21]** Vaughn Vernon (2013). _Implementing Domain-Driven Design_ . Addison-Wesley Professional. **[R22]** Martin Kleppmann (2016). _Making Sense of Stream Processing_ . O'Reilly. **[R23]** Nathan Marz, James Warren (2015). _Big Data: Principles and Best Practices of Scalable Realtime Data Systems_ . Manning. **[R24]** Christian Kästner (2025). 

_Machine Learning in Production: From Models to Products_ . MIT Press. 

86 

# **PHỤ LỤC H — Nguồn chính thức dùng để kiểm chứng (official/primary sources)** 

**[W1] CMU Software Engineering Institute** _Attribute-Driven Design Method Collection_ (sei.cmu.edu) — ADD dựa trên ASRs/quality attribute requirements và recursive decomposition. Đã kiểm chứng qua web search khi biên soạn bản dễ hiểu này. 

- **[W2] C4 Model official site — Simon Brown** (c4model.com) 

C4 static structure: System Context → Container → Component → Code; Context + Container thường đủ cho nhiều team. Đã kiểm chứng. 

**[W3] Apache Kafka official documentation** (kafka.apache.org) 

Event streaming, producers, consumers, topics, durable event streams và decoupling producer/consumer. 

**[W4] Docker official documentation** (docs.docker.com) Container là runnable instance của image; image/container hỗ trợ repeatable packaging/execution. 

87 

# **PHỤ LỤC I — Câu hỏi tương tác dự phòng** 

**1. "Kafka có bắt buộc không?"** Không. Hãy chứng minh vì sao queue/event broker cần cho scale/coupling của nhóm. **2. "Microservices có được điểm cao hơn monolith?"** Không mặc định. Modular monolith có boundary tốt có thể tốt hơn distributed monolith. **3. "Có cần CQRS + Event Sourcing?"** Không. Chỉ dùng khi read/write shape, audit/replay hoặc domain driver đủ mạnh. **4. "Strategy có được query DB?"** Nên tránh để domain strategy phụ thuộc trực tiếp infrastructure; truyền context/port phù hợp. **5. "ML model tốt nhất có quyết định điểm?"** Đề nhấn mạnh architecture. ML là component cần boundary, versioning và evaluation phù hợp. 

88 

# **PHỤ LỤC J — Một câu để nhớ từng chương** 

**Quality Attributes:** "Tốt theo nghĩa nào, trong scenario nào?" **C4:** "Đang zoom ở mức nào?" **DDD:** "Boundary ngữ nghĩa nằm ở đâu?" **Clean Architecture:** "Business policy có đang phụ thuộc infrastructure?" **Patterns:** "Variability/force nào khiến pattern này tồn tại?" **Event-driven:** "Sự kiện nào đã xảy ra, ai thực sự cần biết?" **Microservices:** "Tại sao phải deploy/scale độc lập?" **CQRS:** "Write model và read model có thật sự cần khác?" **Event Sourcing:** "Có cần lịch sử/replay đủ mạnh để trả complexity?" **MLOps:** "Prediction này do model/data/version nào tạo?" **ATAM:** "Scenario nào có thể làm architecture thất bại?" 

# **END** 

89 

