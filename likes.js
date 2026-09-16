(() => {
  document.querySelectorAll('.like-button').forEach((button) => {
    const caseId = button.dataset.likeKey;
    const legacyKey = `portfolioLike:${caseId}:liked`;
    const countNode = button.querySelector('.like-button__count');
    const status = document.createElement('span');
    status.className = 'like-status';
    status.setAttribute('role', 'status');
    button.after(status);
    let liked = false;
    let ready = false;
    let busy = false;
    // Retain the desired state after an uncertain network result, so retrying
    // cannot accidentally undo a write that reached the server.
    let pendingState;

    function render(data) {
      liked = data.liked;
      countNode.textContent = String(data.count);
      button.classList.toggle('is-liked', liked);
      button.setAttribute('aria-pressed', String(liked));
      button.setAttribute('aria-label', liked ? 'Убрать лайк с кейса' : 'Поставить лайк кейсу');
    }

    async function request(desired) {
      const writing = typeof desired === 'boolean';
      const response = await fetch(writing ? '/api/likes' : `/api/likes?case=${encodeURIComponent(caseId)}`, {
        method: writing ? 'POST' : 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        ...(writing ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ case: caseId, liked: desired }) } : {}),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error('Likes unavailable');
      const data = await response.json();
      if (!Number.isSafeInteger(data.count) || data.count < 0 || typeof data.liked !== 'boolean') throw new Error('Invalid likes');
      return data;
    }

    function clearLegacy() {
      try {
        localStorage.removeItem(legacyKey);
        localStorage.removeItem(`portfolioLike:${caseId}`);
      } catch { /* Server persistence works independently of localStorage. */ }
    }

    async function sync(clicked = false) {
      if (busy) return;
      busy = true;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      status.textContent = '';
      try {
        if (!ready) {
          render(await request());
          ready = true;
          try {
            if (localStorage.getItem(legacyKey) === 'true') pendingState = true;
          } catch { /* Local storage may be blocked. */ }
        } else if (clicked && pendingState === undefined) {
          pendingState = !liked;
        } else if (!clicked && pendingState === undefined) {
          render(await request());
        }
        if (pendingState !== undefined) {
          render(await request(pendingState));
          pendingState = undefined;
          clearLegacy();
        }
      } catch {
        status.textContent = pendingState !== undefined
          ? 'Не удалось подтвердить сохранение лайка. Нажмите, чтобы повторить.'
          : 'Не удалось загрузить лайки. Нажмите, чтобы повторить.';
      } finally {
        busy = false;
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
      }
    }

    countNode.textContent = '—';
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => sync(true));
    window.addEventListener('pageshow', () => sync());
    window.addEventListener('focus', () => sync());
    window.addEventListener('online', () => sync());
    sync();
  });
})();
