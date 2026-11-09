import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../feedback-worker/src/index';
import { buildIssue, validate } from '../feedback-worker/src/issue';

const good = {
  kind: 'bug',
  title: 'Belts cross',
  description: 'The belt goes through a block when @someone moves it <b>',
  contact: 'me@example.com',
  system: { version: '0.6.3', app: 'desktop (Tauri)' },
  errors: ['[12:00:00] error: boom'],
  plan: JSON.stringify({ v: 3, targets: [{ item: 'screw', rate: 40 }] }),
};

describe('validate()', () => {
  it('accepts a normal report', () => {
    expect(validate(good).ok).toBe(true);
  });
  it('rejects spam, missing fields and bad attachments', () => {
    expect(validate({ ...good, website: 'http://spam' })).toEqual({ ok: false, error: 'spam' });
    expect(validate({ ...good, title: 'x' })).toEqual({ ok: false, error: 'title' });
    expect(validate({ ...good, description: '' })).toEqual({ ok: false, error: 'description' });
    expect(validate({ ...good, kind: 'rant' })).toEqual({ ok: false, error: 'kind' });
    expect(validate({ ...good, plan: '{not json' })).toEqual({ ok: false, error: 'plan' });
    expect(validate({ ...good, screenshot: 'data:text/html,<script>' })).toEqual({ ok: false, error: 'screenshot' });
  });
});

describe('buildIssue()', () => {
  it('builds a labelled issue and neutralises mentions and HTML', () => {
    const v = validate(good);
    if (!v.ok) throw new Error();
    const issue = buildIssue(v.report, { screenshotUrl: 'https://x/y.png' });
    expect(issue.title).toBe('[Bug] Belts cross');
    expect(issue.labels).toEqual(['feedback', 'bug']);
    expect(issue.body).not.toContain('@someone');
    expect(issue.body).not.toContain('<b>');
    expect(issue.body).toContain('![screenshot](https://x/y.png)');
    expect(issue.body).toContain('"screw"');
    expect(issue.body).toContain('| version | 0.6.3 |');
  });
});

describe('worker', () => {
  afterEach(() => vi.unstubAllGlobals());
  const env: Env = { GITHUB_TOKEN: 't', GITHUB_REPO: 'o/r', ASSET_BRANCH: 'feedback-assets', ALLOWED_ORIGINS: 'http://tauri.localhost' };
  const post = (body: unknown) =>
    new Request('https://w.example/', { method: 'POST', headers: { origin: 'http://tauri.localhost', 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('creates an issue on GitHub and answers with its number', async () => {
    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string });
      return new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/o/r/issues/42' }), { status: 201 });
    });
    const res = await worker.fetch(post(good), env);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, number: 42 });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://tauri.localhost');
    expect(calls.at(-1)!.url).toBe('https://api.github.com/repos/o/r/issues');
    expect(JSON.parse(calls.at(-1)!.body!).labels).toEqual(['feedback', 'bug']);
  });

  it('refuses invalid reports and respects the rate limit', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}'));
    expect((await worker.fetch(post({ ...good, title: '' }), env)).status).toBe(400);
    const limited = await worker.fetch(post(good), { ...env, LIMITER: { limit: async () => ({ success: false }) } });
    expect(limited.status).toBe(429);
  });
});
