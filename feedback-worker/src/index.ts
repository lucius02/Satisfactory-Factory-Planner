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

/**
 * Branch to store attachments in: the asset branch (created from the default branch when missing).
 * An empty repo has no branch to start from; then the file goes to the default branch (first commit).
 */
async function assetBranch(env: Env): Promise<string | null> {
  if ((await gh(env, `/repos/${env.GITHUB_REPO}/git/ref/heads/${env.ASSET_BRANCH}`)).ok) return env.ASSET_BRANCH;
  const repoRes = await gh(env, `/repos/${env.GITHUB_REPO}`);
  if (!repoRes.ok) throw new Error(`repo ${repoRes.status}`);
  const repo = (await repoRes.json()) as { default_branch: string };
  const baseRes = await gh(env, `/repos/${env.GITHUB_REPO}/git/ref/heads/${repo.default_branch}`);
  if (!baseRes.ok) return null; // empty repo
  const base = (await baseRes.json()) as { object: { sha: string } };
  const made = await gh(env, `/repos/${env.GITHUB_REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${env.ASSET_BRANCH}`, sha: base.object.sha }),
  });
  if (!made.ok && made.status !== 422) throw new Error(`branch ${made.status}`); // 422 = already exists
  return env.ASSET_BRANCH;
}

/** Store a file; returns a URL that renders for people with access to the repo. Throws with the reason. */
async function upload(env: Env, branch: string | null, path: string, base64: string, message: string): Promise<string> {
  const r = await gh(env, `/repos/${env.GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify(branch ? { message, content: base64, branch } : { message, content: base64 }),
  });
  if (!r.ok) throw new Error(`upload ${r.status}`);
  const ref = branch ?? ((await r.json()) as { commit?: { sha?: string } }).commit?.sha ?? 'HEAD';
  return `https://github.com/${env.GITHUB_REPO}/blob/${ref}/${path}?raw=true`;
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
    // attachments are best effort: the issue is always created, with a note when an upload failed
    const problems: string[] = [];
    const bigPlan = !!r.plan && r.plan.length > 30_000;
    if (r.screenshot || bigPlan) {
      let branch: string | null = null;
      try {
        branch = await assetBranch(env);
      } catch (e) {
        problems.push(`branch: ${e instanceof Error ? e.message : e}`);
      }
      if (r.screenshot)
        try {
          links.screenshotUrl = await upload(env, branch, `feedback/${id}.png`, r.screenshot.split(',')[1], `feedback ${id}: screenshot`);
        } catch (e) {
          problems.push(`screenshot: ${e instanceof Error ? e.message : e}`);
        }
      if (bigPlan)
        try {
          links.planUrl = await upload(env, branch, `feedback/${id}.json`, toBase64(r.plan!), `feedback ${id}: plan`);
        } catch (e) {
          problems.push(`plan: ${e instanceof Error ? e.message : e}`);
        }
    }
    if (problems.length) {
      links.problems = problems;
      console.warn('attachment problems', problems);
    }

    const issue = buildIssue(r, links);
    const res = await gh(env, `/repos/${env.GITHUB_REPO}/issues`, { method: 'POST', body: JSON.stringify(issue) });
    if (!res.ok) return json({ error: 'github', status: res.status }, 502, h);
    const created = (await res.json()) as { number: number; html_url: string };
    return json({ ok: true, number: created.number, url: created.html_url }, 201, h);
  },
};
