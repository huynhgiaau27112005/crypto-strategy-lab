import { NewsService } from './news.service';
describe('NewsService summary HTML stripping', () => {
  // Real payload shape from the cointelegraph RSS feed — the feed puts a
  // floated <img> wrapper in `description`, which used to reach the UI
  // verbatim and render as a wall of markup under every headline.
  const RSS_HTML =
    '<p style="float: right; margin: 0 0 10px 15px; width: 240px;">' +
    '<img alt="Revolut rolls out euro stablecoin" class="type:primaryImage" src="https://s3.example/x.jpg">' +
    '</p>Revolut has launched its euro stablecoin in three European markets.';

  function summaryOf(content: string | null): string | null {
    const service = new NewsService({} as never);
    return (service as unknown as { toSummary(c: string | null): string | null }).toSummary(content);
  }

  it('renders plain prose, never raw markup, for an HTML-bearing row', () => {
    const summary = summaryOf(RSS_HTML);
    expect(summary).not.toContain('<');
    expect(summary).not.toContain('float: right');
    expect(summary).toContain('Revolut has launched its euro stablecoin');
  });

  it('decodes HTML entities rather than leaking them into the UI', () => {
    expect(summaryOf('Bulls &amp; bears &quot;fight&quot;')).toBe('Bulls & bears "fight"');
  });

  it('leaves already-clean text untouched', () => {
    expect(summaryOf('Plain headline summary.')).toBe('Plain headline summary.');
  });

  it('still returns null for missing content', () => {
    expect(summaryOf(null)).toBeNull();
  });
});

