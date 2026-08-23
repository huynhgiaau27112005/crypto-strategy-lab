# decisions.md — Architecture Decision Records (ADRs)

This document records the foundational architectural decisions made for the **Crypto Strategy Lab** platform.

---

## ADR Index

| ADR ID            | Decision Title                                                         | Status             | Primary Driver                              |
| ----------------- | ---------------------------------------------------------------------- | ------------------ | ------------------------------------------- |
| **ADR-001** | Selection of NestJS Modular Monolith Architecture over Microservices   | **Accepted** | Maintainability, Simplicity, Time-to-Market |
| **ADR-002** | Auxiliary Python Worker Processes for Web Scraping & ML Sentiment      | **Accepted** | Runtime Isolation, Ecosystem Fit            |
| **ADR-003** | WebSocket Protocol for Sub-102ms Real-Time Market Streaming & UI Push  | **Accepted** | Realtime Latency, Resource Efficiency       |
| **ADR-004** | Plugin Architecture & Registry Pattern for Strategy Engine             | **Accepted** | Modifiability, Extensibility                |
| **ADR-005** | Decoupled News Crawler & Local FinBERT Sentiment Pipeline              | **Accepted** | Fault Isolation, Loose Coupling             |
| **ADR-006** | Task Queue & Worker Pool for Parallel Backtesting & Strategy Discovery | **Accepted** | Scalability, Performance                    |

---

## ADR-001: Selection of NestJS Modular Monolith Architecture over Microservices

### Context & Problem Statement

The Crypto Strategy Lab system requires a feature-rich backend to orchestrate market data ingestion, technical indicators, plugin strategies, backtesting, discovery search loops, leaderboard rankings, news ingestion, and sentiment analysis.

The development project is constrained by a small team (4 developers), an 8-week timeline, an MVP scale target (1 server + 1 database), while needing a path to scale to 50,000 users and 100,000 backtests/day. The architectural challenge was deciding between a distributed Microservices architecture and a Modular Monolith.

### Decision

We intentionally choose a **NestJS Modular Monolith** architecture for the primary backend application.

All core functional areas (`MarketModule`, `StrategyModule`, `BacktestModule`, `StrategySearchModule`, `LeaderboardModule`, `NewsOrchestrationModule`, `AuthModule`) are structured as logically isolated NestJS modules residing within a single unified codebase and executed within a single application process.

### Rationale

1. **Low Operational Overhead:** Microservices introduce distributed tracing, service discovery, network latency, distributed transactions (Sagas), and container orchestration (Kubernetes) overhead that would overwhelm project scope and timeline.
2. **Strict Logical Boundaries without Network Latency:** NestJS provides enterprise-grade dependency injection, module encapsulation, and clean exported interfaces, giving the maintainability and clean boundaries of microservices without serialization overhead.
3. **Atomic Transactions:** Business operations (such as saving an `Experiment` and its 178 `Trade` items) execute in a simple local database transaction instead of two-phase commits.
4. **Simplified Developer Experience:** Developers can run, debug, and test the entire backend locally with a single command (`npm run start:dev`) and single database container.
5. **Clear Extraction Path:** Should specific modules experience disproportionate load at scale, clean module interfaces make future extraction into standalone services straightforward.

### Consequences

- **Positive:** Rapid development velocity, trivial deployments, zero inter-service network latency, unified logging.
- **Negative:** Shared process memory; a critical uncaught exception could restart the entire backend process (mitigated by Node.js process managers like PM2 and NestJS exception filters).

---

## ADR-002: Auxiliary Python Worker Processes for Web Scraping & ML Sentiment

### Context & Problem Statement

The platform requires advanced web scraping (crawling multi-format news with self-healing HTML parsing) and Machine Learning (fine-tuned financial sentiment analysis via BERT/FinBERT).

Implementing these features natively in Node.js/TypeScript has significant drawbacks: Node.js lacks native PyTorch/Hugging Face support, and running heavy ML model inference inside the main Node.js event loop would block asynchronous I/O and degrade real-time chart streaming.

### Decision

