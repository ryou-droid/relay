/* Public launch UI only. No session, personal data, storage or Auth token handling. */
(() => {
  let started = false;
  let interrupted = false;
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) interrupted = true;
  });
  function launch() {
    if (started || interrupted) return;
    if (!navigator.onLine) {
      document.getElementById("launch-status").textContent = "オフラインです。接続を確認してください。";
      return;
    }
    started = true;
    // Let the cached skeleton paint before requesting the protected page.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!interrupted) location.replace("/app?__relay_start=1");
    }));
  }
  window.addEventListener("online", launch);
  launch();
})();
