import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

import { routeConfigs } from "@/app/routes";
import { WorkspaceLoader } from "@/app/WorkspaceLoader";
import { RouteIcon } from "@/shared/ui/RouteIcon";

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
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
    writeSidebarCollapsed(sidebarCollapsed);
  }, [sidebarCollapsed]);

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

  const activeRoute = routeConfigs.find((item) => item.id === route);
  const navItems = routeConfigs.map((item) => {
    const active = item.id === route;
    return (
      <a
        key={item.id}
        aria-current={active ? "page" : undefined}
        className={`workspace-sidebar__link${active ? " workspace-sidebar__link--active" : ""}`}
        data-route-link={item.id}
        href={buildRouteHref(item.id)}
        title={sidebarCollapsed ? item.label : undefined}
        onClick={(event) => {
          event.preventDefault();
          onRouteChange(item.id);
        }}
      >
        <span className="workspace-sidebar__link-icon" aria-hidden="true">
          <RouteIcon routeId={item.id} />
        </span>
        <span className="workspace-sidebar__link-label">{item.label}</span>
      </a>
    );
  });

  const mobileNavItems = routeConfigs.map((item) => {
    const active = item.id === route;
    return (
      <a
        key={item.id}
        aria-current={active ? "page" : undefined}
        className={`workspace-mobile-nav__link${active ? " workspace-mobile-nav__link--active" : ""}`}
        href={buildRouteHref(item.id)}
        onClick={(event) => {
          event.preventDefault();
          setMobileMenuOpen(false);
          onRouteChange(item.id);
        }}
      >
        <span aria-hidden="true">
          <RouteIcon routeId={item.id} />
        </span>
        {item.label}
      </a>
    );
  });

  return (
    <div
      className={`unified-shell unified-shell--sidebar${sidebarCollapsed ? " unified-shell--sidebar-collapsed" : ""}`}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      ref={shellRef}
    >
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
      <aside className="workspace-sidebar" aria-label="Workspace navigation">
        <div className="workspace-sidebar__brand-row">
          <div className="workspace-sidebar__brand" translate="no">
            <span className="workspace-sidebar__brand-mark">A</span>
            <span className="workspace-sidebar__brand-copy">
              <span>AFKBOT</span>
              <strong>Agent UI</strong>
            </span>
          </div>
          <button
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="workspace-sidebar__collapse"
            onClick={() => setSidebarCollapsed((current) => !current)}
            type="button"
          >
            {sidebarCollapsed ? ">" : "<"}
          </button>
        </div>

        <label className="workspace-sidebar__profile">
          <span className="workspace-sidebar__eyebrow">Profile</span>
          <select
            aria-label="Select profile"
            className="select workspace-sidebar__select"
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

        <nav className="workspace-sidebar__nav" aria-label="Workspace sections">
          {navItems}
        </nav>

        <div className="workspace-sidebar__footer">
          <div className="workspace-sidebar__auth" hidden={!authConfigured} id="workspace-auth">
            <span className="workspace-sidebar__eyebrow">Access</span>
            <span className="workspace-sidebar__auth-label" id="workspace-auth-status">{authLabel}</span>
            <button className="button button--ghost button--compact" onClick={onLogout} type="button">
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <section className="workspace-frame">
        <header className="workspace-mobile-bar">
          <button
            aria-controls="workspace-mobile-nav"
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close workspace navigation" : "Open workspace navigation"}
            className="workspace-mobile-bar__menu"
            onClick={() => setMobileMenuOpen((current) => !current)}
            type="button"
          >
            <span />
            <span />
            <span />
          </button>
          <div className="workspace-mobile-bar__title">
            <span>AFKBOT</span>
            <strong>{activeRoute?.label || "Workspace"}</strong>
          </div>
        </header>

        <div
          aria-hidden={!mobileMenuOpen}
          className={`workspace-mobile-nav${mobileMenuOpen ? " workspace-mobile-nav--open" : ""}`}
          id="workspace-mobile-nav"
        >
          <button
            aria-label="Dismiss mobile navigation"
            className="workspace-mobile-nav__backdrop"
            onClick={() => setMobileMenuOpen(false)}
            tabIndex={mobileMenuOpen ? 0 : -1}
            type="button"
          />
          <div aria-label="Workspace navigation" className="workspace-mobile-nav__panel" role="dialog">
            <div className="workspace-mobile-nav__head">
              <strong>AFKBOT</strong>
              <button className="icon-button" aria-label="Close mobile navigation" onClick={() => setMobileMenuOpen(false)} type="button">
                x
              </button>
            </div>
            <label className="workspace-mobile-nav__profile">
              <span className="workspace-sidebar__eyebrow">Profile</span>
              <select
                aria-label="Select mobile profile"
                className="select"
                disabled={profileDisabled}
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
            <nav className="workspace-mobile-nav__links">{mobileNavItems}</nav>
            {authConfigured ? (
              <div className="workspace-mobile-nav__auth">
                <span className="workspace-sidebar__eyebrow">Access</span>
                <span>{authLabel}</span>
                <button className="button button--ghost button--compact" onClick={onLogout} type="button">
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <main className="workspace-shell" id="workspace-main">
          <div id="workspace-error">
            {globalError ? <div className="inline-alert inline-alert--danger">{globalError}</div> : null}
          </div>
          <section className="boot-panel glass-panel" hidden={!booting} id="workspace-boot">
            <WorkspaceLoader />
          </section>
          {routeViews}
        </main>
      </section>

      <div aria-live="polite" className="flash-region" id="workspace-flash">
        {flash ? <div className={`flash flash--${flash.kind}`}>{flash.message}</div> : null}
      </div>
    </div>
  );
}

function readSidebarCollapsed() {
  try {
    return window.localStorage.getItem("afkbotui:sidebar-collapsed") === "true";
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(value: boolean) {
  try {
    window.localStorage.setItem("afkbotui:sidebar-collapsed", value ? "true" : "false");
  } catch {
    // The expanded layout is still usable when storage is unavailable.
  }
}
