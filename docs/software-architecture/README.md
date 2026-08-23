# Crypto Strategy Lab — Architecture Specification (Modular Monolith Version)

## Purpose

This documentation is the authoritative architectural contract for implementing the **Crypto Strategy Lab** platform. It defines the system context, component boundaries, module responsibilities, communication mechanisms, data ownership, and key architectural decisions.

All engineering decisions in this version strictly adhere to the project's agreed architectural decision:

> **The backend is a NestJS Modular Monolith supported by specialized Python auxiliary workers.**

---

## System Overview

**Crypto Strategy Lab** is a cryptocurrency trading strategy research and simulation platform that:

- Ingests real-time and historical market data from Binance via WebSocket and REST API through an extensible adapter pattern.
- Displays up to 4 independent real-time candlestick charts simultaneously with sub-timeframe switching without page reloads.
- Hosts an extensible plugin-based Strategy Engine generating normalized `BUY`, `SELL`, and `HOLD` signals from a unified market context abstraction.
- Composes single strategies into Composite Strategies using Majority Voting or Weighted Score algorithms.
- Simulates historical execution via a deterministic Backtesting Engine accounting for transaction fees, slippage, and OHLC-based Stop Loss / Take Profit.
- Automates candidate strategy generation and ranking through a continuous Discovery Loop with strict stop conditions.
- Collects crypto news articles across RSS, HTML, and API channels using a dedicated Python Crawler Worker with LLM-assisted self-healing scraping.
- Classifies news sentiment via a dedicated Python Sentiment Worker running local FinBERT and LLM adapters (via OpenRouter), feeding quantitative sentiment signals into trading strategies (`NewsSentimentStrategy`).
- Supports natural-language and web-link strategy generation using external LLMs.
- Maintains a real-time Top-K (K=10) Leaderboard pushed live to client dashboards.

*Note:* This platform is a software architecture research and simulation project; it does not execute real-money trades.

---

## Architectural Style: NestJS Modular Monolith + Python Workers

The system avoids distributed microservices complexity in favor of a clean, cohesive **Modular Monolith**:

```text
                                     SYSTEM
                                        │
                    ┌───────────────────┴───────────────────┐
                    │                                       │
                    ▼                                       ▼
        NESTJS MODULAR MONOLITH                       PYTHON WORKERS
  (Single Application & Deployment Unit)      (Auxiliary Specialized Processes)
                    │                                       │
      ┌─────────────┼─────────────┐                   ┌─────┴─────┐
      │             │             │                   │           │
    Market       Strategy      Backtest            Crawler    Sentiment
    Module        Module        Module              Worker      Worker
      │             │             │                 (Python)   (Python)
 Leaderboard      News       Discovery/Search                     │
    Module       Module         Module                         FinBERT /
                                                             LLM Adapters
```

### Core Characteristics:

1. **Single Backend Application:** The NestJS application runs as a single runtime process containing logically isolated modules (`MarketModule`, `StrategyModule`, `BacktestModule`, `LeaderboardModule`, `NewsModule`, `SentimentOrchestrationModule`, `StrategySearchModule`, `AuthModule`).
2. **In-Process Communication:** Modules inside NestJS communicate via explicit exported interfaces, TypeScript Dependency Injection, domain services, and in-process application events (`@nestjs/event-emitter`).
3. **Specialized Auxiliary Workers:** Python workers (`Crawler Worker`, `Sentiment Worker`) run as standalone auxiliary processes specifically to isolate heavy ML runtime dependencies (PyTorch, Transformers, FinBERT) and specialized scraping libraries (Scrapy/Playwright/BeautifulSoup). They communicate with the NestJS monolith via explicit inter-process mechanisms (HTTP REST / Redis Queue).
4. **Unified Persistent Storage:** A single PostgreSQL database is shared across the system, with strict logical table ownership enforced at the module/worker layer. Redis provides hot-data caching and task queue mediation.

---

## Technology Overview

| Layer / Component               | Technology                                          | Architectural Role                                            | Status        |
| ------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- | ------------- |
| **Frontend**              | React or Vue.js SPA                                 | Presentation & Visualization (Display-Only)                   | Preserved     |
| **Backend Core**          | NestJS (TypeScript / Node.js)                       | Core Business Logic, Orchestration, REST & WebSocket Gateways | Authoritative |
| **Auxiliary Worker 1**    | Python 3.10+ (Asyncio / FastAPI / Celery)           | Multi-source News Crawling & Self-Healing Parser              | Authoritative |
| **Auxiliary Worker 2**    | Python 3.10+ (PyTorch / HuggingFace / Transformers) | News Sentiment Analysis (Local FinBERT + OpenRouter LLM)      | Authoritative |
| **Database**              | PostgreSQL 8.x                                      | Relational Persistence (Shared DB, Logical Module Ownership)  | Required      |
| **Cache & Task Queue**    | Redis 7.x                                           | Hot-Read Caching (Leaderboard) & Job Queue (Backtest / Tasks) | Required      |
| **Realtime Push**         | WebSocket (`@nestjs/websockets` / Socket.io)      | Sub-102ms Candle Updates & Live Leaderboard Push to UI        | Required      |
| **External Market Data**  | Binance WebSocket & REST API                        | Inbound Market Price Feeds & Historical K-Lines               | Required      |
| **External LLM Provider** | OpenRouter / Direct LLM APIs                        | Natural Language Prompt Parsing & HTML Self-Healing           | Required      |

