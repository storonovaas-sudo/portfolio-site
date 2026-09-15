(() => {
  const loaderSessionKey = "portfolioLoaderSeen";
  const navigationEntry = performance.getEntriesByType("navigation")[0];
  const isReload = navigationEntry?.type === "reload";
  let isInternalNavigation = false;

  try {
    isInternalNavigation = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
  } catch {
    // An invalid or unavailable referrer means this is treated as a new visit.
  }

  if (isInternalNavigation && !isReload) {
    return;
  }

  try {
    const loaderWasShown = window.sessionStorage.getItem(loaderSessionKey) === "true";

    if (loaderWasShown && !isReload) {
      return;
    }

    window.sessionStorage.setItem(loaderSessionKey, "true");
  } catch {
    // When session storage is unavailable, keep the loader available on page load.
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const loader = document.createElement("div");

  loader.className = "site-loader";
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  loader.setAttribute("aria-label", "Загружаем сайт");
  loader.innerHTML = `
    <div class="site-loader__content">
      <span class="site-loader__value" aria-hidden="true">0</span><span class="site-loader__sign" aria-hidden="true">%</span>
      <span class="visually-hidden">Загружаем сайт</span>
    </div>
  `;

  document.body.prepend(loader);
  document.body.classList.add("is-site-loading");

  const value = loader.querySelector(".site-loader__value");
  const startedAt = performance.now();
  const initialPause = reducedMotion ? 0 : 180;
  const minimumDuration = reducedMotion ? 0 : 2300;
  const loadingDuration = reducedMotion ? 0 : 2150;
  let displayedProgress = 0;
  let pageReady = document.readyState === "complete";
  let completed = false;

  const renderProgress = (progress) => {
    displayedProgress = Math.round(progress);
    value.textContent = String(displayedProgress).padStart(2, "0");
  };

  const revealPage = () => {
    if (completed) {
      return;
    }

    completed = true;
    renderProgress(100);

    window.setTimeout(
      () => {
        loader.classList.add("site-loader--leaving");
        document.body.classList.remove("is-site-loading");
      },
      reducedMotion ? 0 : 140,
    );

    window.setTimeout(() => loader.remove(), reducedMotion ? 0 : 900);
  };

  const finishWhenReady = () => {
    const elapsed = performance.now() - startedAt;
    const delay = Math.max(0, minimumDuration - elapsed);

    window.setTimeout(revealPage, delay);
  };

  const updateProgress = (now) => {
    if (completed) {
      return;
    }

    const elapsed = now - startedAt;
    const fraction = Math.min(1, Math.max(0, elapsed - initialPause) / loadingDuration);
    renderProgress(92 * fraction ** 1.45);

    if (pageReady && elapsed >= minimumDuration) {
      finishWhenReady();
      return;
    }

    window.requestAnimationFrame(updateProgress);
  };

  window.addEventListener(
    "load",
    () => {
      pageReady = true;
    },
    { once: true },
  );

  window.addEventListener(
    "pageshow",
    (event) => {
      if (event.persisted) {
        loader.remove();
        document.body.classList.remove("is-site-loading");
      }
    },
    { once: true },
  );

  window.setTimeout(revealPage, 6000);
  window.requestAnimationFrame(updateProgress);
})();
