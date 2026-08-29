#!/usr/bin/env python3
"""
Executes one already-saved AI-generated strategy over a real candle series
and prints its signals as JSON. Reads `{"source": "...", "candles": [...]}`
from stdin; each candle is `{timestamp, open, high, low, close, volume}`.

Re-runs the same parse/contract/safety checks as validate.py before
executing — a saved DB row is never trusted blindly just because it passed
validation once at save time; this script is the last line of defense
before exec() runs on it, not a rubber-stamped second opinion.

One call for the WHOLE series (never one subprocess per candle) — that is
the execution contract, since a backtest evaluates thousands of candles and
per-candle subprocess spawning would make it unusably slow.

NOT a security sandbox — see sandbox.py's module docstring and
artifacts/ai-strategy.md. The caller MUST wrap this process in its own hard
timeout, an output size cap, and treat a non-zero exit as a real error.
"""
from __future__ import annotations

import ast
import json
import sys

from sandbox import (
    CONTRACT_FUNCTION,
    TimeLimitExceeded,
    build_restricted_globals,
    check_contract_signature,
    find_contract_function,
    scan_safety,
    time_limit,
)

RUN_TIMEOUT_SECONDS = 20
VALID_SIGNALS = {"BUY", "SELL", "HOLD"}


def fail(message: str) -> int:
    print(json.dumps({"error": message}), file=sys.stderr)
    return 1


def main() -> int:
    payload = json.loads(sys.stdin.read())
    source = payload["source"]
    candles = payload["candles"]

    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return fail(f"SyntaxError: {exc}")

    func_node = find_contract_function(tree)
    if func_node is None or not check_contract_signature(func_node):
        return fail(f"Contract function `{CONTRACT_FUNCTION}(candles)` not found or has the wrong signature.")

    violations = scan_safety(tree)
    if violations:
        return fail("Safety scan failed: " + "; ".join(violations))

    try:
        restricted_globals = build_restricted_globals()
        exec(compile(tree, "<ai-strategy>", "exec"), restricted_globals)  # noqa: S102
        fn = restricted_globals[CONTRACT_FUNCTION]
        with time_limit(
            RUN_TIMEOUT_SECONDS,
            f"Execution exceeded {RUN_TIMEOUT_SECONDS}s internal timeout",
        ):
            result = fn(candles)
        if not isinstance(result, list) or len(result) != len(candles):
            got_len = len(result) if isinstance(result, list) else "n/a"
            return fail(
                f"Expected a list of {len(candles)} signals, got "
                f"{type(result).__name__} of length {got_len}."
            )
        bad = sorted({s for s in result if s not in VALID_SIGNALS}, key=str)
        if bad:
            return fail(f"Invalid signal value(s) returned (must be BUY/SELL/HOLD): {bad[:5]}")
    except TimeLimitExceeded as exc:
        return fail(str(exc))
    except Exception as exc:  # noqa: BLE001
        return fail(f"{type(exc).__name__}: {exc}")

    print(json.dumps({"signals": result}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
