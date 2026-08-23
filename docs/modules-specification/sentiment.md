# Sentiment Module Specification

## 1. Purpose

The Sentiment module is a **Python worker** that performs sentiment inference on normalized cryptocurrency news and returns a stable `SentimentResult`.

It supports the **NestJS Modular Monolith** and must remain independent from trading/business logic.

```text
Crawler Worker
      |
      v
Normalized NewsItem
      |
      v
Sentiment Worker
      |
      +── Local Model
      |
      +── LLM Provider
      |
      v
SentimentResult
      |
      v
NestJS Modular Monolith
```

---

## 2. Architectural Role

**CRITICAL**

* Sentiment runs as a separate Python worker.
* It is not a NestJS microservice.
* It is not a trading-strategy component.
* It does not own application business logic.
* It does not own PostgreSQL persistence.
* It does not collect news.
* It does not make trading decisions.

The NestJS Modular Monolith remains responsible for application/business orchestration.

---

## 3. Project Constraint

**CRITICAL**

The project has a short development timeline.

Do **not** build a traditional supervised ML training pipeline as part of the initial implementation.

The project does not have sufficient time to:

```text
Collect large dataset
    ↓
Define annotation policy
    ↓
Label data
    ↓
Validate labels
    ↓
Train custom model
    ↓
Tune model
    ↓
Deploy custom model
```

The initial implementation therefore uses **pre-trained models and/or LLM inference**.

This is a project-scope decision, not a claim that traditional ML is unsuitable for sentiment analysis.

---

## 4. Inference Architecture

**CRITICAL**

Inference must be hidden behind a stable abstraction.

Conceptually:

```text
SentimentEngine
    |
    +── FinBERTLocalProvider
    |
    +── OpenRouterProvider
```

The rest of the application must consume `SentimentResult`, not provider-specific responses.

**HIGH**

Adding or replacing an inference provider must not require changes to the Crawler or NestJS business logic.

---

## 5. Initial Inference Strategy

**HIGH**

The initial implementation should prioritize:

1. Local FinBERT for financial sentiment.
2. OpenRouter for LLM-based inference when contextual reasoning is useful.

The exact runtime strategy may be:

```text
NewsItem
   ↓
Configured Sentiment Provider
   ↓
SentimentResult
```

or, if explicitly configured:

```text
Primary Provider
      ↓ failure
Fallback Provider
```

**MEDIUM**

Do not run multiple models for every article unless there is a concrete project requirement. Avoid unnecessary inference cost and complexity.

---

## 6. FinBERT

**HIGH**

FinBERT is the initial local financial-sentiment baseline.

The implementation should use a pre-trained FinBERT checkpoint rather than training a new model.

The model must be loaded once and reused for multiple inference requests.

**CRITICAL**

The exact FinBERT model/checkpoint identifier must be recorded.

Do not store only:

```text
"FinBERT"
```

Record the actual model identity, for example:

```text
provider: local
model_name: <exact Hugging Face model/checkpoint>
model_version: <revision/commit/hash when available>
```

The exact identifier must come from the actual configured model, not from an assumed name.

---

## 7. OpenRouter

**HIGH**

OpenRouter may be used as the external LLM provider.

The OpenRouter integration must be isolated behind an adapter/provider.

The rest of the system must not depend on OpenRouter-specific request/response formats.

**CRITICAL**

Every OpenRouter sentiment result must record the exact model identifier used.

Do not store only:

```text
provider: OpenRouter
```

The result must identify the actual model, for example:

```text
provider: openrouter
model_name: <exact OpenRouter model identifier>
```

If the provider/model is changed, the new model identity must be distinguishable from previous results.

**HIGH**

The API key must come from environment configuration or an approved secret mechanism.

Never hard-code credentials in source code or model configuration.

---

## 8. Model Versioning / MLOps

This is a **CRITICAL architectural requirement**.

Sentiment results are model-dependent and must be reproducible/auditable.

Every persisted or externally returned sentiment result must identify the exact inference configuration that produced it.

At minimum, record:

```text
SentimentResult
├── label
├── score
├── provider
├── model_name
├── model_version
└── inference metadata
```

The exact fields may follow the existing project data model.

### Required model identity

For every inference:

```text
provider
model_name
model_version / revision
```

must be known whenever the provider exposes such information.

Examples:

```text
local
finbert
huggingface-revision-or-model-version
```

```text
openrouter
<exact-model-id>
<provider/model-version-if-available>
```

**CRITICAL**

A result must never be identified only by a generic label such as:

```text
FinBERT
GPT
LLM
OpenRouter
```

Those names are insufficient for reproducibility.

---

## 9. Prompt Versioning

**HIGH**

For LLM-based sentiment, the prompt is part of the model/inference configuration.

