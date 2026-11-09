/** Feedback form: type, title, description, optional contact and the data that goes with it. */
import { $ } from '../app/context';
import { buildIssue, validate, type FeedbackKind, type FeedbackReport } from '../../feedback-worker/src/issue';
import { recentErrors, screenshotMap, systemInfo } from '../feedback/collect';
import { t } from '../i18n';
import { exportCode } from '../state/store';
import { esc } from '../util/format';

const ENDPOINT: string = import.meta.env.VITE_FEEDBACK_URL ?? '';

let shot: string | null = null;

function attachRows(): string {
  const errs = recentErrors();
  const row = (id: string, label: string, detail: string, on = true) =>
    `<label class="check"><input type="checkbox" data-att="${id}"${on ? ' checked' : ''}> <span>${label} <span class="sub">${detail}</span></span></label>`;
  return (
    row('plan', t('fbPlan'), t('fbPlanSub')) +
    row('system', t('fbSystem'), t('fbSystemSub')) +
    row('errors', t('fbErrors'), t('fbErrorsSub', errs.length)) +
    row('screenshot', t('fbShot'), shot ? '' : t('fbShotNone'), !!shot)
  );
}

async function openForm(): Promise<void> {
  shot = await screenshotMap();
  $('#fbAtt').innerHTML = attachRows();
  const prev = $('#fbShotPrev');
  prev.innerHTML = shot ? `<img src="${shot}" alt="" class="max-h-32 rounded border border-line">` : '';
  $('#fbMsg').textContent = '';
  $('#fbMsg').className = 'mr-auto text-[12.5px] text-muted';
  ($('#fbSend') as HTMLButtonElement).disabled = false;
  $('#fbModal').hidden = false;
  $<HTMLInputElement>('#fbTitle').focus();
}

function collect(): FeedbackReport {
  const on = (id: string) => $<HTMLInputElement>(`#fbAtt [data-att="${id}"]`).checked;
  return {
    kind: $<HTMLSelectElement>('#fbKind').value as FeedbackKind,
    title: $<HTMLInputElement>('#fbTitle').value,
    description: $<HTMLTextAreaElement>('#fbDesc').value,
    contact: $<HTMLInputElement>('#fbContact').value || undefined,
    website: $<HTMLInputElement>('#fbWebsite').value,
    plan: on('plan') ? exportCode() : undefined,
    system: on('system') ? { ...systemInfo(), screenshot: shot ? (on('screenshot') ? 'sent' : 'not included') : 'could not be made' } : undefined,
    errors: on('errors') ? recentErrors() : undefined,
    screenshot: on('screenshot') && shot ? shot : undefined,
  };
}

function setMsg(text: string, kind: 'ok' | 'bad' | 'info'): void {
  const m = $('#fbMsg');
  m.innerHTML = text;
  m.className = `mr-auto text-[12.5px] ${kind === 'ok' ? 'text-accent2' : kind === 'bad' ? 'text-bad' : 'text-muted'}`;
}

async function send(): Promise<void> {
  const report = collect();
  const v = validate(report);
  if (!v.ok) {
    setMsg(t(v.error === 'title' ? 'fbNeedTitle' : v.error === 'description' ? 'fbNeedDesc' : 'fbInvalid'), 'bad');
    return;
  }
  if (!ENDPOINT) {
    // not configured: copy the report as Markdown so it can be pasted into a GitHub issue by hand
    const issue = buildIssue({ ...v.report, screenshot: undefined });
    try {
      await navigator.clipboard.writeText(`# ${issue.title}\n\n${issue.body}`);
      setMsg(t('fbCopied'), 'info');
    } catch {
      setMsg(t('fbNoEndpoint'), 'bad');
    }
    return;
  }
  const btn = $('#fbSend') as HTMLButtonElement;
  btn.disabled = true;
  setMsg(t('fbSending'), 'info');
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(res.status === 429 ? t('fbRate') : data.error || `HTTP ${res.status}`);
    // no issue number for the user, just a thank-you that fits the kind of report
    setMsg(esc(t(report.kind === 'idea' ? 'fbThanksIdea' : report.kind === 'question' ? 'fbThanksQuestion' : 'fbThanksBug')), 'ok');
    $<HTMLInputElement>('#fbTitle').value = '';
    $<HTMLTextAreaElement>('#fbDesc').value = '';
  } catch (err) {
    btn.disabled = false;
    setMsg(esc(t('fbFailed', err instanceof Error ? err.message : String(err))), 'bad');
  }
}

export function bindFeedback(): void {
  $('#btnFeedback').onclick = () => void openForm();
  $('#fbClose').onclick = () => ($('#fbModal').hidden = true);
  $('#fbSend').onclick = () => void send();
  $('#fbModal').addEventListener('click', (e) => {
    if (e.target === $('#fbModal')) $('#fbModal').hidden = true;
  });
  $('#fbAtt').addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.att === 'screenshot') $('#fbShotPrev').hidden = !el.checked;
  });
}
