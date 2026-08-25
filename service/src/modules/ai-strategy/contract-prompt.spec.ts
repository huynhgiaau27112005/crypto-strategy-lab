import { extractPythonCode } from './contract-prompt';

describe('extractPythonCode', () => {
  it('extracts the content of a ```python fenced block', () => {
    const raw = 'Here is the code:\n```python\ndef generate_signals(candles):\n    return []\n```\nDone.';
    expect(extractPythonCode(raw)).toBe('def generate_signals(candles):\n    return []');
  });

  it('falls back to any fenced block when the language tag is missing', () => {
    const raw = '```\ndef generate_signals(candles):\n    return []\n```';
    expect(extractPythonCode(raw)).toBe('def generate_signals(candles):\n    return []');
  });

  it('falls back to the trimmed raw text when there is no fence at all', () => {
    const raw = '  def generate_signals(candles):\n    return []  \n';
    expect(extractPythonCode(raw)).toBe('def generate_signals(candles):\n    return []');
  });
});
