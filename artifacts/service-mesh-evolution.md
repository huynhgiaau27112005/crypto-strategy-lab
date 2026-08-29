# ADR — Service Mesh: chưa triển khai, và lộ trình tới lúc cần

**Ngày:** 2026-08-29
**Trạng thái:** Đã chốt — **không** deploy service mesh trong phạm vi đồ án
**Liên quan:** [architecture.md](architecture.md), [event-catalog.md](event-catalog.md), [observability.md](observability.md)

---

## 1. Quyết định

**Không** đưa Istio/Linkerd (hay bất kỳ service mesh nào) vào hệ thống ở giai đoạn này. Không thêm sidecar, không thêm manifest K8s, không sửa `docker-compose.yml`.

## 2. Bối cảnh — mesh giải quyết vấn đề gì

Service mesh chèn một sidecar proxy cạnh mỗi service, để hạ tầng mạng lo giúp những việc mà nếu không có nó thì từng service phải tự code:

- mTLS giữa các service
- Retry / timeout / circuit breaker ở tầng mạng
- Traffic shifting (canary, blue-green)
- Distributed tracing tự động
- Traffic policy tập trung (ai được gọi ai)

Điểm chung của cả 6: chúng đều là bài toán của **traffic HTTP/gRPC service-to-service**.

## 3. Vì sao hệ thống này chưa cần

Hình dạng triển khai hiện tại (xem `docker-compose.yml`):

```
┌─────────┐   ┌──────────┐        ┌───────────────┐
│   API   │   │  Worker  │        │  Web platform │
│ (Nest)  │   │  (Nest)  │        │   (browser)   │
└────┬────┘   └────┬─────┘        └───────┬───────┘
     │             │                      │
     │   ┌─────────┴──────────┐           │ HTTP
     └───┤ Redis + TimescaleDB ├──────────┘
         └────────────────────┘
```

Bốn lý do cụ thể:

1. **API và Worker không hề gọi nhau qua HTTP.** Chúng giao tiếp gián tiếp qua **Redis (BullMQ)** và qua **database dùng chung**. Traffic service-to-service — thứ duy nhất mesh chặn được — **bằng không**. Sidecar sẽ không có gì để chặn.

2. **Chỉ có 2 tiến trình deploy được, dựng từ cùng 1 image.** Chúng khác nhau ở entrypoint. Không có topology dịch vụ để định tuyến.

3. **Chưa có Kubernetes.** Mesh gắn vào vòng đời pod của K8s. Gắn Istio lên docker-compose là ép một công cụ vào chỗ nó không thuộc về — sẽ thành đồ trang trí trong slide, không phải kiến trúc.

4. **Những gì mesh hay được kể công thì hệ thống này đã có sẵn ở tầng ứng dụng:**

   | Khả năng | Hiện đã có bằng gì |
   |---|---|
   | Correlation / tracing | `correlation-context.ts` (AsyncLocalStorage), truyền qua job payload BullMQ sang worker |
   | Retry + backoff | BullMQ `attempts: 3`, exponential backoff |
   | Timeout | `queue/with-timeout.ts` |
   | Health probe | `/health/live` ở API, cổng metrics riêng của worker |
   | Metrics | `prom-client`, mỗi tiến trình một registry |

   Thêm mesh lúc này chỉ **nhân đôi** các cơ chế trên chứ không thay thế được cái nào.

## 4. Điều kiện kích hoạt — bao giờ thì nên xem lại

Chỉ nên tính đến mesh khi **đồng thời** thoả:

- [ ] Đã chạy trên **Kubernetes** (mesh gắn vào vòng đời pod)
- [ ] Có **≥ 4 service deploy độc lập** thật sự
- [ ] Các service **gọi nhau qua HTTP/gRPC** (không chỉ qua queue/DB dùng chung)
- [ ] Có nhu cầu **policy giữa các service** mà từng service tự code sẽ trùng lặp: mTLS bắt buộc, retry budget, circuit breaker
- [ ] Có người **vận hành** được nó (mesh là hệ thống phân tán thứ hai đặt chồng lên hệ thống thứ nhất)

Thiếu bất kỳ mục nào → mesh cộng thêm chi phí vận hành mà không đổi lại được gì.

## 5. Lộ trình 3 bước

### Bước 1 — Hiện tại: Modular Monolith + Worker (đã xong)

- 1 codebase, 2 tiến trình, giao tiếp qua Redis + Postgres.
- Ranh giới module đã sạch (Search không còn biết Leaderboard tồn tại — decoupling qua domain event).
- **Việc cần làm để sẵn sàng cho bước sau:** giữ nghiêm ranh giới module; đảm bảo mọi giao tiếp cross-module đều đi qua interface tường minh hoặc event.

### Bước 2 — Kubernetes + scale worker theo chiều ngang

- Deploy cùng image thành 2 Deployment (api, worker).
- Scale worker lên N replica — BullMQ đã hỗ trợ sẵn nhiều consumer, **không cần đổi code**.
- Thêm liveness/readiness probe (endpoint đã có sẵn).
- **Vẫn chưa cần mesh:** worker không gọi nhau; Redis vẫn là điểm điều phối.

### Bước 3 — Tách service, rồi mới tới mesh

- Tách khi một module có **nhịp thay đổi** hoặc **hồ sơ tài nguyên** thực sự khác biệt. Ứng viên rõ nhất: Sentiment/Crawler (Python, dùng nhiều CPU/GPU, phụ thuộc mô hình ML khác hẳn phần còn lại).
- Khi số service gọi nhau qua mạng chạm ngưỡng ở mục 4 → cân nhắc Linkerd (đơn giản hơn) trước Istio.
- Lúc đó mesh **thay thế** phần retry/timeout đang code tay ở tầng ứng dụng, chứ không phải chồng thêm lên.

## 6. Đánh đổi của chính quyết định này

**Được:** không phải vận hành control plane; không thêm độ trễ sidecar; tốc độ làm đồ án; khi vấn đáp có thể chỉ ra chính xác vì sao *chưa* dùng, thay vì trưng một cấu hình không chạy.

**Mất:** không có mTLS tự động giữa các tiến trình (chấp nhận được — chúng chưa nói chuyện trực tiếp với nhau); không có distributed tracing dạng biểu đồ (thay bằng correlationId trong log có cấu trúc); nếu sau này bùng nổ số service, sẽ phải trả một lần chi phí học và triển khai.

**Rủi ro nếu làm ngược lại:** thêm mesh bây giờ sẽ tạo ra một tầng hạ tầng phức tạp mà **không chặn được traffic nào** — vì API và Worker không gọi nhau qua HTTP. Đúng nghĩa "kiến trúc để trưng bày".