We deploy **two specialized Python Auxiliary Workers** (`Crawler Worker` and `Sentiment Worker`) running as dedicated processes outside the NestJS application process.

These workers act strictly as supporting computational units for the Modular Monolith and do **not** represent a transition to microservices.

```text
NestJS Monolith (Orchestration)
       │
       ├─► HTTP / Redis Queue ─► Python Crawler Worker (Scrapy / Asyncio)
       │
       └─► HTTP / Redis Queue ─► Python Sentiment Worker (FinBERT / PyTorch)
```

### Rationale

1. **Python Ecosystem Dominance:** Python provides industry-standard libraries for ML (`transformers`, `torch`, `FinBERT`) and scraping (`playwright`, `scrapy`, `beautifulsoup4`).
2. **Event Loop Isolation:** Heavy CPU-bound matrix multiplication for BERT inference runs in a separate Python process, preserving the Node.js event loop for sub-102ms WebSocket delivery.
3. **Targeted Dependency Boundaries:** Heavy ML runtime dependencies (e.g., CUDA, PyTorch packages >2GB) are isolated to the Python container without bloating the Node.js backend.

### Consequences

- **Positive:** Optimal technology for each domain; resilient process isolation; high-throughput scraping and ML inference.
- **Negative:** Requires managing a multi-language development environment (Node.js + Python).

---

## ADR-003: WebSocket Protocol for Sub-102ms Real-Time Market Streaming & UI Push

### Context & Problem Statement

The platform displays a 4-chart real-time multi-timeframe dashboard (1m, 5m, 15m, 1h) and a live Top-K Leaderboard. The system must achieve sub-102ms latency from Binance tick arrival to client chart display.

Using traditional HTTP polling for 4 charts across thousands of users would create extreme server load, connection overhead, and unacceptable latency.

### Decision

We use a persistent **WebSocket connection** (`@nestjs/websockets`) between the NestJS backend and the Frontend browser client, as well as between the backend's `BinanceAdapter` and Binance's streaming endpoints.

### Rationale

1. **Low Latency & High Throughput:** Eliminates HTTP header overhead per tick, delivering streaming updates in <102ms.
2. **Bi-directional Push:** The backend pushes candle updates and live `LeaderboardUpdated` events instantly without clients needing to poll.
3. **Bandwidth Efficiency:** Real-time ticks send lightweight delta payloads rather than full HTTP responses.

### Consequences

- **Positive:** Meets strict real-time NFRs; smooth 4-chart rendering; instant Leaderboard promotions.
- **Negative:** Requires WebSocket connection state management, heartbeat ping/pong, and graceful reconnection handling on the frontend.

---

## ADR-004: Plugin Architecture & Registry Pattern for Strategy Engine

### Context & Problem Statement

The Strategy Engine must support an evolving library of technical indicators (MA, RSI, Bollinger Bands, Support/Resistance) and composite combinations. The system must allow developers to introduce new strategies (e.g., `MACDStrategy`, `SMCStrategy`) without modifying core engine classes or modifying existing modules (Modifiability Driver).

Hardcoded branching logic (`if MA && RSI ... else if ...`) is a strictly forbidden anti-pattern.

### Decision

We implement a **Plugin Architecture** using the **Strategy Pattern** combined with a centralized **Strategy Registry**.

All strategy implementations must adhere to the standard interface:

```typescript
interface Strategy {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  analyze(context: MarketContext): Signal; // returns BUY | SELL | HOLD
}
```

Strategies register dynamically via `StrategyRegistry.register(StrategyClass)`.

### Rationale

1. **Open/Closed Principle:** New strategies can be added by implementing the interface and registering, with zero modifications to existing code.
2. **Context Abstraction (Security):** Strategies receive an immutable `MarketContext` containing OHLCV and precomputed indicator series. They cannot access PostgreSQL directly, preventing direct DB access anti-patterns and SQL injection vulnerabilities.
3. **Standardized Signal Output:** Standardizing output to `BUY`, `SELL`, or `HOLD` enables uniform composition in `CompositeStrategy` (Majority Vote and Weighted Score) and seamless consumption by the Backtesting Engine.