---

## Major Architectural Boundaries

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Browser SPA)                            │
│           (Display-Only: 4-Chart Grid, Backtest UI, Discovery, News)        │
└───────────────────────┬─────────────────────────────▲───────────────────────┘
                        │ REST API                    │ WebSocket Push (Ticks/Ranks)
┌───────────────────────▼─────────────────────────────┴───────────────────────┐
│                       NESTJS MODULAR MONOLITH                               │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │               In-Process Event Bus (@nestjs/event-emitter)            │  │
│  └───────┬──────────────┬──────────────┬──────────────┬───────────────┬──┘  │
│          │              │              │              │               │     │
│  ┌───────▼──────┐┌──────▼──────┐┌──────▼──────┐┌──────▼──────┐┌───────▼──┐  │
│  │ MarketModule ││StrategyMod. ││BacktestMod. ││Leaderboard  ││News/Sent │  │
│  │ - BinanceAdp ││- Registry   ││- Engine     ││  Module     ││Orchestr. │  │
│  │ - Normalizer ││- Indicators ││- Evaluator  ││- Top-K Rank ││  Module  │  │
│  │ - Live Relay ││- Composite  ││- Sim Engine ││- Cache Sync ││- Ingest  │  │
│  └───────┬──────┘└─────────────┘└──────┬──────┘└──────┬──────┘└───────┬──┘  │
│          │                             │              │               │     │
│          │                             ▼              │               │     │
│          │                   ┌──────────────────┐     │               │     │
│          │                   │  Task Queue /    │     │               │     │
│          │                   │  BullMQ (Redis)  │     │               │     │
│          │                   └─────────┬────────┘     │               │     │
└──────────┼─────────────────────────────┼──────────────┼───────────────┼─────┘
           │                             │              │               │
           │                             │ Process      │               │ Process
           │                             │ Boundary     │               │ Boundary
           │                             ▼              │               ▼
           │                   ┌──────────────────┐     │     ┌──────────────────┐
           │                   │ Backtest Worker  │     │     │ Python Workers   │
           │                   │ (Node.js Threads │     │     │ ┌──────────────┐ │
           │                   │  or Worker Proc) │     │     │ │Crawler Worker│ │
           │                   └──────────────────┘     │     │ └──────┬───────┘ │
           │                                            │     │ ┌──────▼───────┐ │
           │                                            │     │ │Sentiment Wkr │ │
           │                                            │     │ │(FinBERT+LLM) │ │
           │                                            │     │ └──────────────┘ │
           │                                            │     └─────────┬────────┘
           │                                            │               │
┌──────────▼────────────────────────────────────────────▼───────────────▼─────┐
│                          PERSISTENT STORAGE                                 │
│  ┌───────────────────────────────────────────┐  ┌────────────────────────┐  │
│  │ PostgreSQL Relational Database                 │  │ Redis In-Memory Cache  │  │
│  │ (Candles, Strategies, Experiments,        │  │ (Top-K Leaderboard,    │  │
│  │  Trades, News, Sentiment)                 │  │  Job Queues, Locks)    │  │
│  └───────────────────────────────────────────┘  └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Index

| Document                    | Primary Focus                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [system.md](system.md)       | System Context, NestJS Monolith boundaries, Python Workers, communication contracts, runtime flows, and failure isolation.                      |
| [modules.md](modules.md)     | Detailed NestJS module specifications, internal interfaces, dependency injection hierarchy, Python worker duties, and anti-pattern protections. |
| [data.md](data.md)           | Data schemas, entity definitions, logical module ownership, transaction boundaries, and caching strategy across PostgreSQL and Redis.           |
| [decisions.md](decisions.md) | Architecture Decision Records (ADRs): Monolith selection, Python worker isolation, WebSocket streaming, Strategy Plugin, and Task Queues.       |

---

## Non-Negotiable Architectural Principles

1. **Logical Module != Deployable Service:** Backend modules exist within a single NestJS codebase and runtime; they are not microservices.
2. **Backend Owns All Business Logic:** The Frontend is strictly a presentation and visualization layer. Indicator calculation, signal resolution, and backtesting simulation happen on the backend.
3. **Strategy Abstraction Layer:** Strategy classes never access the database directly. They receive an immutable `MarketContext` provided by the runtime.
4. **Dynamic Strategy Registration:** Strategies implement the `Strategy` interface and register through `StrategyRegistry.register()`. No hard-coded `if/else` logic is permitted.
5. **Worker Process Isolation:** Python workers operate as isolated processes for ML/crawling tasks and communicate via explicit HTTP/Queue contracts.
6. **Bounded Discovery Loop:** Continuous strategy optimization loops must enforce deterministic stop conditions (iteration limits, time bounds, no-improvement thresholds).
7. **Immutable Strategy Versioning:** Strategy definitions are version-controlled and immutable upon creation, guaranteeing deterministic reproducibility of historical backtests.
8. **Decoupled News & Sentiment Pipeline:** The Crawler Worker and Sentiment Worker are decoupled via explicit intermediate contracts and events.