The system should version the sentiment prompt/template.

For example:

```text
prompt_name: crypto_sentiment
prompt_version: 1
```

If the prompt changes materially, it must receive a new version.

This allows results produced with different prompts to be distinguished.

**MEDIUM**

Store a prompt hash when practical.

Do not store sensitive API credentials or unnecessary prompt data in the result record.

---

## 10. Inference Configuration Versioning

**HIGH**

Where inference behavior depends on configuration, the configuration must be identifiable.

Potential configuration fields include:

* provider;
* model;
* model revision;
* prompt version;
* temperature;
* max tokens;
* preprocessing version;
* aggregation method.

A configuration version or deterministic configuration hash may be used to identify the complete inference configuration.

The objective is:

> Given a historical sentiment result, the system should be able to determine which model/configuration produced it.

---

## 11. Result Reproducibility

**CRITICAL**

The system must be able to distinguish results generated by different model versions/configurations.

For example:

```text
BTC article
    |
    +── FinBERT revision A → POSITIVE
    |
    +── FinBERT revision B → NEUTRAL
```

Both results must remain distinguishable if they are stored.

Similarly:

```text
OpenRouter / Model-A
OpenRouter / Model-B
```

must never become indistinguishable historical records.

**HIGH**

Do not overwrite historical model metadata when changing the active model configuration.

---

## 12. Sentiment Result Contract

**CRITICAL**

The module must return a normalized provider-independent result.

Conceptually:

```text
SentimentResult
├── label
├── score
├── provider
├── model_name
├── model_version
├── prompt_version (LLM)
└── inference metadata
```

Possible normalized labels:

```text
POSITIVE
NEUTRAL
NEGATIVE
```

The exact enum should be defined centrally.

Provider-specific response structures must be converted before leaving the Sentiment worker.

---

## 13. Confidence / Score

**HIGH**

If the inference provider exposes a meaningful probability/confidence score, it may be recorded.

Do not assume scores from different models are directly comparable.

For example:

```text
FinBERT probability
```

and:

```text
LLM self-reported confidence
```

are not necessarily equivalent statistical quantities.

**MEDIUM**

Keep the normalized label separate from provider-specific score semantics.

---

## 14. Text Preprocessing

**HIGH**

Preprocessing should be deterministic and lightweight.

Possible operations:

* whitespace normalization;
* invalid-input handling;
* input-length control;
* title/content combination.

Do not aggressively remove:

* cryptocurrency tickers;
* numbers;
* percentages;
* financial terminology;
* negations.

These can contain important sentiment information.

**MEDIUM**

The preprocessing implementation should have an explicit version identifier if changes can affect inference results.

---

## 15. Long Articles

**HIGH**

The worker must handle content exceeding the selected model's input limit.

The initial implementation should use the simplest deterministic strategy that satisfies project requirements.

Possible approaches:

* title + truncated content;
* deterministic truncation;
* chunking and aggregation.

**MEDIUM**

Do not implement complex hierarchical document models unless actual evaluation demonstrates the need.

If chunking is used, the aggregation method must be explicit and versionable.

---

## 16. LLM Output

**CRITICAL**

LLM sentiment responses must be converted into a structured result.

Do not depend on arbitrary natural-language output.

Conceptually:

```text
LLM
 ↓
Provider Adapter
 ↓
Structured validation
 ↓
SentimentResult
```

Invalid or malformed responses must produce an inference error.

They must not silently become `NEUTRAL`.

---

## 17. Error Handling

**CRITICAL**

The following states must remain distinguishable:

```text
POSITIVE
NEUTRAL
NEGATIVE
INFERENCE_FAILED
```

An inference failure must never be represented as `NEUTRAL`.

Handle failures such as:

* model loading failure;
* missing model files;
* insufficient memory;
* tokenization failure;
* API timeout;
* API rate limit;
* provider failure;
* malformed LLM output.

**HIGH**

If fallback is configured, it must be explicit and observable.

The system must record which provider actually generated the final result.

---

## 18. Model Loading

**HIGH**

Local models should be loaded once and reused.

Do not load FinBERT separately for every news item.

Model initialization should be isolated from inference orchestration.

Conceptually:

```text
Worker startup
     ↓
Model Loader
     ↓
Loaded Model
     ↓
Multiple Inference Requests
```

---

## 19. ONNX Runtime

**MEDIUM**

ONNX Runtime may be used as an optional optimization for local FinBERT inference.

It is not required for the initial implementation.

Use ONNX only if it provides a meaningful performance/resource benefit without significantly increasing implementation complexity.

**CRITICAL**

Do not redesign the entire inference architecture merely to introduce ONNX.

The logical model identity and version must remain traceable when an ONNX-converted model is used.

For example, record enough information to identify:

```text
source model
model revision
conversion/export version
runtime/backend
```

