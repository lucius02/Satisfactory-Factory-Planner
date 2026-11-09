/**
 * Pure helpers for the feedback worker: validate an incoming report and turn it into a GitHub issue.
 * Kept free of Worker/GitHub APIs so it can be unit-tested.
 */

export type FeedbackKind = 'bug' | 'idea' | 'question';

export interface FeedbackReport {
  kind: FeedbackKind;
  title: string;
  description: string;
  /** Optional e-mail / Discord name of the reporter. */
  contact?: string;
  /** App and system info (version, platform, OS, screen, language). */
  system?: Record<string, string | number | boolean>;
  /** Recent errors / warnings from the app. */
  errors?: string[];
  /** Share code of the factory (JSON). */
  plan?: string;
  /** PNG screenshot of the floor plan as data URL. */
  screenshot?: string;
  /** Honeypot: must stay empty (bots fill every field). */
  website?: string;
}

export const LIMITS = {
  title: 120,
  description: 8000,
  contact: 200,
  errors: 50,
  errorLine: 2000,
  /** Plan JSON larger than this goes to a file in the repo instead of the issue body. */
  planInline: 30_000,
  plan: 2_000_000,
  screenshot: 3_000_000,
};

const KINDS: FeedbackKind[] = ['bug', 'idea', 'question'];

export type Validation = { ok: true; report: FeedbackReport } | { ok: false; error: string };

/** Check and clean a report coming from the app. */
export function validate(input: unknown): Validation {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid body' };
  const r = input as Record<string, unknown>;
  if (typeof r.website === 'string' && r.website.trim()) return { ok: false, error: 'spam' };
  const kind = KINDS.includes(r.kind as FeedbackKind) ? (r.kind as FeedbackKind) : null;
  if (!kind) return { ok: false, error: 'kind' };
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  const description = typeof r.description === 'string' ? r.description.trim() : '';
  if (title.length < 3 || title.length > LIMITS.title) return { ok: false, error: 'title' };
  if (description.length < 5 || description.length > LIMITS.description) return { ok: false, error: 'description' };
  const contact = typeof r.contact === 'string' ? r.contact.trim().slice(0, LIMITS.contact) : undefined;
  const system: Record<string, string | number | boolean> = {};
  if (r.system && typeof r.system === 'object')
    for (const [k, v] of Object.entries(r.system as Record<string, unknown>).slice(0, 30))
      if (['string', 'number', 'boolean'].includes(typeof v)) system[k.slice(0, 40)] = typeof v === 'string' ? v.slice(0, 300) : (v as number | boolean);
  const errors = Array.isArray(r.errors)
    ? r.errors.filter((e): e is string => typeof e === 'string').slice(-LIMITS.errors).map((e) => e.slice(0, LIMITS.errorLine))
    : undefined;
  let plan: string | undefined;
  if (typeof r.plan === 'string' && r.plan.length) {
    if (r.plan.length > LIMITS.plan) return { ok: false, error: 'plan too large' };
    try {
      JSON.parse(r.plan);
    } catch {
      return { ok: false, error: 'plan' };
    }
    plan = r.plan;
  }
  let screenshot: string | undefined;
  if (typeof r.screenshot === 'string' && r.screenshot.length) {
    if (!r.screenshot.startsWith('data:image/png;base64,')) return { ok: false, error: 'screenshot' };
    if (r.screenshot.length > LIMITS.screenshot) return { ok: false, error: 'screenshot too large' };
    screenshot = r.screenshot;
  }
  return { ok: true, report: { kind, title, description, contact: contact || undefined, system, errors, plan, screenshot } };
}

const KIND_LABEL: Record<FeedbackKind, string> = { bug: 'Bug', idea: 'Idee', question: 'Vraag' };

/** Escape text that ends up inside a fenced code block. */
const fence = (s: string) => s.replace(/```/g, '`​``');
/** Neutralise @mentions and HTML in user text so the issue cannot ping people or inject markup. */
const safe = (s: string) => s.replace(/@/g, '@​').replace(/</g, '&lt;');

export interface IssueLinks {
  /** URL of the uploaded screenshot (raw), if any. */
  screenshotUrl?: string;
  /** URL of the uploaded plan file, when too big for the issue body. */
  planUrl?: string;
  /** Attachments that could not be stored (shown in the issue). */
  problems?: string[];
}

/** Build the GitHub issue (title, body, labels). */
export function buildIssue(r: FeedbackReport, links: IssueLinks = {}): { title: string; body: string; labels: string[] } {
  const lines: string[] = [];
  lines.push(safe(r.description), '');
  if (r.contact) lines.push(`**Contact:** ${safe(r.contact)}`, '');
  if (links.screenshotUrl) lines.push('### Plattegrond', '', `![screenshot](${links.screenshotUrl})`, '');
  if (r.system && Object.keys(r.system).length) {
    lines.push('### Systeem', '', '| | |', '|---|---|');
    for (const [k, v] of Object.entries(r.system)) lines.push(`| ${safe(k)} | ${safe(String(v)).replace(/\|/g, '\\|')} |`);
    lines.push('');
  }
  if (r.errors?.length)
    lines.push(`<details><summary>Foutmeldingen (${r.errors.length})</summary>`, '', '```', fence(r.errors.join('\n')), '```', '</details>', '');
  if (r.plan) {
    if (links.planUrl) lines.push(`**Fabrieksplan (deelcode):** [download](${links.planUrl})`, '');
    else if (r.plan.length <= LIMITS.planInline)
      lines.push('<details><summary>Fabrieksplan (deelcode) — plak in "Opslaan / delen" → Laden</summary>', '', '```json', fence(r.plan), '```', '</details>', '');
  }
  if (links.problems?.length) lines.push(`> ⚠️ Bijlage niet opgeslagen: ${links.problems.map(safe).join('; ')}`, '');
  lines.push('---', '_Verstuurd vanuit Satisfactory Factory Planner._');
  return {
    title: `[${KIND_LABEL[r.kind]}] ${r.title}`.slice(0, 200),
    body: lines.join('\n'),
    labels: ['feedback', r.kind],
  };
}
