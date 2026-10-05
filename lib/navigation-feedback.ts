// UI feedback only: never stores session, permissions or page data.
let current: HTMLAnchorElement | null = null;
let previousBusy: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export function finishNavigationFeedback() {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  if (current) {
    current.removeAttribute("data-navigation-intent");
    if (previousBusy === null) current.removeAttribute("aria-busy");
    else current.setAttribute("aria-busy", previousBusy);
  }
  current = null;
  previousBusy = null;
}

export function beginNavigationFeedback(link: HTMLAnchorElement | null) {
  finishNavigationFeedback();
  if (!link) return;
  const source = new URL(link.ownerDocument.location.href);
  const target = new URL(link.href, source);
  if (target.origin !== source.origin ||
      (target.pathname === source.pathname && target.search === source.search)) return;
  current = link;
  previousBusy = link.getAttribute("aria-busy");
  // Set synchronously before Next starts the server navigation, without an await.
  link.setAttribute("data-navigation-intent", "true");
  link.setAttribute("aria-busy", "true");
  // Failed/cancelled navigations must not leave a permanent selection.
  timer = setTimeout(finishNavigationFeedback, 15000);
}
