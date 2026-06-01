import { useMutation, useQuery } from "@tanstack/react-query";
import { Suspense, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/app/AppShell";
import { routeConfigs } from "@/app/routes";
import { ApiClient } from "@/shared/api/client";
import { useRouteState } from "@/shared/hooks/use-route-state";
import { buildLoginUrl, readCurrentUiUrl, scheduleWindowRedirect } from "@/shared/lib/url-state";
import { SurfaceLoader } from "@/shared/ui/SurfaceLoader";
import {
  AUTH_SESSION_REFRESH_MS,
  defaultConfig,
  normalizeAuthState,
  normalizeConfig,
  normalizeError,
  resolveProfileId,
} from "@/shared/lib/workspace";

type FlashState = {
  kind: string;
  message: string;
};

const LAST_PROFILE_STORAGE_KEY = "afkbotui:last-profile-id";

export function App() {
  const routeState = useRouteState();
  const [authRedirecting, setAuthRedirecting] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [configState, setConfigState] = useState(defaultConfig);
  const [mountedRoutes, setMountedRoutes] = useState(() => new Set([routeState.route]));
  const [selectedProfileId, setSelectedProfileId] = useState(routeState.profileId || readLastSelectedProfileId());
  const [flash, setFlash] = useState<FlashState | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const body = document.body;
  const apiBase = body.dataset.apiBase || __API_BASE_PATH__;
  const webBase = body.dataset.webBase || __WEB_BASE_PATH__;

  const beginAuthRedirect = useCallback(() => {
    if (authRedirecting) {
      return;
    }
    setAuthRedirecting(true);
    setGlobalError("Authentication required. Redirecting to login…");
    const current = readCurrentUiUrl();
    const next = current.startsWith("/") ? current : webBase;
    scheduleWindowRedirect(buildLoginUrl(next));
  }, [authRedirecting, webBase]);

  const api = useMemo(
    () =>
      new ApiClient(apiBase, {
        onUnauthorized: () => beginAuthRedirect(),
      }),
    [apiBase, beginAuthRedirect],
  );

  const authQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: async () => {
      try {
        return await api.getAuthSession();
      } catch (error: unknown) {
        if ((error as { status?: number })?.status === 404) {
          const authError = new Error(
            `AFKBOT UI ${__APP_VERSION__} requires AFKBOT 1.9.9+ with the core auth, automation webhook reveal, and Task Flow employee/org-chart surfaces available.`,
          );
          (authError as Error & { code: string; status: number }).code = "ui_auth_endpoint_missing";
          (authError as Error & { code: string; status: number }).status = 404;
          throw authError;
        }
        throw error;
      }
    },
    refetchInterval: (query) => (query.state.data?.auth?.configured ? AUTH_SESSION_REFRESH_MS : false),
    refetchOnWindowFocus: true,
  });

  const authState = normalizeAuthState(authQuery.data?.auth);
  const session = authQuery.data?.authenticated ? authQuery.data.session || null : null;
  const authEndpointMissing = (authQuery.error as { code?: string } | null)?.code === "ui_auth_endpoint_missing";

  useEffect(() => {
    if (authState.configured && authQuery.data && !authQuery.data.authenticated) {
      beginAuthRedirect();
    }
  }, [authQuery.data, authState.configured, beginAuthRedirect]);

  const configQuery = useQuery({
    queryKey: ["config"],
    enabled: authQuery.isSuccess && !authRedirecting && (!authState.configured || Boolean(authQuery.data?.authenticated)),
    queryFn: async () => api.getConfig(),
  });

  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    enabled: authQuery.isSuccess && !authRedirecting && (!authState.configured || Boolean(authQuery.data?.authenticated)),
    queryFn: async () => api.listProfiles(),
  });

  useEffect(() => {
    if (configQuery.data) {
      const normalized = normalizeConfig(configQuery.data.config || configQuery.data.plugin_config?.config || defaultConfig);
      setConfigState(normalized);
    }
  }, [configQuery.data]);

  const profiles = useMemo(() => profilesQuery.data?.profiles || [], [profilesQuery.data]);

  useEffect(() => {
    if (!profiles.length) {
      return;
    }
    const resolved = resolveProfileId(profiles, routeState.profileId || selectedProfileId || configState.default_profile_id);
    if (resolved && resolved !== selectedProfileId) {
      startTransition(() => {
        setSelectedProfileId(resolved);
      });
      routeState.setProfile(resolved, { replace: true });
    } else if (resolved && !routeState.profileId) {
      routeState.setProfile(resolved, { replace: true });
    }
  }, [configState.default_profile_id, profiles, routeState, selectedProfileId]);

  useEffect(() => {
    if (!routeState.profileId || routeState.profileId === selectedProfileId) {
      return;
    }
    setSelectedProfileId(routeState.profileId);
  }, [routeState.profileId, selectedProfileId]);

  useEffect(() => {
    if (selectedProfileId) {
      writeLastSelectedProfileId(selectedProfileId);
    }
  }, [selectedProfileId]);

  useEffect(() => {
    setMountedRoutes((current) => {
      if (current.has(routeState.route)) {
        return current;
      }
      return new Set([...current, routeState.route]);
    });
  }, [routeState.route]);

  const updateConfigMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const response = await api.updateConfig(patch);
      return normalizeConfig(response.config || response.plugin_config?.config || configState);
    },
    onSuccess(nextConfig) {
      setConfigState(nextConfig);
    },
  });

  const appReady =
    !authRedirecting &&
    authQuery.isSuccess &&
    !authEndpointMissing &&
    !configQuery.isLoading &&
    !profilesQuery.isLoading &&
    !authQuery.error &&
    !configQuery.error &&
    !profilesQuery.error;
  const booting =
    !authRedirecting &&
    (authQuery.isLoading || (authQuery.isSuccess && !authEndpointMissing && (configQuery.isLoading || profilesQuery.isLoading)));

  useEffect(() => {
    if (authQuery.error || configQuery.error || profilesQuery.error) {
      setGlobalError(normalizeError(authQuery.error || configQuery.error || profilesQuery.error));
      return;
    }
    setGlobalError("");
  }, [authQuery.error, configQuery.error, profilesQuery.error]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  const showToast = useCallback((message: string, kind = "success") => {
    setFlash({ kind, message });
    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = window.setTimeout(() => {
      setFlash(null);
      flashTimerRef.current = null;
    }, 3200);
  }, []);

  const requireInteractiveAuth = useCallback(async () => {
    if (!authState.configured || authRedirecting) {
      return authRedirecting;
    }
    const result = await authQuery.refetch();
    const authenticated = Boolean(result.data?.authenticated);
    if (!authenticated) {
      beginAuthRedirect();
      return true;
    }
    return false;
  }, [authQuery, authRedirecting, authState.configured, beginAuthRedirect]);

  const authLabel = session?.username ? `Signed in as ${session.username}` : "Protected workspace";

  const handleRouteChange = useCallback(
    async (nextRoute: (typeof routeConfigs)[number]["id"]) => {
      if (await requireInteractiveAuth()) {
        return;
      }
      startTransition(() => {
        routeState.setRoute(nextRoute);
      });
    },
    [requireInteractiveAuth, routeState],
  );

  const handleProfileChange = useCallback(
    async (profileId: string) => {
      if (await requireInteractiveAuth()) {
        return;
      }
      startTransition(() => {
        setSelectedProfileId(profileId);
        routeState.setProfile(profileId, { replace: true });
      });
    },
    [requireInteractiveAuth, routeState],
  );

  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch (error) {
      const authError = error as { status?: number; code?: string };
      if (!(authError.status === 401 && authError.code === "ui_auth_required")) {
        showToast(normalizeError(error), "danger");
      }
    } finally {
      beginAuthRedirect();
    }
  }, [api, beginAuthRedirect, showToast]);

  const routeViews = appReady
    ? routeConfigs.map((route) => {
        const active = route.id === routeState.route;
        return (
          <section
            className={`route-view${active ? " route-view--active" : ""}`}
            hidden={!active}
            id={`route-${route.id}`}
            key={route.id}
          >
            {mountedRoutes.has(route.id) ? (
              <Suspense fallback={<SurfaceLoader message="Loading route…" variant="inline" />}>
                <route.component
                  active={active}
                  api={api}
                  config={configState}
                  navigateToRoute={(routeId) => routeState.setRoute(routeId)}
                  notify={showToast}
                  profileId={selectedProfileId}
                  profiles={profiles}
                  updateConfig={async (patch) => updateConfigMutation.mutateAsync(patch)}
                />
              </Suspense>
            ) : null}
          </section>
        );
      })
    : null;

  return (
    <AppShell
      authConfigured={authState.configured}
      authLabel={authLabel}
      booting={booting}
      flash={flash}
      globalError={globalError}
      onLogout={handleLogout}
      onProfileChange={handleProfileChange}
      onRouteChange={handleRouteChange}
      profileDisabled={!profiles.length || !appReady || authRedirecting}
      profiles={profiles}
      route={routeState.route}
      routeViews={routeViews}
      selectedProfileId={selectedProfileId}
    />
  );
}

function readLastSelectedProfileId() {
  try {
    return window.localStorage.getItem(LAST_PROFILE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function writeLastSelectedProfileId(profileId: string) {
  try {
    window.localStorage.setItem(LAST_PROFILE_STORAGE_KEY, profileId);
  } catch {
    // Ignore storage restrictions; URL and config fallback still resolve a profile.
  }
}
