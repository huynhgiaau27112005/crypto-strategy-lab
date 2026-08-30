"""
Dependency-free lexicon `SentimentProvider`.

Why this exists
---------------
`get_sentiment_provider()` used to fall straight back to
`NoopSentimentProvider` whenever FinBERT could not be constructed. That is
the correct behaviour for "never lose a crawl", but it made a *silent*
failure: `workers/news/models/finbert/` was never populated and
torch/transformers live in the optional `[sentiment]` extra, so the
fallback was ALWAYS taken. Every one of the 39 stored articles had
`sentiment = NULL`, which meant:

  * the "Sentiment BTC" panel was permanently empty, and
  * the NEWS_SENTIMENT strategy (domain INFORMATION) abstained on every
    single candidate, silently contributing nothing to any backtest.

This provider needs no model files, no network, and no third-party
packages, so the Analyze step of the required News Collect -> Store ->
Analyze pipeline always produces something.

What it is and is not
---------------------
It is a bag-of-words score over a curated finance/crypto lexicon, with
negation handling and intensifiers. It is NOT FinBERT and does not pretend
to be: `MODEL_NAME` is reported through to the UI so the screen always
names the model that actually scored the rows. Treat its labels as a
usable demo signal, not as research-grade classification.

The whole point, architecturally, is that it plugs into the existing
`SentimentProvider` interface without touching the crawler, `main.py`, or
the DB layer -- which is exactly the "crawler must not be bound to one
hard-coded ML model" property
`docs/about-projects/03-anti-patterns-to-avoid.md` asks for.
"""
import logging
import re
from typing import Optional

from core.sentiment.provider import SentimentProvider, SentimentResult

logger = logging.getLogger(__name__)

MODEL_NAME = "lexicon-v1"

# Weights are deliberately coarse (1.0 / 1.5 / 2.0 bands) rather than
# hand-tuned decimals: a lexicon this small cannot justify finer precision,
# and pretending otherwise would invite reading meaning into the exact
# numbers.
POSITIVE_TERMS: dict[str, float] = {
    "surge": 2.0, "surges": 2.0, "surged": 2.0, "soar": 2.0, "soars": 2.0,
    "soared": 2.0, "rally": 2.0, "rallies": 2.0, "rallied": 2.0,
    "breakout": 2.0, "all-time high": 2.0, "record high": 2.0,
    "bullish": 2.0, "boom": 2.0, "skyrocket": 2.0, "skyrockets": 2.0,
    "jump": 1.5, "jumps": 1.5, "jumped": 1.5, "climb": 1.5, "climbs": 1.5,
    "climbed": 1.5, "gain": 1.5, "gains": 1.5, "gained": 1.5, "rise": 1.5,
    "rises": 1.5, "rose": 1.5, "profit": 1.5, "profits": 1.5,
    "outperform": 1.5, "upgrade": 1.5, "adoption": 1.5, "approval": 1.5,
    "approved": 1.5, "partnership": 1.5, "inflow": 1.5, "inflows": 1.5,
    "up": 1.0, "higher": 1.0, "growth": 1.0, "grow": 1.0, "positive": 1.0,
    "optimistic": 1.0, "support": 1.0, "recovery": 1.0, "rebound": 1.0,
    "strong": 1.0, "strength": 1.0, "boost": 1.0, "buy": 1.0,
    "accumulate": 1.0, "milestone": 1.0, "launch": 1.0, "expands": 1.0,
}

NEGATIVE_TERMS: dict[str, float] = {
    "crash": 2.0, "crashes": 2.0, "crashed": 2.0, "plunge": 2.0,
    "plunges": 2.0, "plunged": 2.0, "collapse": 2.0, "collapses": 2.0,
    "collapsed": 2.0, "bearish": 2.0, "hack": 2.0, "hacked": 2.0,
    "exploit": 2.0, "exploited": 2.0, "scam": 2.0, "fraud": 2.0,
    "bankruptcy": 2.0, "bankrupt": 2.0, "liquidation": 2.0,
    "liquidations": 2.0, "capitulation": 2.0,
    "plummet": 2.0, "plummets": 2.0, "slump": 1.5, "slumps": 1.5,
    "tumble": 1.5, "tumbles": 1.5, "tumbled": 1.5, "drop": 1.5,
    "drops": 1.5, "dropped": 1.5, "fall": 1.5, "falls": 1.5, "fell": 1.5,
    "loss": 1.5, "losses": 1.5, "decline": 1.5, "declines": 1.5,
    "lawsuit": 1.5, "sued": 1.5, "ban": 1.5, "banned": 1.5,
    "crackdown": 1.5, "investigation": 1.5, "outflow": 1.5,
    "outflows": 1.5, "downgrade": 1.5, "selloff": 1.5, "sell-off": 1.5,
    "down": 1.0, "lower": 1.0, "weak": 1.0, "weakness": 1.0,
    "concern": 1.0, "concerns": 1.0, "risk": 1.0, "risks": 1.0,
    "warning": 1.0, "warns": 1.0, "fear": 1.0, "fears": 1.0,
    "uncertainty": 1.0, "volatile": 1.0, "volatility": 1.0,
    "pressure": 1.0, "sell": 1.0, "delay": 1.0, "delayed": 1.0,
    "rejected": 1.0, "halt": 1.0, "halted": 1.0,
}

