# Crawler Module Specification

## 1. Purpose

The Crawler is a **Python worker** that collects cryptocurrency news from external sources and produces validated, normalized `NewsItem` objects for the backend.

It is a supporting worker of the **NestJS Modular Monolith**, not a microservice or business-logic service.

---

## 2. Architectural Role

**CRITICAL**

* Crawler runs as a separate Python process because of its specialized scraping/runtime requirements.
* It does not own application business logic.
* It does not directly own PostgreSQL persistence.
* It does not implement sentiment analysis, trading logic, strategy logic, or user-facing APIs.
* The NestJS backend remains the central application/business boundary.

```text
External News Sources
        |
        v
 Crawler Worker
        |
        v
Normalized NewsItem
        |
        v
NestJS Modular Monolith
```

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
7. Validation.
8. Discovery and item-level deduplication.
9. Returning/publishing valid `NewsItem` objects.

It is not responsible for persistence or downstream business decisions.

---

## 4. Pipeline

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

The exact orchestration may vary by source, but these responsibilities should remain separated.

---

## 5. Fetcher / Parser Separation

**CRITICAL**

Fetching and parsing are separate responsibilities.

* Fetchers perform network I/O.
* Parsers interpret already-fetched data.
* Parsers must not make HTTP requests.

Expected implementations include:

```text
HTTPFetcher  → HTMLParser
RSSFetcher   → RSSParser
APIFetcher   → APIParser
```

A library that internally combines fetching and parsing does not change this architectural boundary.

**MEDIUM**

Preferred libraries:

* `httpx` for HTTP.
* `feedparser` for RSS.
* `BeautifulSoup` for HTML.

Existing repository dependencies take precedence.

---

## 6. Source Configuration

**HIGH**

Source-specific behavior should be configuration-driven where practical.

Configuration may contain:

* source ID
* source type
* URLs/feed endpoints
* selectors
* field mappings
* discovery rules

YAML is preferred for source configuration.

**MEDIUM**

Do not turn configuration into a generic scraping/rule engine. Add configuration only where it reduces source-specific code.

---

## 7. HTML Parsing

**HIGH**

`HTMLParser` should:

* parse already-fetched HTML;
* support configured selectors;
* support article/listing discovery;
* extract article fields;
* use JSON-LD as a fallback when useful.

It must remain independent of network access.

---

## 8. Normalization

**CRITICAL**

`NewsNormalizer` must produce a canonical internal representation.

It should include:

* canonical URL;
* deterministic ID;
* normalized timestamps;
* normalized text/fields.

The article ID should be deterministic, using a stable SHA-256-based mechanism.

`crawledAt` must use UTC and a consistent ISO-8601 representation.

**HIGH**

Downstream components must operate on the normalized representation rather than source-specific formats.

---

## 9. Cryptocurrency Entity Extraction

**HIGH**

Initial cryptocurrency entity extraction is intentionally lightweight and deterministic.

Use rule-based ticker/name matching, including regex with appropriate word-boundary handling.

Example:

```text
BTC
Bitcoin
ETH
Ethereum
```

**MEDIUM**

Do not introduce an NLP/ML entity-recognition system unless actual requirements justify it.

---

## 10. Validation

**CRITICAL**

Invalid news must not be emitted as valid `NewsItem`.

Initial validation rules:

* `title` length >= 5 characters.
* `content` length >= 40 characters.
* `url` starts with `http://` or `https://`.
* `publishedAt` is present.

Additional rules may be added when required by real source behavior.

---

## 11. Deduplication

**CRITICAL**

Deduplication occurs at two stages.

### Stage 1 — Discovery

Duplicate article URLs must be removed before unnecessary fetching.

### Stage 2 — Normalized Items

Duplicate articles must be removed using stable identity information, preferably:

```text
(item.id, item.sourceId)
```

or canonical URL where appropriate.

**MEDIUM**

Do not rely solely on title similarity for deduplication.

---

## 12. Error Handling

**HIGH**

External source failures must not unnecessarily terminate the entire crawling process.

Handle failures such as:

* timeout;
* HTTP errors;
* malformed RSS;
* malformed HTML;
* missing selectors;
* invalid article data.

Failures must be observable through logging.

**HIGH**

Do not use broad exception handling that silently hides failures.

**MEDIUM**

Prefer continuing with other sources/items when one source or item fails.

---

## 13. Data Contract

**CRITICAL**

The Crawler must expose a stable normalized contract to downstream consumers.

`Pydantic` is preferred for Python-side validation and serialization.

The contract should contain the fields required by the existing architecture, including source identity, article identity, title, content, URL, publication time, and crawl time.

Do not expose source-specific parser structures to downstream modules.

---

## 14. Testing

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
* important error cases.

**HIGH**

Parser tests should use static fixtures and must not require live websites.

**MEDIUM**

Maintain focused end-to-end tests for the main discovery-to-normalization pipeline.

---

## 15. Preferred Technologies

**HIGH**

Preferred implementation technologies:

* Python
* Pydantic
* pytest
* `httpx`
* BeautifulSoup
* `feedparser`
* YAML configuration

These are preferences, not reasons to introduce unnecessary dependencies.

**LOW**

Alternative libraries are acceptable when they provide a clear benefit or are already used by the repository.

---

## 16. Non-Goals

**CRITICAL**

Do not implement:

* sentiment analysis;
* trading decisions;
* strategy logic;
* user-facing APIs;
* database ownership;
* general-purpose NLP;
* browser automation unless explicitly required by a source;
* a general-purpose scraping framework.

---

## 17. Decision Summary

| Decision                                                   | Level        |
| ---------------------------------------------------------- | ------------ |
| Crawler is a Python worker supporting the Modular Monolith | **CRITICAL** |
| Do not treat Crawler as a microservice/business service    | **CRITICAL** |
| Separate fetching from parsing                             | **CRITICAL** |
| Normalize before downstream processing                     | **CRITICAL** |
| Validate before emitting news                              | **CRITICAL** |
| Deduplicate at discovery and item level                    | **CRITICAL** |
| Deterministic SHA-256-based article ID                     | **CRITICAL** |
| UTC ISO-8601 `crawledAt`                                   | **HIGH**     |
| Configuration-driven source behavior                       | **HIGH**     |
| Rule-based crypto entity extraction initially              | **HIGH**     |
| Pydantic for contracts                                     | **HIGH**     |
| pytest for testing                                         | **HIGH**     |
| `httpx` / BeautifulSoup / feedparser                       | **MEDIUM**   |
| YAML for source configuration                              | **MEDIUM**   |
| Avoid speculative/general-purpose abstractions             | **MEDIUM**   |
| Alternative libraries when clearly justified               | **LOW**      |
