# Tactical CQRS — tách đường ghi và đường đọc

> **Tuyên bố chính xác:** hệ thống tách **đường ghi** và **đường đọc** của Leaderboard, dùng **một database duy nhất**. Đây là *tactical CQRS*, **không phải** full CQRS (không có write DB / read DB riêng, không có event sourcing).
>
> Nói đúng mức độ là quan trọng khi vấn đáp: khoe "đã làm CQRS" mà không tách DB sẽ bị hỏi vặn ngay.

## 1. Vì sao có sự tách này (nó giải quyết vấn đề thật)

Xếp hạng Top-K không đọc trực tiếp được từ bảng ghi. Muốn có ranking phải join 4 bảng và cửa sổ hoá:

```
experiment_iterations → candidates → backtest_runs (status='COMPLETED') → evaluations
                                   ROW_NUMBER() OVER (ORDER BY overall_score DESC)
```

Chạy query đó cho **mỗi** request `GET .../top` là lãng phí: kết quả chỉ đổi khi có iteration mới. Nên nó được **materialize** một lần lúc ghi, vào `leaderboard_entries`, và đường đọc chỉ việc `SELECT`.

## 2. Sơ đồ

```
        ĐƯỜNG GHI (worker process)                 ĐƯỜNG ĐỌC (API process)
        ──────────────────────────                 ───────────────────────
POST /strategy-search/experiments                  GET /experiments/:id/top
        │                                                   │
        ▼                                                   ▼
   BullMQ "search" ──── Redis ────▶ Worker            StrategySearchService.getTop()
                                     │                      │
                          StrategySearchService.run()       ├─ đọc leaderboard:version:<exp>
                                     │                      │        (miss → coi như 0)
                          ┌──────────┴──────────┐           │
                          │  1 transaction:     │           ├─ đọc cache key
                          │  backtest_runs      │           │  strategy-search:top:<exp>:<user>:v{n}
                          │  trades             │           │        │
                          │  evaluations        │           │        ├─ HIT  → trả luôn
                          └──────────┬──────────┘           │        │
                                     │                      │        └─ MISS → SELECT
                          emit backtest.completed            │                 leaderboard_entries
                                     │                      │                 → set cache
                                     ▼                      │
                    LeaderboardEventsHandler                │
                                     │                      │
                    LeaderboardService.rebuildForExperiment()│
                                     │                      │
                          ┌──────────┴──────────┐           │
                          │  1 transaction:     │           │
                          │  DELETE entries     │  ══════▶  │  READ MODEL
                          │  INSERT ranked Top-K│  leaderboard_entries
                          └──────────┬──────────┘           │
                                     │                      │
                          INCR leaderboard:version:<exp> ═══▶  (làm khoá cache đổi)
                                     │
                          emit leaderboard.updated
```

## 3. Đường ghi (write side)

**Nơi:** tiến trình **worker**. `LeaderboardService.rebuildForExperiment()` (`service/src/modules/leaderboard/leaderboard.service.ts`).

- Chuẩn hoá đầy đủ: `backtest_runs`, `trades`, `evaluations` là nguồn sự thật, immutable, mỗi iteration ghi mới (không overwrite lịch sử — đây cũng là cách hệ thống đảm bảo *provenance* mà không cần Event Sourcing).
- Materialize: `DELETE` toàn bộ entries của leaderboard rồi `INSERT` lại Top-K trong **một transaction** → thao tác **idempotent**, chạy lại bao nhiêu lần cũng ra cùng kết quả. Đây là lý do việc BullMQ retry một job search không gây hỏng dữ liệu.
- Kích hoạt: qua domain event, **không** phải lời gọi trực tiếp. `StrategySearchService` không biết Leaderboard tồn tại (xem `event-catalog.md`).

## 4. Đường đọc (read side)

**Nơi:** tiến trình **API**. `StrategySearchService.getTop()`.

- Không tính toán ranking — chỉ đọc read model đã dựng sẵn.
- **Cache-aside** với khoá gắn version: `strategy-search:top:<experimentId>:<userId>:v{n}`.
- `limit` khi không truyền sẽ mặc định là `topK` **đã persist** của experiment, không phải hằng số hard-code — nếu không, một lần load trang mới sẽ hiển thị số dòng khác với những gì thật sự đã lưu.

## 5. Vô hiệu hoá cache xuyên tiến trình — mấu chốt của thiết kế

Đây là chỗ hai đường gặp nhau, và là lý do phải dùng Redis chứ không phải một callback trong bộ nhớ.

Ghi xảy ra ở **worker**; đọc xảy ra ở **API**. Đó là hai tiến trình OS khác nhau. Một event in-process **không thể** vượt qua ranh giới đó.

Giải pháp: sau mỗi lần rebuild, worker chạy `INCR leaderboard:version:<experimentId>` trên **Redis dùng chung**. Lần đọc kế tiếp ở API sẽ:

1. Đọc version → thấy `n+1`.
2. Ghép thành khoá cache mới → chắc chắn **miss**.
3. Đọc `leaderboard_entries` từ Postgres → ghi lại cache dưới khoá mới.

Không cần xoá key cũ (nó tự hết hạn theo TTL). Nếu Redis chết: `incr` trả `null`, `get` version trả `0`, nghĩa là lần đọc kế tiếp phục vụ cache cũ **tối đa** thêm `LEADERBOARD_TOP_CACHE_TTL_SECONDS` — suy giảm có kiểm soát, không mất dữ liệu.

Chi tiết đầy đủ: [cache.md](cache.md).

## 6. Ranh giới của tuyên bố — cố ý không làm

| Thứ | Trạng thái | Lý do |
|---|---|---|
| Database ghi/đọc riêng | **Không** | Read model chỉ có 1 bảng, chưa có vấn đề tải đọc. Tách DB sẽ kéo theo replication lag và mất tính transactional mà chưa đổi lại được gì |
| Command/Query bus (`@nestjs/cqrs`) | **Không** | Sẽ thành lễ nghi rỗng: hệ thống có đúng 1 read model. Chi phí đọc hiểu code tăng, giá trị kiến trúc bằng 0 |
| Event Sourcing | **Không** | Xem `decisions.md`. Provenance đã có sẵn qua các dòng quan hệ immutable (`candidates` + `strategies.version` + `backtest_runs`) — đủ tính tái lập mà đề bài yêu cầu |
| Eventual consistency giữa write/read | **Có, trong phạm vi hẹp** | Cửa sổ không nhất quán = khoảng thời gian giữa lúc rebuild commit và lúc `INCR` chạy xong (vài mili-giây), cộng TTL cache nếu Redis chết |

## 7. Vị trí đánh dấu trong code

Hai comment neo tài liệu này vào code thật:

- `LeaderboardService.rebuildForExperiment()` — *"CQRS write side: materialises the read model"*
- `StrategySearchService.getTop()` — *"CQRS read side: serves the read model, cache-aside"*
