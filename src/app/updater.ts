/** Tauri auto-updater: checks GitHub releases on start-up and offers to install a new version. */
import { t } from '../i18n';
import { esc } from '../util/format';

const isTauri = (): boolean => '__TAURI_INTERNALS__' in window;

export async function checkForUpdates(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return;
    showBanner(update.version, async (setStatus) => {
      let total = 0;
      let done = 0;
      await update.downloadAndInstall((ev) => {
        if (ev.event === 'Started') total = ev.data.contentLength ?? 0;
        else if (ev.event === 'Progress') {
          done += ev.data.chunkLength;
          if (total) setStatus(t('updDownloading', Math.round((done / total) * 100) + '%'));
        } else if (ev.event === 'Finished') setStatus(t('updInstalling'));
      });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    });
  } catch (err) {
    console.warn('Update check failed', err);
  }
}

function showBanner(version: string, install: (setStatus: (s: string) => void) => Promise<void>): void {
  const el = document.createElement('div');
  el.className =
    'fixed right-4 bottom-4 z-20 w-[320px] rounded-xl border border-accent bg-panel p-3.5 shadow-[0_10px_30px_rgba(0,0,0,.5)]';
  el.innerHTML = `<b class="font-head text-lg">${esc(t('updAvailable', version))}</b>
    <p class="note mt-1" data-status>${esc(t('updAsk'))}</p>
    <div class="mt-2.5 flex justify-end gap-2"><button class="btn btn-sm" data-later>${esc(t('updLater'))}</button>
    <button class="btn btn-sm btn-primary" data-install>${esc(t('updInstall'))}</button></div>`;
  document.body.append(el);
  const status = el.querySelector<HTMLElement>('[data-status]')!;
  el.querySelector<HTMLButtonElement>('[data-later]')!.onclick = () => el.remove();
  el.querySelector<HTMLButtonElement>('[data-install]')!.onclick = async (e) => {
    el.querySelectorAll('button').forEach((b) => (b.disabled = true));
    (e.target as HTMLButtonElement).textContent = '…';
    try {
      await install((s) => (status.textContent = s));
    } catch (err) {
      status.textContent = t('updFailed', String(err));
      el.querySelector<HTMLButtonElement>('[data-later]')!.disabled = false;
    }
  };
}
