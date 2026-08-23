# Crawler Module Specification

## 1. Purpose

The Crawler is a **Python worker** that collects cryptocurrency news from external sources and produces validated, normalized `NewsItem` objects for the backend.

It is a supporting worker of the **NestJS Modular Monolith**, not an independent business service or microservice.

---

## 2. Architectural Role

**CRITICAL**

- The Crawler runs as a separate Python process because of its specialized scraping/runtime requirements.
- It is part of the overall application architecture, but is not a NestJS module.
- It does not own application business logic.
- It does not directly own PostgreSQL persistence.
- It does not implement sentiment analysis.
- It does not implement trading or strategy logic.
- It does not expose user-facing APIs.
- The NestJS Modular Monolith remains the central application/business boundary.

```text
External News Sources
        |
        v
  Python Crawler
        |
        v
Normalized NewsItem
        |
        v
NestJS Modular Monolith
````

---

## 3. Responsibilities

**CRITICAL**

The Crawler is responsible for:

1. Source configuration.
2. URL/article discovery.
3. Fetching external content.
4. Parsing source-specific formats.
5. Normalization.
6. Cryptocurrency entity extraction.
7. Related-coin tagging.
8. Validation.
9. Discovery deduplication.
10. Item-level deduplication.
11. Returning/publishing valid `NewsItem` objects.

The Crawler is not responsible for persistence or downstream business decisions.

---

## 4. Logical Pipeline

**HIGH**

The logical pipeline is:

```text
Configuration
    ↓
NewsCrawler
    ↓
Fetcher
    ↓
Parser
    ↓
NewsNormalizer
    ↓
CoinEntityExtractor
    ↓
NewsValidator
    ↓
Deduplication
    ↓
NewsItem
```

The exact orchestration may vary by source, but responsibilities must remain separated.

**HIGH**

Coin extraction should operate on the normalized article representation rather than source-specific parser structures.

---

# 5. Fetcher / Parser Separation

## 5.1 Responsibility

**CRITICAL**

Fetching and parsing are separate responsibilities.

* Fetchers perform network I/O.
* Parsers interpret already-fetched data.
* Parsers must not make HTTP requests.

Expected implementations:

```text
HTTPFetcher  → HTMLParser
RSSFetcher   → RSSParser
APIFetcher   → APIParser
```

A library that internally combines fetching and parsing does not change this architectural boundary.

## 5.2 Preferred Libraries

**MEDIUM**

Preferred libraries:

* `httpx` for HTTP.
* `feedparser` for RSS.
* `BeautifulSoup` for HTML.

Existing repository dependencies take precedence.

Do not add dependencies without a clear benefit.

---

# 6. Source Configuration

**HIGH**

Source-specific behavior should be configuration-driven where practical.

Configuration may contain:

* source ID;
* source type;
* URLs/feed endpoints;
* selectors;
* field mappings;
* discovery rules;
* enabled/disabled state.

YAML is preferred for source configuration.

**MEDIUM**

Do not turn configuration into a generic scraping/rule engine.

Add configuration only where it reduces source-specific code and maintenance.

---

# 7. HTML Parsing

**HIGH**

`HTMLParser` should:

* parse already-fetched HTML;
* support configured selectors;
* support article/listing discovery;
* extract article fields;
* use JSON-LD as a fallback when useful.

It must remain independent of network access.

**HIGH**

HTML parsers must tolerate minor source-specific formatting differences where practical.

Do not build browser automation unless a source genuinely requires it.

---

# 8. RSS Parsing

**HIGH**

RSS sources should be preferred when a suitable feed exists.

`RSSParser` should extract, where available:

* article URL;
* title;
* publication time;
* description/summary;
* source metadata;
* feed metadata.

**MEDIUM**

If RSS provides only a summary and the full article is required, the crawler may discover the article URL and use the HTML pipeline to retrieve additional content.

The RSS parser must not perform HTTP requests itself.

---

# 9. API Parsing

**HIGH**

API sources may be used when a suitable free API provides structured news data.

The API adapter/parser must normalize provider-specific responses into the internal `NewsItem` representation.

Provider-specific response structures must not leak into downstream modules.

---

# 10. Normalization

**CRITICAL**

`NewsNormalizer` must produce a canonical internal representation.

It should normalize:

* canonical URL;
* deterministic article ID;
* title;
* content;
* publication timestamp;
* crawl timestamp;
* source identity;
* related coins;
* other required metadata.

The article ID must be deterministic, using a stable SHA-256-based mechanism.

`crawledAt` must use UTC and a consistent ISO-8601 representation.

**HIGH**

Downstream components must operate on the normalized representation rather than source-specific formats.

---

# 11. Related Coin / Cryptocurrency Entity Extraction

## 11.1 Purpose

**HIGH**

The Crawler must identify cryptocurrencies that are relevant to each news article and expose them as normalized `relatedCoins`.

Example:

```text
Title:
Bitcoin ETF inflows continue to rise

