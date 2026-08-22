import pytest
from core.crawler.extractor import CoinEntityExtractor


def test_extractor_positive_matching():
    """Test extracting major crypto tickers from title and content."""
    extractor = CoinEntityExtractor()
    title = "Bitcoin and Ethereum rally as Solana reaches new high"
    content = "Institutional inflows into BTC, ETH, and Dogecoin have surged today."

    coins = extractor.extract(title, content)

    assert "BTC" in coins
    assert "ETH" in coins
    assert "SOL" in coins
    assert "DOGE" in coins


def test_extractor_false_positive_rejection():
    """Test word boundaries prevent false positive matches on common words."""
    extractor = CoinEntityExtractor()

    # 'solution', 'console', 'absolute' must NOT match SOL
    text_sol_false = "The company developed a software solution for the gaming console with absolute precision."
    assert extractor.extract("Software Update", text_sol_false) == []

    # 'link' in common English must NOT match LINK
    text_link_false = "Please click the link below to read our article."
    assert extractor.extract("Important Notice", text_link_false) == []

    # 'Chainlink' explicitly matches LINK
    text_chainlink_true = "Developers deployed decentralized oracles using Chainlink protocol."
    assert extractor.extract("Oracle Update", text_chainlink_true) == ["LINK"]


def test_extractor_deduplication():
    """Test duplicate references to a coin produce only one ticker."""
    extractor = CoinEntityExtractor()
    title = "Bitcoin, BTC, and more bitcoin news"
    content = "Bitcoin is the premier cryptocurrency."

    coins = extractor.extract(title, content)
    assert coins == ["BTC"]