# Flip the polarity of the next few tokens. "not bullish" must not count as
# bullish, which a plain bag-of-words would get exactly backwards.
NEGATIONS = frozenset(
    {"not", "no", "never", "without", "fails", "fail", "failed", "unlikely", "isn't", "aren't", "won't", "doesn't"}
)
NEGATION_WINDOW = 3

# Multiply the magnitude of the next matched term.
INTENSIFIERS: dict[str, float] = {
    "very": 1.5, "highly": 1.5, "sharply": 1.5, "massive": 1.5,
    "massively": 1.5, "extremely": 2.0, "record": 1.5, "slightly": 0.5,
    "marginally": 0.5, "somewhat": 0.5,
}

# Below this the article reads as NEUTRAL. Chosen so a single weak term in
# a long article does not swing the label -- one "risk" in 400 words is
# not a negative story.
NEUTRAL_BAND = 1.0

_TOKEN_RE = re.compile(r"[a-z0-9'\-]+")
# Multi-word entries ("all-time high") never survive tokenisation, so they
# are matched against the raw text separately.
_MULTIWORD_POSITIVE = [term for term in POSITIVE_TERMS if " " in term]
_MULTIWORD_NEGATIVE = [term for term in NEGATIVE_TERMS if " " in term]


class LexiconSentimentProvider(SentimentProvider):
    """Scores text by summing signed lexicon weights, then squashing the
    result into a 0-1 confidence."""

    def analyze(self, texts: list[str]) -> list[Optional[SentimentResult]]:
        return [self._analyze_one(text) for text in texts]

    def _analyze_one(self, text: Optional[str]) -> Optional[SentimentResult]:
        # None (not a neutral label) for unscoreable input: the interface
        # asks callers to tolerate holes, and "we could not read this" is
        # not the same claim as "this article is neutral".
        if not text or not text.strip():
            return None

        lowered = text.lower()
        score = self._multiword_score(lowered)
        tokens = _TOKEN_RE.findall(lowered)

        negate_until = -1
        pending_intensity = 1.0
        matched = 0

        for index, token in enumerate(tokens):
            if token in NEGATIONS:
                negate_until = index + NEGATION_WINDOW
                continue
            if token in INTENSIFIERS:
                pending_intensity = INTENSIFIERS[token]
                continue

            weight = POSITIVE_TERMS.get(token)
            if weight is None:
                weight = NEGATIVE_TERMS.get(token)
                if weight is not None:
                    weight = -weight
            if weight is None:
                continue

            matched += 1
            weight *= pending_intensity
            pending_intensity = 1.0
            if index <= negate_until:
                weight = -weight
            score += weight

        if matched == 0 and score == 0.0:
            # Nothing in the lexicon appeared at all. That is genuinely
            # "no signal", reported as NEUTRAL with minimum confidence
            # rather than as an inability to score.
            return SentimentResult(label="neutral", score=0.0)

        if score > NEUTRAL_BAND:
            label = "positive"
        elif score < -NEUTRAL_BAND:
            label = "negative"
        else:
            label = "neutral"

        return SentimentResult(label=label, score=self._confidence(score))

    def _multiword_score(self, lowered: str) -> float:
        score = 0.0
        for term in _MULTIWORD_POSITIVE:
            if term in lowered:
                score += POSITIVE_TERMS[term]
        for term in _MULTIWORD_NEGATIVE:
            if term in lowered:
                score -= NEGATIVE_TERMS[term]
        return score

    @staticmethod
    def _confidence(score: float) -> float:
        """Squash an unbounded signed score into 0-1.

        `|score| / (|score| + 3)` saturates smoothly: one strong term gives
        ~0.4, a clearly one-sided article ~0.7+, and nothing ever reaches a
        dishonest 1.0. The DB column is NUMERIC, so this is rounded to keep
        stored values readable.
        """
        magnitude = abs(score)
        return round(magnitude / (magnitude + 3.0), 4)
