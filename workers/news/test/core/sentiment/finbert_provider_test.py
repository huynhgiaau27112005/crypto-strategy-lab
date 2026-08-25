"""
Pins the FinBERT label mapping. ProsusAI/finbert's `id2label` is
`{0: 'positive', 1: 'negative', 2: 'neutral'}` -- index 1 is *negative*, not
neutral. Mapping by position (e.g. assuming [positive, neutral, negative])
instead of through the model's own config would silently invert sentiment
across the whole dataset while still producing plausible-looking output.
These tests fail loudly if that ever regresses (model swap, transformers
upgrade changing default id2label behavior, a future edit that
hard-codes an index instead of reading config.id2label).
"""
from pathlib import Path

import pytest

MODEL_PATH = Path(__file__).resolve().parents[3] / "models" / "finbert"

pytestmark = pytest.mark.skipif(
    not MODEL_PATH.exists(),
    reason="FinBERT weights not present locally (models/finbert) -- see workers/news/README.md.",
)


@pytest.fixture(scope="module")
def provider():
    from core.sentiment.finbert_provider import FinbertSentimentProvider

    return FinbertSentimentProvider(model_path=str(MODEL_PATH))


def test_id2label_order_is_not_alphabetical(provider):
    """The exact mapping this whole module exists to guard against assuming."""
    assert provider.id2label == {0: "positive", 1: "negative", 2: "neutral"}


def test_analyze_positive_headline_maps_to_positive_label(provider):
    [result] = provider.analyze(["Bitcoin surges to a new all-time high as institutional demand accelerates."])
    assert result is not None
    assert result.label == "positive"
    assert 0.0 < result.score <= 1.0


def test_analyze_negative_headline_maps_to_negative_label(provider):
    """The regression case: if the label were read by raw softmax index
    (1 == negative) instead of by name, this would come back 'neutral'."""
    [result] = provider.analyze(["Crypto exchange collapses into insolvency after losing customer funds."])
    assert result is not None
    assert result.label == "negative"
    assert 0.0 < result.score <= 1.0


def test_analyze_skips_empty_text_without_calling_model(provider):
    [result] = provider.analyze([""])
    assert result is None
