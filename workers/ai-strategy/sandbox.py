"""
Shared AST-scanning and restricted-exec helpers for validate.py and run.py.

This module implements a VALIDATION GATE, not a security sandbox. It rejects
unwhitelisted imports/calls/dunder-attribute-access by walking the AST (never
by regexing source text, which is trivially evaded — e.g. string-building an
attribute name at runtime), and it strips dangerous builtins before exec().
That stops accidental bad code and unsophisticated malice, but running
model-generated Python via exec() in the same OS process — even with a
restricted globals dict and a hard timeout — does not contain a determined
attacker who knows CPython internals (object graph traversal from allowed
builtins, denial-of-service via memory/CPU that a signal-based timeout only
partially bounds, etc). This is acceptable for a locally-run academic
project. See artifacts/ai-strategy.md for the full writeup — do not present
this as "sandboxed" in code, docs, or UI copy.
"""
from __future__ import annotations

import _thread
import ast
import builtins as _builtins
import contextlib
import signal
import threading

CONTRACT_FUNCTION = "generate_signals"

# No imports are allowed in generated strategy code at all right now — the
# contract only needs arithmetic over plain dicts/lists, all reachable with
# the builtins below. This is a deliberate, conservative default (empty
# allowlist) rather than an oversight; extending it later means adding a
# module name here AND deciding how it is injected into exec() globals,
# since a restricted __builtins__ dict has no working `import` statement.
ALLOWED_IMPORT_MODULES: set[str] = set()

# Builtins available inside generated strategy code. Deliberately small:
# no `open`, `eval`, `exec`, `compile`, `__import__`, `input`, `exit`,
# `quit`, `breakpoint`, `globals`/`locals`/`vars`, no filesystem, no process,
# no network primitives exist in Python builtins at all so nothing to add
# for that beyond keeping `open`/`__import__` out.
ALLOWED_BUILTIN_NAMES: set[str] = {
    "abs", "all", "any", "bool", "dict", "enumerate", "filter", "float",
    "int", "len", "list", "map", "max", "min", "pow", "range", "reversed",
    "round", "set", "sorted", "str", "sum", "tuple", "zip",
    "True", "False", "None",
}

FORBIDDEN_NAMES: set[str] = {
    "eval", "exec", "__import__", "compile", "open", "input", "exit",
    "quit", "breakpoint", "globals", "locals", "vars", "getattr", "setattr",
    "delattr", "os", "sys", "subprocess", "socket", "shutil", "pathlib",
}


def find_contract_function(tree: ast.Module) -> ast.FunctionDef | None:
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == CONTRACT_FUNCTION:
            return node
    return None


def check_contract_signature(func: ast.FunctionDef) -> bool:
    """`generate_signals(candles)` — exactly one required positional
    parameter (the whole candle series), matching the whole-series contract
    (one call per backtest, not one call per candle)."""
    args = func.args
    positional = list(args.posonlyargs) + list(args.args)
    if len(positional) != 1:
        return False
    if args.vararg is not None:
        return False
    for kw, default in zip(args.kwonlyargs, args.kw_defaults):
        if default is None:
            return False
    return True


def scan_safety(tree: ast.Module) -> list[str]:
    """Walks the full AST (not the source text) and returns a list of
    human-readable violation messages; empty means the scan passed."""
    violations: list[str] = []

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [alias.name.split(".")[0] for alias in node.names]
            elif node.module:
                names = [node.module.split(".")[0]]
            for name in names:
                if name not in ALLOWED_IMPORT_MODULES:
                    violations.append(f"disallowed import: {name}")
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__") and node.attr.endswith("__"):
                violations.append(f"disallowed dunder attribute access: .{node.attr}")
        elif isinstance(node, ast.Name):
            if (node.id.startswith("__") and node.id.endswith("__")) or node.id in FORBIDDEN_NAMES:
                violations.append(f"disallowed name: {node.id}")

    # De-duplicate while preserving order, so the same violation repeated
    # across many lines doesn't flood the UI checklist.
    seen: set[str] = set()
    unique: list[str] = []
    for v in violations:
        if v not in seen:
            seen.add(v)
            unique.append(v)
    return unique


def build_restricted_globals() -> dict:
    safe_builtins = {
        name: getattr(_builtins, name) for name in ALLOWED_BUILTIN_NAMES if hasattr(_builtins, name)
    }
    return {"__builtins__": safe_builtins}


class TimeLimitExceeded(Exception):
    """Raised inside `time_limit` when the guarded block runs too long."""


@contextlib.contextmanager
def time_limit(seconds: int, message: str):
    """Bounds the wall-clock time of the guarded block, on any platform.

    POSIX gets `signal.alarm`, which interrupts the main thread from the
    kernel. Windows has no `SIGALRM` at all — referencing `signal.SIGALRM`
    there raises `AttributeError`, which is exactly what used to crash
    validate.py/run.py on Windows before they could print any JSON, so the
    AI Strategy tab reported "Validation worker could not run" for every
    single strategy. There, a watchdog thread calls
    `_thread.interrupt_main()`, which raises KeyboardInterrupt in the main
    thread between bytecodes — enough to break out of the pure-Python loops
    generated strategies are made of.

    Either way this stays DEFENSE IN DEPTH, not the primary bound: neither
    mechanism can interrupt a single long-running C call, and the Node
    caller (service/src/modules/ai-strategy/python-process.util.ts) always
    wraps this process in its own hard timeout and SIGKILLs on overrun.
    """
    if hasattr(signal, "SIGALRM"):
        def _on_alarm(signum, frame):  # noqa: ARG001
            raise TimeLimitExceeded(message)

        old_handler = signal.signal(signal.SIGALRM, _on_alarm)
        signal.alarm(seconds)
        try:
            yield
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)
        return

    timed_out = False

    def _interrupt() -> None:
        nonlocal timed_out
        timed_out = True
        _thread.interrupt_main()

    timer = threading.Timer(seconds, _interrupt)
    timer.daemon = True
    timer.start()
    try:
        yield
    except KeyboardInterrupt:
        # Only OUR watchdog can have raised this here: the worker is a
        # non-interactive subprocess with stdin already consumed.
        if timed_out:
            raise TimeLimitExceeded(message) from None
        raise
    finally:
        timer.cancel()
