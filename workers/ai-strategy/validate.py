#!/usr/bin/env python3
"""
Validation gate for one AI-generated strategy source string. Reads a JSON
payload `{"source": "<python code>"}` from stdin, runs four checks in order
(parses / contract function / static safety scan / smoke run), and prints
one JSON result line to stdout: `{"valid": bool, "checks": [...]}`.

Each check entry is `{"key", "passed", "message"}` — the Node caller renders
these directly into the "Kiểm tra & validation" panel, so `message` is
meant to be read by a human, not just logged.

NOT a security sandbox — see sandbox.py's module docstring and
artifacts/ai-strategy.md. The caller (service/src/modules/ai-strategy) MUST
wrap this process in its own hard timeout and kill it on overrun; the
internal signal.alarm below is defense in depth, not the primary bound.
"""
from __future__ import annotations

import ast
import json
import signal
import sys

from sandbox import (
    CONTRACT_FUNCTION,
    build_restricted_globals,
    check_contract_signature,
    find_contract_function,
    scan_safety,
)

SMOKE_TIMEOUT_SECONDS = 5
VALID_SIGNALS = {"BUY", "SELL", "HOLD"}


class _SmokeTimeout(Exception):
    pass


def _on_alarm(signum, frame):  # noqa: ARG001
    raise _SmokeTimeout(f"Smoke run exceeded {SMOKE_TIMEOUT_SECONDS}s internal timeout")


def synthetic_candles(n: int = 30) -> list[dict]:
    """A small deterministic candle series — enough to exercise typical
    indicator math (moving averages, rolling highs/lows) without depending
    on the database or network."""
    candles = []
    price = 100.0
    ts = 1_700_000_000_000
    for i in range(n):
        price += (1 if i % 2 == 0 else -1) * 0.5
        close = price + (0.3 if i % 3 == 0 else -0.2)
        candles.append(
            {
                "timestamp": ts + i * 60_000,
                "open": price,
                "high": max(price, close) + 1,
                "low": min(price, close) - 1,
                "close": close,
                "volume": 10.0 + i,
            }
        )
    return candles


def main() -> int:
    payload = json.loads(sys.stdin.read())
    source = payload["source"]

    checks: list[dict] = []
    overall_valid = True

    tree: ast.Module | None = None
    try:
        tree = ast.parse(source)
        checks.append({"key": "parses", "passed": True, "message": "Source parses as valid Python (ast.parse)."})
    except SyntaxError as exc:
        checks.append({"key": "parses", "passed": False, "message": f"SyntaxError: {exc}"})
        overall_valid = False

    func_node = find_contract_function(tree) if tree is not None else None
    if tree is None:
        checks.append({"key": "contract", "passed": False, "message": "Skipped: source did not parse."})
        overall_valid = False
    elif func_node is not None and check_contract_signature(func_node):
        checks.append(
            {
                "key": "contract",
                "passed": True,
                "message": f"Function `{CONTRACT_FUNCTION}(candles)` found with the correct arity.",
            }
        )
    else:
        reason = (
            f"No top-level function named `{CONTRACT_FUNCTION}`."
            if func_node is None
            else f"`{CONTRACT_FUNCTION}` must take exactly one required positional parameter (the whole candle series)."
        )
        checks.append({"key": "contract", "passed": False, "message": reason})
        overall_valid = False

    safety_ok = False
    if tree is None:
        checks.append({"key": "safety", "passed": False, "message": "Skipped: source did not parse."})
        overall_valid = False
    else:
        violations = scan_safety(tree)
        safety_ok = len(violations) == 0
        checks.append(
            {
                "key": "safety",
                "passed": safety_ok,
                "message": "No disallowed imports/calls/dunder access found."
                if safety_ok
                else "Rejected: " + "; ".join(violations),
            }
        )
        if not safety_ok:
            overall_valid = False

    if tree is not None and func_node is not None and safety_ok:
        old_handler = signal.signal(signal.SIGALRM, _on_alarm)
        signal.alarm(SMOKE_TIMEOUT_SECONDS)
        try:
            candles = synthetic_candles()
            restricted_globals = build_restricted_globals()
            exec(compile(tree, "<ai-strategy>", "exec"), restricted_globals)  # noqa: S102
            fn = restricted_globals[CONTRACT_FUNCTION]
            result = fn(candles)
            if not isinstance(result, list) or len(result) != len(candles):
                got_len = len(result) if isinstance(result, list) else "n/a"
                raise ValueError(
                    f"Expected a list of {len(candles)} signals, got "
                    f"{type(result).__name__} of length {got_len}."
                )
            bad = sorted({s for s in result if s not in VALID_SIGNALS}, key=str)
            if bad:
                raise ValueError(f"Invalid signal value(s) (must be BUY/SELL/HOLD): {bad[:5]}")
            checks.append(
                {
                    "key": "smoke",
                    "passed": True,
                    "message": f"Ran on {len(candles)} synthetic candles, returned {len(result)} valid signals.",
                }
            )
        except _SmokeTimeout as exc:
            checks.append({"key": "smoke", "passed": False, "message": str(exc)})
            overall_valid = False
        except Exception as exc:  # noqa: BLE001 - any failure from untrusted code becomes a check result, not a crash
            checks.append({"key": "smoke", "passed": False, "message": f"{type(exc).__name__}: {exc}"})
            overall_valid = False
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)
    else:
        checks.append({"key": "smoke", "passed": False, "message": "Skipped: an earlier check failed."})
        overall_valid = False

    print(json.dumps({"valid": overall_valid, "checks": checks}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
