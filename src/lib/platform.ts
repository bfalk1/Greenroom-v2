// Which surface a session is running on. The Electron desktop app renders
// this same site inside its shell, so "app vs website" is a runtime check,
// not a separate codebase: the preload's window.greenroom API is the
// authoritative signal, with the Electron user-agent token as fallback for
// the window before the preload has attached (same two signals AppShell uses
// to pick the desktop layout).

export type Platform = "desktop_app" | "web";

export function isDesktopApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as { greenroom?: { isDesktop?: boolean } };
  return (
    !!w.greenroom?.isDesktop ||
    navigator.userAgent.toLowerCase().includes("electron")
  );
}

export function currentPlatform(): Platform {
  return isDesktopApp() ? "desktop_app" : "web";
}