Content:
Bitcoin and Ethereum remained the strongest assets...
```

Expected result:

```json
{
  "relatedCoins": ["BTC", "ETH"]
}
```

`relatedCoins` represents normalized cryptocurrency identifiers, not arbitrary source tags.

---

## 11.2 Initial Extraction Strategy

**HIGH**

The initial implementation uses deterministic, rule-based extraction.

Do not introduce an ML/NLP entity-recognition model for this purpose unless actual requirements justify it.

The extractor should recognize:

* ticker symbols;
* canonical cryptocurrency names;
* configured aliases.

Examples:

```text
BTC       → BTC
Bitcoin   → BTC

ETH       → ETH
Ethereum  → ETH

SOL       → SOL
Solana    → SOL
```

---

## 11.3 Canonical Coin Dictionary

**CRITICAL**

Coin extraction must use a canonical mapping/dictionary.

Conceptually:

```text
alias       canonical_symbol
--------------------------------
Bitcoin     BTC
BTC         BTC
Ethereum    ETH
ETH         ETH
Solana      SOL
SOL         SOL
```

The dictionary must be versionable/configurable.

**HIGH**

Do not hard-code a large alias list throughout parser/extractor logic.

Keep the mapping in a dedicated configuration/data structure.

---

## 11.4 Matching Rules

**CRITICAL**

Ticker matching must avoid obvious substring false positives.

For example:

```text
SOL
```

must not automatically match arbitrary words containing:

```text
sol...
```

Use appropriate token/word-boundary matching.

**HIGH**

Full-name matching should be case-insensitive where appropriate.

**HIGH**

The extractor should process at least:

```text
title + content
```

rather than relying only on title.

---

## 11.5 Ambiguous Symbols

**HIGH**

Some ticker symbols can overlap with common English words, abbreviations, or unrelated terms.

The extractor must avoid adding a coin solely because of an ambiguous token when the context is insufficient.

**MEDIUM**

For ambiguous symbols, prefer stronger evidence such as:

* explicit cryptocurrency context;
* co-occurrence with known crypto terminology;
* canonical coin name;
* configured source metadata.

Do not introduce a complex NLP classifier solely to resolve ambiguity in the initial implementation.

---

## 11.6 Source Tags vs Extracted Coins

**HIGH**

If a source provides its own tags/categories, they may be used as additional evidence.

However:

> Source-provided tags must not automatically become the canonical `relatedCoins` field.

They should be normalized through the same coin mapping process.

**MEDIUM**

The implementation may retain raw source tags separately if they are useful for debugging or future processing.

---

## 11.7 Output

**CRITICAL**

`relatedCoins` must contain canonical identifiers.

Example:

```json
{
  "relatedCoins": ["BTC", "ETH", "SOL"]
}
```

Requirements:

* canonical symbols only;
* no duplicate symbols;
* deterministic ordering;
* empty list when no supported coin is confidently identified.

Do not use arbitrary free-form strings.

---

## 11.8 Extraction Version

**HIGH**

Changes to the coin dictionary or extraction rules can change results.

Therefore the extraction configuration/rule set should have an identifiable version.

For example:

```text
coin_dictionary_version: 1
```

This does not require a full ML model registry.

The purpose is traceability.

---

## 11.9 Non-Goals

**CRITICAL**

Initial coin extraction must not include:

* custom NER model training;
* large NLP pipelines;
* LLM calls for every article;
* semantic similarity models;
* expensive external entity APIs.

The initial requirement is deterministic and inexpensive coin tagging.

---

# 12. Validation

**CRITICAL**

Invalid news must not be emitted as a valid `NewsItem`.

Initial validation rules:

* `title` length >= 5 characters;
* `content` length >= 40 characters;
* `url` starts with `http://` or `https://`;
* `publishedAt` is present.

