import re
from typing import Optional


class CoinEntityExtractor:
    """
    Rule-based crypto entity extractor using curated dictionaries and regex word boundaries.
    Prevents false positives on common words (e.g. 'solution', 'console' vs 'SOL').
    """

    COIN_MAP = {
        "BTC": ["bitcoin", "btc"],
        "ETH": ["ethereum", "ether", "eth"],
        "SOL": ["solana", "sol"],
        "BNB": ["binance coin", "bnb"],
        "XRP": ["ripple", "xrp"],
        "ADA": ["cardano", "ada"],
        "DOGE": ["dogecoin", "doge"],
        "AVAX": ["avalanche", "avax"],
        "DOT": ["polkadot"],
        "MATIC": ["polygon", "matic"],
        "LINK": ["chainlink"],               # "link" excluded to avoid false positives
        "UNI": ["uniswap"],
        "NEAR": ["near protocol"],           # "near" excluded to avoid false positives
        "APT": ["aptos", "apt"],
        "SUI": ["sui"],
        "TON": ["toncoin", "the open network"],
        "TRX": ["tron", "trx"],
    }

    def __init__(self):
        # Precompile regex patterns for performance and strict word boundaries
        self.compiled_patterns = {}
        for ticker, aliases in self.COIN_MAP.items():
            patterns = [
                re.compile(rf"\b{re.escape(alias)}\b", re.IGNORECASE)
                for alias in aliases
            ]
            self.compiled_patterns[ticker] = patterns

    def extract(self, title: Optional[str], content: Optional[str]) -> list[str]:
        """
        Extract list of unique coin tickers referenced in title and content.
        """
        text = f"{title or ''} {content or ''}"
        if not text.strip():
            return []

        matched_coins = []
        for ticker, patterns in self.compiled_patterns.items():
            for pattern in patterns:
                if pattern.search(text):
                    matched_coins.append(ticker)
                    break

        return matched_coins
