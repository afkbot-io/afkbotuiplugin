import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

import { routeConfigs } from "@/app/routes";
import { WorkspaceLoader } from "@/app/WorkspaceLoader";

type Profile = {
  id?: string | null;
  title?: string | null;
};

type FlashState = {
  kind: string;
  message: string;
};

type AppShellProps = {
  authConfigured: boolean;
  authLabel: string;
  booting: boolean;
  flash: FlashState | null;
  globalError: string;
  onLogout: () => void;
  onProfileChange: (profileId: string) => void;
  onRouteChange: (routeId: (typeof routeConfigs)[number]["id"]) => void;
  profileDisabled: boolean;
  profiles: Profile[];
  route: (typeof routeConfigs)[number]["id"];
  routeViews: ReactNode;
  selectedProfileId: string;
};

export function AppShell({
  authConfigured,
  authLabel,
  booting,
  flash,
  globalError,
  onLogout,
  onProfileChange,
  onRouteChange,
  profileDisabled,
  profiles,
  route,
  routeViews,
  selectedProfileId,
}: AppShellProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const setAmbientPosition = useCallback((clientX: number, clientY: number) => {
    if (!shellRef.current) {
      return;
    }
    const rect = shellRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      shellRef.current.style.setProperty("--ambient-x", "62%");
      shellRef.current.style.setProperty("--ambient-y", "18%");
      return;
    }
    const x = `${((clientX - rect.left) / rect.width) * 100}%`;
    const y = `${((clientY - rect.top) / rect.height) * 100}%`;
    shellRef.current.style.setProperty("--ambient-x", x);
    shellRef.current.style.setProperty("--ambient-y", y);
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
    const { clientX, clientY } = event;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      setAmbientPosition(clientX, clientY);
    });
  }, [setAmbientPosition]);

  const handlePointerLeave = useCallback(() => {
    setAmbientPosition(window.innerWidth * 0.62, window.innerHeight * 0.18);
  }, [setAmbientPosition]);

  useEffect(() => {
    handlePointerLeave();
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [handlePointerLeave]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [route]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const buildRouteHref = useCallback(
    (routeId: (typeof routeConfigs)[number]["id"]) => {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", routeId);
      if (selectedProfileId) {
        url.searchParams.set("profile", selectedProfileId);
      }
      return `${url.pathname}${url.search}${url.hash}`;
    },
    [selectedProfileId],
  );

  return (
    <div className="unified-shell" onPointerLeave={handlePointerLeave} onPointerMove={handlePointerMove} ref={shellRef}>
      <div aria-hidden="true" className="workspace-ambient">
        <span className="workspace-ambient__glow workspace-ambient__glow--pointer" />
        <span className="workspace-ambient__glow workspace-ambient__glow--orange" />
        <span className="workspace-ambient__glow workspace-ambient__glow--blue" />
        <span className="workspace-ambient__mesh" />
        <span className="workspace-ambient__noise" />
        <span className="workspace-ambient__vignette" />
      </div>
      <a className="skip-link" href="#workspace-main">
        Skip to Content
      </a>
      <header className="topbar">
        <div className="topbar__shell">
          <div className="topbar__brand" translate="no">
            <span className="topbar__brand-lockup">
              <span className="topbar__bracket">[</span>
              <span className="topbar__brand-text">AFKBOT</span>
              <span className="topbar__bracket">]</span>
            </span>
            <span className="topbar__badge">BETA</span>
          </div>
          <nav className="topbar__tabs" aria-label="Workspace sections">
            {routeConfigs.map((item) => {
              const active = item.id === route;
              return (
                <a
                  key={item.id}
                  aria-current={active ? "page" : undefined}
                  className={`tab-button${active ? " tab-button--active" : ""}`}
                  data-route-link={item.id}
                  href={buildRouteHref(item.id)}
                  onClick={(event) => {
                    event.preventDefault();
                    onRouteChange(item.id);
                  }}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
          <div className="topbar__controls">
            <div className="topbar__selectors">
              <label className="topbar__field">
                <span className="topbar__label">Profile</span>
                <select
                  aria-label="Select profile"
                  className="select topbar__select"
                  disabled={profileDisabled}
                  id="workspace-profile-switch"
                  onChange={(event) => onProfileChange(event.target.value)}
                  value={selectedProfileId}
                >
                  {profiles.map((profile) => (
                    <option key={profile.id || ""} value={profile.id || ""}>
                      {profile.title || profile.id || "Untitled"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="topbar__session" hidden={!authConfigured} id="workspace-auth">
              <div className="topbar__session-copy">
                <span className="topbar__label">Access</span>
                <span className="topbar__session-status" id="workspace-auth-status">
                  {authLabel}
                </span>
              </div>
              <button className="button button--ghost button--compact" onClick={onLogout} type="button">
                Sign out
              </button>
            </div>
          </div>
          <button
            aria-controls="workspace-mobile-nav"
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close workspace navigation" : "Open workspace navigation"}
            className={`topbar__menu-button${mobileMenuOpen ? " topbar__menu-button--open" : ""}`}
            onClick={() => setMobileMenuOpen((current) => !current)}
            type="button"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
        <div
          aria-hidden={!mobileMenuOpen}
          className={`topbar__mobile-sheet${mobileMenuOpen ? " topbar__mobile-sheet--open" : ""}`}
          id="workspace-mobile-nav"
        >
          <button
            aria-hidden="true"
            className="topbar__mobile-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            tabIndex={-1}
            type="button"
          />
          <div aria-label="Workspace navigation" className="topbar__mobile-panel" role="dialog">
            <div className="topbar__mobile-panel-head">
              <button
                aria-label="Close mobile navigation"
                className="icon-button topbar__mobile-close"
                onClick={() => setMobileMenuOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <nav className="topbar__mobile-nav">
              {routeConfigs.map((item) => {
                const active = item.id === route;
                return (
                  <a
                    key={item.id}
                    aria-current={active ? "page" : undefined}
                    className={`topbar__mobile-link${active ? " topbar__mobile-link--active" : ""}`}
                    href={buildRouteHref(item.id)}
                    onClick={(event) => {
                      event.preventDefault();
                      setMobileMenuOpen(false);
                      onRouteChange(item.id);
                    }}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>
            {authConfigured ? (
              <div className="topbar__mobile-session">
                <div className="topbar__mobile-session-copy">
                  <span className="topbar__label">Access</span>
                  <span className="topbar__session-status">{authLabel}</span>
                </div>
                <button className="button button--ghost button--compact" onClick={onLogout} type="button">
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="workspace-shell" id="workspace-main">
        <div id="workspace-error">
          {globalError ? <div className="inline-alert inline-alert--danger">{globalError}</div> : null}
        </div>
        <section className="boot-panel glass-panel" hidden={!booting} id="workspace-boot">
          <WorkspaceLoader />
        </section>
        {routeViews}
      </main>

      <div aria-live="polite" className="flash-region" id="workspace-flash">
        {flash ? <div className={`flash flash--${flash.kind}`}>{flash.message}</div> : null}
      </div>
    </div>
  );
}
