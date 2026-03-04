/** Check if href points to a different route (pathname) than current location. */
export declare function isDifferentRoute(href: string): boolean;

/** Check if an anchor element should be blocked. */
export declare function shouldBlockAnchor(anchor: HTMLAnchorElement): boolean;

/** Initialize the navigation blocker. Returns a teardown handle. */
export declare function initNavBlocker(
  sessionId: string,
  sidecarOrigin: string,
): { teardown: () => void } | undefined;