**HIGH**

`relatedCoins` must contain only valid canonical identifiers from the configured coin dictionary.

Additional validation rules may be added when required by actual source behavior.

---

# 13. Deduplication

**CRITICAL**

Deduplication occurs at two stages.

## Stage 1 — Discovery

Duplicate article URLs must be removed before unnecessary fetching.

## Stage 2 — Normalized Items

Duplicate articles must be removed using stable identity information, preferably:

```text
(item.id, item.sourceId)
```

or canonical URL where appropriate.

**MEDIUM**

Do not rely solely on title similarity for deduplication.

---

# 14. Error Handling

**HIGH**

External source failures must not unnecessarily terminate the entire crawling process.

Handle failures such as:

* timeout;
* HTTP errors;
* malformed RSS;
* malformed HTML;
* missing selectors;
* invalid article data;
* extraction failures.

Failures must be observable through logging.

**HIGH**

Do not use broad exception handling that silently hides failures.

**MEDIUM**

Prefer continuing with other sources/items when one source or item fails.

---

# 15. Data Contract

**CRITICAL**

The Crawler must expose a stable normalized contract to downstream consumers.

`Pydantic` is preferred for Python-side validation and serialization.

The contract should contain the fields required by the existing architecture, including:

* source identity;
* article identity;
* title;
* content;
* canonical URL;
* publication time;
* crawl time;
* `relatedCoins`.

Example:

```json
{
  "id": "sha256...",
  "sourceId": "coindesk",
  "title": "...",
  "content": "...",
  "url": "https://...",
  "publishedAt": "...",
  "crawledAt": "...",
  "relatedCoins": ["BTC", "ETH"]
}
```

Do not expose source-specific parser structures to downstream modules.

---

# 16. Testing

**HIGH**

Use `pytest`.

Tests should cover at minimum:

* source parsing;
* article discovery;
* normalization;
* deterministic IDs;
* validation;
* discovery deduplication;
* item-level deduplication;
* important error cases;
* cryptocurrency extraction.

## 16.1 Coin Extraction Tests

**HIGH**

Tests must include:

* ticker matching;
* full-name matching;
* alias normalization;
* case handling;
* word-boundary behavior;
* duplicate removal;
* deterministic ordering;
* empty result;
* ambiguous ticker cases;
* false-positive cases.

Example:

```text
"Bitcoin and BTC prices rise"
→ ["BTC"]
```

```text
"Ethereum and ETH rally"
→ ["ETH"]
```

```text
"Solana ecosystem grows"
→ ["SOL"]
```

The test suite should explicitly contain cases where ticker substring matching would produce a false positive.

**HIGH**

Parser tests must use static fixtures and must not require live websites.

**MEDIUM**

Maintain focused end-to-end tests for the main discovery-to-normalization pipeline.

---

# 17. Preferred Technologies

**HIGH**

Preferred implementation technologies:

* Python;
* Pydantic;
* pytest;
* `httpx`;
* BeautifulSoup;
* `feedparser`;
* YAML configuration.

**MEDIUM**

A lightweight configuration/data file may be used for the cryptocurrency alias dictionary.

These are preferences, not reasons to introduce unnecessary dependencies.

**LOW**

Alternative libraries are acceptable when they provide a clear benefit or are already used by the repository.

---

# 18. Non-Goals

**CRITICAL**

Do not implement:

* sentiment analysis;
* trading decisions;
* strategy logic;
* user-facing APIs;
* database ownership;
* general-purpose NLP;
* ML-based coin NER;
* LLM-based coin extraction for every article;
* browser automation unless explicitly required by a source;
* a general-purpose scraping framework.

---

# 19. Recommended News Sources

This section defines recommended candidate sources for the Crawler under the project's zero/near-zero budget constraint.

These are implementation recommendations, not hard architectural requirements.