### Consequences

- **Positive:** Maximum extensibility; clean unit testability of individual strategy algorithms in isolation.
- **Negative:** Requires precomputing or lazily resolving indicator values within the `MarketContext` before strategy invocation.

---

## ADR-005: Decoupled News Crawler & Local FinBERT Sentiment Pipeline

### Context & Problem Statement

The news-driven trading module requires scraping articles, normalizing metadata, evaluating sentiment via FinBERT/LLMs, and executing `NewsSentimentStrategy`.

Coupling the crawler directly to the ML model (e.g., crawler invoking BERT directly) would violate single responsibility, cause crawler crashes if the ML model hangs, and prevent independent tuning of crawling schedules and ML batching.

### Decision

We strictly decouple the News Crawler from the Sentiment Pipeline.

1. The **Python Crawler Worker** only scrapes and normalizes news into the canonical `NewsItem` entity.
2. NestJS receives `NewsItem`, persists it to PostgreSQL, and emits an in-process `NewsCollected` event.
3. The **Python Sentiment Worker** processes `NewsItem` independently, running a local **FinBERT** model with an **OpenRouter LLM Adapter** fallback, producing a `SentimentResult`.
4. NestJS aggregates sentiment into a 1-hour rolling score consumed by `NewsSentimentStrategy`.

```text
[ Sources ] ──► Crawler Worker ──► PostgreSQL (NewsItem) ──► In-Process Event
                                                               │
[ Strategy ] ◄── PostgreSQL (SentimentResult) ◄── Sentiment Worker ◄┘
```

### Rationale

1. **Failure Isolation:** A network failure on a news source does not impact sentiment scoring, chart rendering, or the trading engine.
2. **Independent Scaling:** Crawling can run on periodic intervals (1m–5m), while sentiment analysis can batch articles efficiently for GPU inference.
3. **Extensibility:** The sentiment model (e.g., upgrading FinBERT or switching to OpenRouter LLM) can change without touching the crawler.

### Consequences

- **Positive:** Robust fault isolation; clean separation of scraping concerns from ML inference.
- **Negative:** Asynchronous two-step pipeline; sentiment scores are available shortly after article ingestion rather than inline.

---

## ADR-006: Task Queue & Worker Pool for Parallel Backtesting & Strategy Discovery

### Context & Problem Statement

Sequential backtesting requires ~2 seconds per candidate. Running a Discovery Loop of 1,000 to 100,000 candidate combinations sequentially would take hours or days (20,000 seconds for 10,000 candidates).

The system must scale backtesting throughput without turning the backend into a complex microservices architecture.

### Decision

We use a **Task Queue (BullMQ / Redis)** paired with a **Parallel Worker Pool** (Node.js Worker Threads in MVP, scalable to independent worker processes).

```text
StrategySearchModule ──► Enqueue Candidates ──► Redis Job Queue (BullMQ)
                                                      │
                       ┌──────────────────────────────┼──────────────────────────────┐
                       ▼                              ▼                              ▼
                 Backtest Worker 1              Backtest Worker 2              Backtest Worker N
              (Simulate & Evaluate)          (Simulate & Evaluate)          (Simulate & Evaluate)
                       │                              │                              │
                       └──────────────────────────────┼──────────────────────────────┘
                                                      ▼
                                       Emit StrategyEvaluatedEvent
                                                      ▼
                                              LeaderboardModule
```

### Rationale

1. **Parallel Speedup:** Distributes simulation jobs across all available CPU cores, reducing 1,000 backtests from ~2,000s to under 250s on an 8-core machine.
2. **Fault Tolerance:** If a worker crashes while evaluating a candidate, the job queue automatically retries the task without crashing the Discovery Loop.
3. **Controlled Concurrency:** Prevents CPU starvation on the main NestJS process, ensuring real-time WebSocket chart streaming remains uninterrupted.

### Consequences

- **Positive:** High-throughput backtesting; reliable asynchronous job management; smooth discovery loop operation.
- **Negative:** Requires Redis infrastructure; results are collected asynchronously.
