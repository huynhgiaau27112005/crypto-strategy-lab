"""
Provider abstraction for sentiment classification.

The anti-pattern list (docs/about-projects/03-anti-patterns-to-avoid.md)
explicitly forbids binding the crawler/worker to one hard-coded ML model.
Everything downstream of this module (main.py) talks to a `SentimentProvider`
by this interface only -- swapping the local FinBERT model for a different
local model or a remote API (e.g. an OpenRouter LLM) means writing a new
class here and pointing `SENTIMENT_PROVIDER` at it, never editing the
crawler or the DB layer.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class SentimentResult:
    """Raw provider output. `label` is whatever the provider natively
    returns (FinBERT: lowercase 'positive'/'negative'/'neutral') -- mapping
    to the DB's uppercase `sentiment_label` enum happens in the DB layer,
    not here, so a provider never has to know about Postgres."""
    label: str
    score: float


class SentimentProvider(ABC):
    """Batch sentiment classification over raw article text."""

    @abstractmethod
    def analyze(self, texts: list[str]) -> list[Optional[SentimentResult]]:
        """Returns one result per input text, same order, same length.
        An element is None when that specific text could not be scored
        (e.g. empty string) -- callers must tolerate holes, not assume every
        text produced a result."""
        raise NotImplementedError


class NoopSentimentProvider(SentimentProvider):
    """Fallback provider used when no real model is available (missing
    weights, failed provider construction, sentiment explicitly disabled).
    Always returns None for every text so the crawl can still persist
    articles with `sentiment = NULL` instead of losing them."""

    def analyze(self, texts: list[str]) -> list[Optional[SentimentResult]]:
        return [None for _ in texts]
