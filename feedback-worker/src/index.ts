/**
 * Feedback relay (Cloudflare Worker). The app POSTs a report here; the worker validates it, rate-limits
 * per IP, stores a screenshot / large plan in a branch of the repo and opens a GitHub issue.
 * The GitHub token only lives here as a secret, never in the app.
 */
import { buildIssue, validate, type IssueLinks } from './issue';

export interface Env {
  /** Fine-grained PAT with "Issues: read/write" and "Contents: read/write" on GITHUB_REPO (secret). */
  GITHUB_TOKEN: string;
  /** "owner/name" of the repo that receives the issues. */
  GITHUB_REPO: string;
  /** Branch for screenshots and large plans (created when missing). */
  ASSET_BRANCH: string;
  /** Comma-separated allowed origins for CORS ("*" = all). */
  ALLOWED_ORIGINS: string;
  /** Cloudflare rate limiting binding (optional). */
  LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}

const json = (data: unknown, status: number, headers: HeadersInit) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'access-control-allow-origin': ok ? origin || '*' : allowed[0] ?? '',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

async function gh(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'satisfactory-factory-planner-feedback',
      ...(init.headers ?? {}),
    },
  });
}

/** Make sure the asset branch exists (branched from the default branch). */
async function ensureBranch(env: Env): Promise<void> {
  const r = await gh(env, `/repos/${env.GITHUB_REPO}/git/ref/heads/${env.ASSET_BRANCH}`);
  if (r.ok) return;
  const repo = (await (await gh(env, `/repos/${env.GITHUB_REPO}`)).json()) as { default_branch: string };
  const base = (await (await gh(env, `/repos/${env.GITHUB_REPO}/git/ref/heads/${repo.default_branch}`)).json()) as {
    object: { sha: string };
  };
  await gh(env, `/repos/${env.GITHUB_REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${env.ASSET_BRANCH}`, sha: base.object.sha }),
  });
}

/** Store a file in the asset branch; returns a URL that renders for people with access to the repo. */
async function upload(env: Env, path: string, base64: string, message: string): Promise<string | undefined> {
  const r = await gh(env, `/repos/${env.GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: base64, branch: env.ASSET_BRANCH }),
  });
  if (!r.ok) return undefined;
  return `https://github.com/${env.GITHUB_REPO}/blob/${env.ASSET_BRANCH}/${path}?raw=true`;
}

const toBase64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (req.method !== 'POST') return json({ error: 'method' }, 405, h);

    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
    if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success) return json({ error: 'rate limit' }, 429, h);
    if (Number(req.headers.get('content-length') ?? 0) > 6_000_000) return json({ error: 'too large' }, 413, h);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'json' }, 400, h);
    }
    const v = validate(body);
    if (!v.ok) return json({ error: v.error }, 400, h);
    const r = v.report;

    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
    const links: IssueLinks = {};
    try {
      if (r.screenshot || (r.plan && r.plan.length > 30_000)) await ensureBranch(env);
      if (r.screenshot)
        links.screenshotUrl = await upload(env, `feedback/${id}.png`, r.screenshot.split(',')[1], `feedback ${id}: screenshot`);
      if (r.plan && r.plan.length > 30_000)
        links.planUrl = await upload(env, `feedback/${id}.json`, toBase64(r.plan), `feedback ${id}: plan`);
    } catch {
      /* attachments are best effort; the issue still gets created */
    }

    const issue = buildIssue(r, links);
    const res = await gh(env, `/repos/${env.GITHUB_REPO}/issues`, { method: 'POST', body: JSON.stringify(issue) });
    if (!res.ok) return json({ error: 'github', status: res.status }, 502, h);
    const created = (await res.json()) as { number: number; html_url: string };
    return json({ ok: true, number: created.number, url: created.html_url }, 201, h);
  },
};
