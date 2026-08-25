/**
 * The pinned generated-strategy contract, sent verbatim to the LLM as its
 * system prompt (see providers/openai-compatible.provider.ts) and mirrored
 * by workers/ai-strategy/sandbox.py's CONTRACT_FUNCTION + check_contract_signature.
 * Keep the two in sync if this ever changes.
 */
export const CONTRACT_SYSTEM_PROMPT = `You write ONE Python function that implements a crypto trading strategy.

Contract (must follow exactly):
- Define exactly one top-level function: def generate_signals(candles):
- "candles" is the WHOLE series: a list of dicts, each with keys
  timestamp (int, ms), open, high, low, close, volume (all floats), oldest first.
- Return a list of strings, SAME LENGTH as candles, one signal per candle,
  each value exactly one of: "BUY", "SELL", "HOLD". No other values.
- This is called ONCE per backtest with the full series — never assume you
  will be called once per candle. Compute any rolling/moving statistics
  yourself by indexing into the candles list you already have.
- No imports of any kind. No "os", "sys", "subprocess", "socket", "open",
  "eval", "exec", "__import__", no dunder attribute access (e.g. no
  "__class__", "__globals__"), no network or filesystem access, no classes,
  no top-level code besides the function definition itself.
- Only use plain Python builtins available without importing anything:
  abs, all, any, bool, dict, enumerate, filter, float, int, len, list, map,
  max, min, pow, range, reversed, round, set, sorted, str, sum, tuple, zip.
- Keep it deterministic and side-effect free: no randomness, no I/O.

Output ONLY the Python source code for this one function (optionally with a
short leading comment). Wrap it in a single \`\`\`python code fence and put
nothing else in the response — no explanation before or after the fence.`;

export const PROMPT_SAMPLES: string[] = [
  'MA(20) cắt lên MA(50) và RSI > 55 thì LONG, đảo chiều thì đóng lệnh.',
  'Giá phá vùng kháng cự kèm volume gấp 1.5 lần trung bình thì LONG, SL 1.5%.',
  'Theo SMC: chờ break of structure rồi vào lệnh tại order block gần nhất.',
];

/**
 * Extracts the Python source from a raw model response: prefers the
 * content of a ```python fenced block, falls back to any fenced block,
 * falls back to the raw text trimmed (in case the model ignored the fence
 * instruction) — the validator is the real gate either way, this is just
 * best-effort extraction.
 */
export function extractPythonCode(raw: string): string {
  const namedFence = raw.match(/```python\s*\n([\s\S]*?)```/i);
  if (namedFence) return namedFence[1].trim();
  const anyFence = raw.match(/```[a-zA-Z]*\s*\n([\s\S]*?)```/);
  if (anyFence) return anyFence[1].trim();
  return raw.trim();
}