The crawler architecture must remain source-agnostic so that a source can be replaced without changing the core pipeline.

## 19.1 Source Selection Priority

**HIGH**

Prefer sources in the following order:

```text
RSS
 ↓
HTML
 ↓
Free API
```

Rationale:

1. RSS is generally the simplest and cheapest source to operate.
2. HTML crawling avoids API subscription costs but requires more source-specific maintenance.
3. APIs should only be used when a genuinely usable free tier exists and its limits are sufficient for the project.

**CRITICAL**

Do not introduce a paid subscription solely to support the initial crawler implementation.

**HIGH**

Do not build the crawler around a single news source. The architecture must support multiple sources.

---

## 19.2 RSS Sources

RSS should be the preferred source type when a suitable feed is available.

### Recommended candidates

| Source           | Type | Cost | Priority | Notes                              |
| ---------------- | ---- | ---: | -------: | ---------------------------------- |
| Cointelegraph    | RSS  | Free |     High | Major crypto-news source           |
| CoinDesk         | RSS  | Free |     High | Major crypto/financial news source |
| Decrypt          | RSS  | Free |     High | Crypto-focused news                |
| Bitcoin.com News | RSS  | Free |   Medium | Crypto/blockchain news             |
| CryptoSlate      | RSS  | Free |   Medium | Crypto-focused news                |
| NewsBTC          | RSS  | Free |   Medium | Bitcoin/crypto market news         |

**HIGH**

Exact feed URLs must be verified before implementation.

Do not assume that a website's RSS endpoint remains available or unchanged.

**MEDIUM**

Start with a small number of stable RSS sources rather than implementing every available source.

---

## 19.3 HTML Sources

HTML crawling may be used when:

* no suitable RSS feed exists;
* RSS does not expose sufficient article information;
* the source provides useful additional coverage.

### Recommended candidates

| Source           | Type | Cost |   Priority | Notes                        |
| ---------------- | ---- | ---: | ---------: | ---------------------------- |
| CoinDesk         | HTML | Free |     Medium | Can supplement RSS           |
| Cointelegraph    | HTML | Free |     Medium | Source-specific HTML parsing |
| Decrypt          | HTML | Free |     Medium | Crypto-focused               |
| Bitcoin.com News | HTML | Free | Low/Medium | Additional coverage          |
| CryptoSlate      | HTML | Free | Low/Medium | Additional coverage          |

**HIGH**

HTML crawling must respect publicly accessible pages, robots.txt, rate limits, and terms of use.

**CRITICAL**

Do not implement aggressive crawling.

The project requires a small news-ingestion workload, not large-scale web scraping.

**HIGH**

Use conservative request rates, timeouts, retry limits, and caching where appropriate.

**MEDIUM**

Prefer configuration-driven selectors so source-specific changes can be fixed through configuration where practical.

---

## 19.4 API Sources

APIs may be used when they provide structured news data and a genuinely usable free tier.

### Candidate APIs

| API             |                Free Availability |   Priority | Notes                                      |
| --------------- | -------------------------------: | ---------: | ------------------------------------------ |
| GNews           |                        Free tier |     Medium | General news; crypto queries may be useful |
| NewsData.io     |                        Free tier |     Medium | Limited quota                              |
| Mediastack      |                        Free tier | Low/Medium | Verify current limitations                 |
| CryptoPanic API | Depends on current endpoint/plan |     Medium | Crypto-specific                            |

**CRITICAL**

Before implementation, verify the current:

* request limits;
* authentication requirements;
* historical access;
* cryptocurrency coverage;
* rate limits;
* usage restrictions.

Do not assume that a previously free API is still free.

**HIGH**

API quota and rate-limit behavior must be explicit.

**HIGH**

API keys must use environment variables/secrets and must never be committed to Git.

---

## 19.5 Recommended Initial Source Set

**HIGH**

Keep the initial number of sources small.

Recommended starting point:

```text
RSS:
    Cointelegraph
    CoinDesk
    Decrypt

HTML:
    1 additional source only if RSS coverage is insufficient

API:
    0 or 1 verified free API
```

The objective is to demonstrate:

