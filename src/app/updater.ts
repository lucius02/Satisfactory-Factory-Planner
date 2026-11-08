/**
 * Tauri auto-updater. Checks GitHub releases at start-up and every hour, downloads a new version
 * silently in the background and installs it when the app is closed (or right away via
 * "Restart now"). Updates are signed; the app only installs files signed with our key.
 */
import { t } from '../i18n';
import { esc } from '../util/format';

const CHECK_EVERY_MS = 60 * 60 * 1000;
const isTauri = (): boolean => '__TAURI_INTERNALS__' in window;

type Update = Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>>;
let ready: NonNullable<Update> | null = null;
let busy = false;

export async function startAutoUpdate(): Promise<void> {
  if (!isTauri()) return;
  await installOnClose();
  void checkAndDownload();
  setInterval(() => void checkAndDownload(), CHECK_EVERY_MS);
}

async function checkAndDownload(): Promise<void> {
  if (busy || ready) return;
  busy = true;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return;
    await update.download();
    ready = update;
    showReady(update.version);
  } catch (err) {
    console.warn('Update check failed', err);
  } finally {
    busy = false;
  }
}

/** Install a downloaded update when the window is closed. */
async function installOnClose(): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  await win.onCloseRequested(async (e) => {
    if (!ready) return;
    e.preventDefault();
    try {
      await ready.install(); // on Windows the installer takes over and closes the app
    } catch (err) {
      console.warn('Update install failed', err);
    }
    ready = null;
    await win.destroy();
  });
}

async function installNow(): Promise<void> {
  if (!ready) return;
  await ready.install();
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}

function showReady(version: string): void {
  document.getElementById('updToast')?.remove();
  const el = document.createElement('div');
  el.id = 'updToast';
  el.className = 'fixed right-4 bottom-4 z-20 w-[320px] rounded-xl border border-accent bg-panel p-3.5 shadow-[0_10px_30px_rgba(0,0,0,.5)]';
  el.innerHTML = `<b class="font-head text-lg">${esc(t('updReady', version))}</b>
    <p class="note mt-1" data-status>${esc(t('updOnClose'))}</p>
    <div class="mt-2.5 flex justify-end gap-2"><button class="btn btn-sm" data-later>${esc(t('updLater'))}</button>
    <button class="btn btn-sm btn-primary" data-now>${esc(t('updRestart'))}</button></div>`;
  document.body.append(el);
  el.querySelector<HTMLButtonElement>('[data-later]')!.onclick = () => el.remove();
  el.querySelector<HTMLButtonElement>('[data-now]')!.onclick = async () => {
    el.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      await installNow();
    } catch (err) {
      el.querySelector('[data-status]')!.textContent = t('updFailed', String(err));
      el.querySelector<HTMLButtonElement>('[data-later]')!.disabled = false;
    }
  };
}
