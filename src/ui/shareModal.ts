import { $, ctx } from '../app/context';
import { refreshAll } from '../app/controller';
import { t } from '../i18n';
import { exportCode, importCode, replaceState } from '../state/store';

export function bindShareModal(): void {
  const modal = $('#shareModal');
  const io = $<HTMLTextAreaElement>('#io');
  const msg = $('#ioMsg');
  $('#btnExport').onclick = () => {
    io.value = exportCode();
    msg.textContent = '';
    modal.hidden = false;
    io.focus();
    io.select();
  };
  $('#ioClose').onclick = () => (modal.hidden = true);
  $('#ioCopy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(io.value);
      msg.textContent = t('copied');
    } catch {
      io.focus();
      io.select();
      msg.textContent = t('copyFail');
    }
  };
  $('#ioLoad').onclick = () => {
    try {
      replaceState(importCode(io.value));
      ctx.sel = null;
      refreshAll({ fit: true });
      modal.hidden = true;
    } catch {
      msg.textContent = t('loadFail');
    }
  };
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });
}