* multiple source types;
* source-independent architecture;
* discovery;
* parsing;
* normalization;
* related-coin extraction;
* validation;
* deduplication;

rather than maximizing source count.

---

## 19.6 Source Selection Rules

**CRITICAL**

A source should only be added when it provides meaningful project value.

**HIGH**

Prefer sources that:

* are publicly accessible;
* provide stable article URLs;
* expose sufficient title/content/date information;
* have predictable structure;
* have a usable RSS feed or documented API;
* can be accessed within the free-budget constraint.

**MEDIUM**

Prefer sources requiring minimal custom parser code.

**LOW**

Prefer high-volume sources only when that volume is useful for the project's actual workload.

---

## 19.7 Source Availability Verification

**CRITICAL**

Source availability must be verified at implementation time.

The agent must not blindly implement URLs or API endpoints listed in this document.

Verify:

1. RSS feed is currently accessible.
2. Feed contains usable article metadata.
3. HTML pages are publicly accessible if HTML crawling is used.
4. API has a usable free tier.
5. Rate limits are sufficient.
6. Usage restrictions permit the intended project usage.

If a recommended source is unsuitable, replace it without changing the crawler architecture.

---

## 19.8 Budget Constraint

**CRITICAL**

The initial Crawler implementation must operate with:

```text
Software/API cost: $0
```

or as close to zero as possible.

Do not require:

* paid news APIs;
* paid scraping services;
* paid proxy networks;
* residential proxies;
* commercial browser automation services;
* paid cloud crawling infrastructure.

**HIGH**

The architecture may support paid providers in the future, but the initial implementation must not depend on them.

---

# 20. Source Configuration Example

**MEDIUM**

Sources should be represented through configuration rather than hard-coded throughout the crawler.

```yaml
sources:
  - id: cointelegraph
    type: rss
    enabled: true
    url: <verified-feed-url>

  - id: coindesk
    type: rss
    enabled: true
    url: <verified-feed-url>

  - id: decrypt
    type: rss
    enabled: true
    url: <verified-feed-url>

  - id: example-html-source
    type: html
    enabled: false
    listing_url: <verified-url>
    selectors:
      article_links: <selector>
      title: <selector>
      content: <selector>
      published_at: <selector>
```

The actual URLs and selectors must be verified during implementation.

---

# 21. Decision Summary

| Decision                                                             | Level        |
| -------------------------------------------------------------------- | ------------ |
| Crawler is a Python worker supporting the Modular Monolith           | **CRITICAL** |
| Do not treat Crawler as an independent microservice/business service | **CRITICAL** |
| Separate fetching from parsing                                       | **CRITICAL** |
| Normalize before downstream processing                               | **CRITICAL** |
| Validate before emitting news                                        | **CRITICAL** |
| Deduplicate at discovery and item level                              | **CRITICAL** |
| Deterministic SHA-256-based article ID                               | **CRITICAL** |
| `relatedCoins` is part of the normalized `NewsItem` contract         | **CRITICAL** |
| Use deterministic rule-based coin extraction initially               | **HIGH**     |
| Normalize tickers/names into canonical symbols                       | **CRITICAL** |
| Prevent obvious ticker substring false positives                     | **CRITICAL** |
| Process title + content for coin extraction                          | **HIGH**     |
| Version coin dictionary/extraction rules                             | **HIGH**     |
| Do not use ML/LLM for initial coin extraction                        | **CRITICAL** |
| UTC ISO-8601 `crawledAt`                                             | **HIGH**     |
| Configuration-driven source behavior                                 | **HIGH**     |
| Pydantic for contracts                                               | **HIGH**     |
| pytest for testing                                                   | **HIGH**     |
| RSS preferred over HTML/API                                          | **HIGH**     |
| Free/zero-budget operation                                           | **CRITICAL** |
| No paid API dependency in initial scope                              | **CRITICAL** |
| Verify source availability before implementation                     | **CRITICAL** |
| `httpx` / BeautifulSoup / feedparser                                 | **MEDIUM**   |
| YAML for source configuration                                        | **MEDIUM**   |
| Avoid speculative/general-purpose abstractions                       | **MEDIUM**   |
| Alternative libraries when clearly justified                         | **LOW**      |