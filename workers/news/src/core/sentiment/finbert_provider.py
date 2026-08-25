"""
Local FinBERT implementation of `SentimentProvider`.

Model label order is NOT alphabetical and NOT intuitive -- ProsusAI/finbert's
`id2label` is `{0: 'positive', 1: 'negative', 2: 'neutral'}`. Index 1 is
*negative*, not neutral. This class always resolves the label through the
model's own `config.id2label`, never by assuming a fixed [pos, neu, neg] (or
any other) position -- see `test/core/sentiment/finbert_provider_test.py`
for a test that pins this mapping so a future model swap or transformers
upgrade can't silently invert sentiment across the whole dataset.
"""
import logging
from typing import Optional

from core.sentiment.provider import SentimentProvider, SentimentResult

logger = logging.getLogger(__name__)


class FinbertSentimentProvider(SentimentProvider):
    def __init__(self, model_path: str, max_length: int = 512):
        # Imported lazily so importing this module (e.g. from tests that
        # only check wiring) never requires torch/transformers to be
        # installed unless a Finbert provider is actually constructed.
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        self._torch = torch
        self.max_length = max_length
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_path)
        self.model.eval()
        # Resolved once, from the model's own config -- never hard-coded.
        self.id2label: dict[int, str] = dict(self.model.config.id2label)

    def analyze(self, texts: list[str]) -> list[Optional[SentimentResult]]:
        results: list[Optional[SentimentResult]] = []
        for text in texts:
            if not text or not text.strip():
                results.append(None)
                continue
            try:
                results.append(self._analyze_one(text))
            except Exception:
                logger.exception("FinBERT scoring failed for one article; leaving it unscored.")
                results.append(None)
        return results

    def _analyze_one(self, text: str) -> SentimentResult:
        torch = self._torch
        inputs = self.tokenizer(
            text=text,
            return_tensors="pt",
            truncation=True,
            max_length=self.max_length,
        )
        with torch.no_grad():
            outputs = self.model(**inputs)
        probabilities = torch.softmax(outputs.logits, dim=-1)
        prediction_idx = int(torch.argmax(probabilities, dim=-1).item())
        score = float(probabilities[0][prediction_idx].item())
        label = self.id2label[prediction_idx]
        return SentimentResult(label=label, score=score)