---

## 20. MLOps / Model Registry

**CRITICAL**

The project must maintain an explicit record of the sentiment models/configurations used in production or experiments.

At minimum, the system should be able to answer:

* Which provider was used?
* Which exact model was used?
* Which model revision/version was used?
* Which prompt version was used for LLM inference?
* Which inference configuration was used?
* When did the configuration become active?

A full enterprise MLOps platform is **not required**.

The requirement is **traceability and versioning**, not a large ML infrastructure.

**HIGH**

Model metadata should be stored in version-controlled configuration and/or a persistent model/configuration registry appropriate to the existing architecture.

Do not rely only on undocumented environment state.

---

## 21. Evaluation

**HIGH**

Because the project does not build a dedicated large labeled dataset, evaluation is intentionally lightweight.

Evaluate using representative examples and manual inspection where necessary.

At minimum, inspect:

* clearly positive news;
* clearly negative news;
* clearly neutral news;
* obvious cryptocurrency-specific failure cases.

**MEDIUM**

Comparing FinBERT and LLM results can be useful for identifying failure patterns.

Do not present such comparison as a rigorous benchmark without a properly labeled evaluation dataset.

---

## 22. Traditional ML — Future Scope

**HIGH**

Traditional supervised ML is future scope unless sufficient labeled data and project time become available.

A future pipeline may be:

```text
Dataset
   ↓
Annotation
   ↓
Validation
   ↓
Training
   ↓
Evaluation
   ↓
Model Version
   ↓
Sentiment Worker
```

Possible future models include:

* TF-IDF + Logistic Regression;
* TF-IDF + Linear SVM;
* fine-tuned Transformer;
* cryptocurrency-specific sentiment models.

The current architecture must allow another model provider to be added without changing the rest of the system.

---

## 23. Testing

**HIGH**

Use `pytest`.

Tests should cover:

* preprocessing;
* result normalization;
* label mapping;
* model/provider configuration;
* model metadata/version recording;
* prompt version handling;
* long-text handling;
* structured LLM output parsing;
* invalid responses;
* error handling;
* fallback behavior.

**HIGH**

External LLM API calls must be mocked in the normal unit-test suite.

The normal test suite must not require an OpenRouter API key.

**MEDIUM**

A separate integration test may use a real local FinBERT model when the environment supports it.

---

## 24. Preferred Technologies

**HIGH**

Preferred technologies:

* Python
* Pydantic
* pytest
* Hugging Face Transformers
* FinBERT
* OpenRouter
* environment-based secret management

**MEDIUM**

ONNX Runtime for optional local inference optimization.

These are implementation preferences and must not cause unnecessary complexity.

---

## 25. Non-Goals

**CRITICAL**

The initial module must not implement:

* a large custom labeled dataset;
* a traditional supervised ML training pipeline;
* automated continuous retraining;
* a full enterprise ML platform;
* trading decisions;
* strategy execution;
* news crawling;
* user-facing APIs.

---

## 26. Decision Summary

| Decision                                                     | Level        |
| ------------------------------------------------------------ | ------------ |
| Sentiment is a Python worker supporting the Modular Monolith | **CRITICAL** |
| Do not treat Sentiment as a microservice/business service    | **CRITICAL** |
| Do not build traditional supervised ML in initial scope      | **CRITICAL** |
| Use pre-trained/local and/or LLM inference                   | **HIGH**     |
| Hide providers behind a stable Sentiment Engine abstraction  | **CRITICAL** |
| FinBERT is the initial local financial-sentiment baseline    | **HIGH**     |
| Record exact FinBERT model/checkpoint identity               | **CRITICAL** |
| OpenRouter may provide LLM inference                         | **HIGH**     |
| Record exact OpenRouter model identifier                     | **CRITICAL** |
| Record model provider/name/version for every result          | **CRITICAL** |
| Version LLM prompts                                          | **HIGH**     |
| Version/hash relevant inference configuration                | **HIGH**     |
| Preserve historical model metadata                           | **CRITICAL** |
| Inference failure must not become NEUTRAL                    | **CRITICAL** |
| Structured LLM output is required                            | **CRITICAL** |
| Load local models once and reuse them                        | **HIGH**     |
| ONNX Runtime is optional                                     | **MEDIUM**   |
| Model/configuration traceability is required                 | **CRITICAL** |
| Full enterprise MLOps platform is not required               | **HIGH**     |
| pytest is required/preferred for testing                     | **HIGH**     |
| External LLM APIs are mocked in normal tests                 | **HIGH**     |
| Lightweight manual evaluation is sufficient initially        | **MEDIUM**   |
| Traditional ML remains future scope                          | **HIGH**     |
| Avoid speculative ML infrastructure                          | **MEDIUM**   |
