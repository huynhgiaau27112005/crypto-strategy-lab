"""Tests for the dependency-free lexicon sentiment provider.

These pin the behaviours that make it safe to ship as FinBERT's fallback:
polarity, negation, the neutral band, and the interface contract
(one result per input, holes allowed).
"""
import pytest

from core.sentiment.lexicon_provider import MODEL_NAME, LexiconSentimentProvider


@pytest.fixture
def provider() -> LexiconSentimentProvider:
    return LexiconSentimentProvider()


def test_reports_a_model_name_that_is_not_finbert(provider):
    # The whole point of carrying a model name through to the UI: labels
    # produced here must never be attributed to FinBERT.
    assert MODEL_NAME == "lexicon-v1"


def test_scores_clearly_positive_news_as_positive(provider):
    [result] = provider.analyze(["Bitcoin surges to an all-time high as ETF inflows accelerate"])
    assert result is not None
    assert result.label == "positive"
    assert 0.0 < result.score <= 1.0


def test_scores_clearly_negative_news_as_negative(provider):
    [result] = provider.analyze(["Exchange hacked in a major exploit; users report heavy losses"])
    assert result is not None
    assert result.label == "negative"


def test_negation_flips_polarity(provider):
    # A bag-of-words without negation handling gets this exactly backwards,
    # which would invert sentiment across a whole class of headlines.
    [plain] = provider.analyze(["The market is bullish"])
    [negated] = provider.analyze(["The market is not bullish"])
    assert plain.label == "positive"
    assert negated.label != "positive"


def test_text_with_no_lexicon_terms_is_neutral_with_zero_confidence(provider):
    [result] = provider.analyze(["Developers published the scheduled meeting notes"])
    assert result is not None
    assert result.label == "neutral"
    assert result.score == 0.0


def test_a_single_weak_term_does_not_swing_the_label(provider):
    # One "risk" in an otherwise factual article is not a negative story;
    # the neutral band exists so the panel is not dominated by noise.
    [result] = provider.analyze(["The report notes one operational risk in the custody process"])
    assert result.label == "neutral"


def test_empty_and_blank_text_yields_none_not_neutral(provider):
    # None means "could not score", which is a different claim from
    # "this article is neutral" — the DB stores NULL for the former.
    assert provider.analyze(["", "   "]) == [None, None]


def test_returns_one_result_per_input_in_order(provider):
    texts = ["Bitcoin rallies hard", "", "Exchange collapse wipes out funds"]
    results = provider.analyze(texts)
    assert len(results) == len(texts)
    assert results[0].label == "positive"
    assert results[1] is None
    assert results[2].label == "negative"


def test_confidence_never_reaches_one(provider):
    # The squashing function saturates; a lexicon this small must not claim
    # total certainty about anything.
    text = " ".join(["surge soar rally breakout bullish boom"] * 20)
    [result] = provider.analyze([text])
    assert result.score < 1.0
