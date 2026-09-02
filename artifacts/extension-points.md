# Điểm mở rộng (abstraction) — cái gì thay được mà không phải sửa code không liên quan

Đề bài (`docs/about-projects/02-architecture-goals.md`) đánh giá kiến trúc bằng đúng một câu hỏi: **thêm/đổi một thứ thì phải sửa bao nhiêu chỗ?** File này liệt kê các trục mở rộng đã có abstraction thật (interface + DI token), kèm "làm gì để đổi".

Nguyên tắc chung ở đây: **có interface thôi chưa đủ** — nếu consumer vẫn `inject` class cụ thể thì "thay thế được" chỉ đúng trên giấy. Mỗi mục dưới đây đều có (1) một interface, (2) một DI token, (3) đúng **một** chỗ trong module quyết định binding.

---

## 1. Market data provider — đổi sàn

| | |
|---|---|
| **Interface** | `service/src/modules/market-data/providers/market-data-provider.ts` → `MarketDataProvider` |
| **Token** | `MARKET_DATA_PROVIDER` |
| **Binding** | `MarketDataCoreModule` (`useExisting: BinanceClient`) |
| **Implementation hiện có** | `BinanceClient` |
| **Consumer** | `MarketDataService`, `MarketDataGateway`, `scripts/seed-candles.ts` |

**Trước khi sửa:** `BinanceClient` là class cụ thể, inject thẳng vào cả 3 consumer. Thêm sàn thứ 2 = sửa cả 3 file. `getKlines`, `streamCandles`, `streamTrades` là ba hàm ai cũng gọi trực tiếp trên class Binance.

**Sau khi sửa:** consumer chỉ biết `@Inject(MARKET_DATA_PROVIDER)`. Mọi chi tiết riêng của Binance (base URL REST, URL WebSocket, tên field `k.t/o/h/l/c/v/x`, mảng kline dạng vị trí `[openTime, open, high, ...]`) nằm gọn trong `binance.client.ts`. Các kiểu dữ liệu đã đổi tên trung lập: `BinanceKline` → `Kline` (giữ alias cũ để import cũ không vỡ).

**Đổi sàn cần làm gì:**
1. Viết class mới `implements MarketDataProvider` (vd. `OkxClient`).
2. Sửa **một dòng** `useExisting` trong `MarketDataCoreModule`.

`BinanceClient` **không** nằm trong `exports` của module — bên ngoài chỉ với tới được qua token, nên không ai vô tình couple lại vào Binance. Có test wiring (`market-data-core.module.spec.ts`) kiểm tra đúng 3 điều này, vì các spec khác đều `new` service bằng tay nên sẽ vẫn xanh kể cả khi binding sai.

---

## 2. Search algorithm — đổi thuật toán tìm kiếm

| | |
|---|---|
| **Interface** | `strategy-search/domain/search.types.ts` → `SearchAlgorithm<TRunCatalog>` |
| **Token** | `SEARCH_ALGORITHM` |
| **Binding** | `StrategySearchModule` (`useExisting: DomainGuidedRandomGenerator`) |
| **Consumer** | `StrategySearchService.run()` — chỉ gọi `generate()` |

Đây là yêu cầu `docs/about-projects/05-required-flows.md` §7: *"Search algorithms must remain replaceable without changing downstream backtesting."*

**Trước khi sửa:** interface `SearchAlgorithm` đã tồn tại, nhưng `StrategySearchService` inject `DomainGuidedRandomGenerator` (class cụ thể) — nên đổi thuật toán vẫn phải sửa service.

**Đổi thuật toán cần làm gì:** viết class `implements SearchAlgorithm`, đổi `useExisting` trong `StrategySearchModule`. Backtesting/evaluation/ranking không đổi một dòng nào.

---

## 3. Market scope — đổi cặp giao dịch

| | |
|---|---|
| **Backend** | `service/src/common/market-scope.ts` → `MARKET_SCOPE` |
| **Frontend** | `web-platform/src/lib/marketScope.ts` → `MARKET_SYMBOL`, `MARKET_BASE_ASSET` |
| **Env** | `MARKET_SYMBOL` / `MARKET_BASE_ASSET` / `MARKET_QUOTE_ASSET` (API), `VITE_MARKET_SYMBOL` / `VITE_MARKET_BASE_ASSET` (build FE) |

**Trước khi sửa:** chuỗi `'BTCUSDT'` được hard-code ở **8 chỗ độc lập** (`MarketDataGateway`, `RealtimeSignalService`, `StrategySearchService`, `seed-candles.ts`, `useCandleHistory`, `useMarketSocket`, cộng 6 chỗ text trong JSX), và riêng module News lại có hằng số **thứ chín** `NEWS_MARKET_SCOPE_COIN = 'BTC'` không liên quan gì tới 8 chỗ kia. "MVP chỉ 1 cặp" là quyết định phạm vi hợp lệ; viết nó thành 9 literal rời rạc thì không — bỏ sót một cái là app request một cặp rồi hiển thị nhãn của cặp khác, và **không có gì báo lỗi**.

`market-scope.ts` để trong `common/` (không phải trong `market-data/`) là có chủ đích: module News cần `baseAsset` nhưng không được phép import module market-data chỉ để lấy chuỗi đó.

---

## 4. Đã abstract sẵn từ trước (không sửa trong đợt này)

| Trục | Cơ chế |
|---|---|
| Thêm strategy mới | `strategy-plugin/strategy-registry.ts` — plugin registry, không có `if type === ...` ở đâu cả |
| Đổi LLM sinh strategy | `ai-strategy/providers/llm-provider.factory.ts` — chọn theo env, fallback `FakeLlmProvider` khi không có key |
| Đổi model sentiment | `workers/news/src/core/sentiment/provider.py` + `factory.py` — chọn theo `SENTIMENT_PROVIDER`, hiện có 3 implementation (`FinbertSentimentProvider`, `LexiconSentimentProvider`, `NoopSentimentProvider`) và tự xuống cấp FinBERT → lexicon khi thiếu weights. `resolve_sentiment_provider()` báo lại provider **thực sự** chạy để UI không gán nhầm nhãn cho FinBERT |
| Thêm nguồn tin | `workers/news/config/*_sources.yml` + `BaseParser` — thêm nguồn là thêm entry YAML, không sửa `NewsCrawler` |
| Đổi cache backend | `cache/cache.service.ts` — get/set/del/incr thuần, call site không tự gọi ioredis |

## 5. Cố tình KHÔNG abstract

- **`NewsCrawlService` (spawn tiến trình Python).** Chỉ có một cách chạy crawler và nó là quyết định kiến trúc đã chốt (ADR-005: crawler là tiến trình OS riêng). Bọc thêm một interface `CrawlerRunner` với đúng một implementation sẽ thêm một lớp gián tiếp mà không mở ra trục mở rộng nào đề bài yêu cầu.
- **`DatabaseService` (raw `pg`).** Xem `decisions.md` — cố ý không dùng ORM.
