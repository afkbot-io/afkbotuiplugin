import { ApiClient } from "./core/api.js";
import { escapeAttribute, escapeHtml } from "./core/dom.js";
import { buildLoginUrl, readCurrentUiUrl, readUrlState, ROUTES, updateUrlState } from "./core/url.js";
import { createAutomationsController } from "./features/automations.js";
import { createBootstrapFilesController } from "./features/bootstrap-files.js";
import { createSkillsController } from "./features/skills.js";
import { createTaskFlowController } from "./features/task-flow.js";
import { createSubagentsController } from "./features/subagents.js";

const api = new ApiClient(document.body.dataset.apiBase || "/v1/plugins/afkbotui", {
  onUnauthorized: () => beginAuthRedirect(),
});
const root = document.getElementById("app");
const urlState = readUrlState();
const webBase = document.body.dataset.webBase || "/plugins/afkbotui";
const AUTH_SESSION_REFRESH_MS = 30000;

const defaultConfig = {
  poll_interval_sec: 5,
  default_profile_id: "default",
  task_flow_poll_interval_sec: 5,
  task_flow_board_limit_per_column: 20,
  task_flow_actor_type: "human",
  task_flow_actor_ref: "web-user",
};

const defaultAuthState = {
  mode: "disabled",
  configured: false,
  username: "",
  protected_plugin_ids: [],
};

const state = {
  booting: true,
  route: urlState.route,
  profiles: [],
  selectedProfileId: urlState.profileId,
  config: { ...defaultConfig },
  auth: { ...defaultAuthState },
  session: null,
  authRedirecting: false,
  globalError: "",
};

const refs = {};
const views = {};
let flashTimer = null;
let authRefreshTimer = null;

buildShell();
bindShellListeners();
void boot();

async function boot() {
  try {
    const authResponse = await loadAuthSession();
    state.auth = normalizeAuthState(authResponse?.auth);
    state.session = authResponse?.authenticated ? authResponse.session || null : null;
    if (state.auth.configured && !authResponse?.authenticated) {
      beginAuthRedirect();
      return;
    }

    const [configResponse, profilesResponse] = await Promise.all([api.getConfig(), api.listProfiles()]);
    state.config = normalizeConfig(configResponse.config || configResponse.plugin_config?.config || state.config);
    state.profiles = profilesResponse.profiles || [];
    state.selectedProfileId = resolveProfileId(state.profiles, state.selectedProfileId || state.config.default_profile_id);
    state.globalError = "";
  } catch (error) {
    if (!state.authRedirecting) {
      state.globalError = normalizeError(error);
    }
  } finally {
    if (state.authRedirecting) {
      return;
    }
    state.booting = false;
    renderShellState();
  }

  if (state.authRedirecting || state.globalError) {
    return;
  }
  mountViews();
  scheduleAuthRefresh();
  await activateRoute(state.route, { replace: true });
}

function buildShell() {
  root.innerHTML = `
    <div class="unified-shell">
      <a class="skip-link" href="#workspace-main">Skip to Content</a>
      <header class="topbar">
        <div class="topbar__shell">
          <div class="topbar__brand" translate="no">
            <span class="topbar__brand-lockup">
              <span class="topbar__bracket">[</span>
              <span class="topbar__brand-text">AFKBOT</span>
              <span class="topbar__bracket">]</span>
            </span>
            <span class="topbar__badge">CONTROL</span>
          </div>
          <nav class="topbar__tabs" aria-label="Workspace sections">
            ${ROUTES.map((route) => `
              <a class="tab-button" href="?tab=${encodeURIComponent(route)}" data-route-link="${route}">
                ${escapeHtml(routeLabel(route))}
              </a>
            `).join("")}
          </nav>
          <div class="topbar__controls">
            <div class="topbar__selectors">
              <label class="topbar__field">
                <span class="topbar__label">Profile</span>
                <select id="workspace-profile-switch" class="select topbar__select" aria-label="Select profile"></select>
              </label>
            </div>
            <div id="workspace-auth" class="topbar__session" hidden>
              <div class="topbar__session-copy">
                <span class="topbar__label">Access</span>
                <span id="workspace-auth-status" class="topbar__session-status"></span>
              </div>
              <button class="button button--ghost button--compact" type="button" data-shell-action="logout">Sign out</button>
            </div>
            <div class="topbar__actions">
              <button class="button" type="button" data-shell-action="refresh">Refresh</button>
            </div>
          </div>
        </div>
      </header>

      <main id="workspace-main" class="workspace-shell">
        <div id="workspace-error"></div>
        <section id="workspace-boot" class="boot-panel glass-panel" hidden>
          <div class="empty-state">
            <h3>Loading Workspace…</h3>
            <p>Resolving profiles, config, automations, Task Flow, subagents, skills, and bootstrap surfaces.</p>
          </div>
        </section>
        <section id="route-automations" class="route-view"></section>
        <section id="route-task-flow" class="route-view"></section>
        <section id="route-subagents" class="route-view"></section>
        <section id="route-skills" class="route-view"></section>
        <section id="route-bootstrap" class="route-view"></section>
      </main>

      <div id="workspace-flash" class="flash-region" aria-live="polite"></div>
    </div>
  `;

  refs.profileSelect = root.querySelector("#workspace-profile-switch");
  refs.bootPanel = root.querySelector("#workspace-boot");
  refs.error = root.querySelector("#workspace-error");
  refs.flash = root.querySelector("#workspace-flash");
  refs.routeLinks = [...root.querySelectorAll("[data-route-link]")];
  refs.authPanel = root.querySelector("#workspace-auth");
  refs.authStatus = root.querySelector("#workspace-auth-status");
  refs.routeNodes = {
    automations: root.querySelector("#route-automations"),
    "task-flow": root.querySelector("#route-task-flow"),
    subagents: root.querySelector("#route-subagents"),
    skills: root.querySelector("#route-skills"),
    bootstrap: root.querySelector("#route-bootstrap"),
  };
}

function bindShellListeners() {
  root.addEventListener("click", async (event) => {
    const routeLink = event.target.closest("[data-route-link]");
    if (routeLink) {
      event.preventDefault();
      if (await requireInteractiveAuth()) {
        return;
      }
      await activateRoute(routeLink.dataset.routeLink);
      return;
    }

    if (event.target.closest("[data-shell-action='refresh']")) {
      if (await requireInteractiveAuth()) {
        return;
      }
      await views[state.route]?.refresh?.();
      return;
    }

    if (event.target.closest("[data-shell-action='logout']")) {
      await logout();
    }
  });

  refs.profileSelect?.addEventListener("change", async (event) => {
    if (await requireInteractiveAuth()) {
      return;
    }
    await setProfile(event.target.value);
  });

  window.addEventListener("popstate", async () => {
    const next = readUrlState();
    state.route = next.route;
    if (next.profileId) {
      state.selectedProfileId = resolveProfileId(state.profiles, next.profileId);
    }
    renderShellState();
    await activateRoute(state.route, { replace: true });
  });

  window.addEventListener("focus", () => {
    if (!state.auth.configured || state.authRedirecting) {
      return;
    }
    void refreshAuthSession();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !state.auth.configured || state.authRedirecting) {
      return;
    }
    void refreshAuthSession();
  });
}

function mountViews() {
  if (views.automations) {
    return;
  }

  const shared = {
    api,
    getProfileId: () => state.selectedProfileId,
    getConfig: () => state.config,
    updateConfig,
    showToast,
    notify: showToast,
  };

  views.automations = createAutomationsController({ ...shared, root: refs.routeNodes.automations });
  views["task-flow"] = createTaskFlowController({
    ...shared,
    root: refs.routeNodes["task-flow"],
    getProfiles: () => state.profiles,
  });
  views.subagents = createSubagentsController({ ...shared, root: refs.routeNodes.subagents });
  views.skills = createSkillsController({ ...shared, root: refs.routeNodes.skills });
  views.bootstrap = createBootstrapFilesController({ ...shared, root: refs.routeNodes.bootstrap });
}

async function activateRoute(route, { replace = false } = {}) {
  state.route = ROUTES.includes(route) ? route : "automations";
  renderShellState();

  for (const key of ROUTES) {
    const node = refs.routeNodes[key];
    const active = key === state.route;
    node.hidden = !active;
    node.classList.toggle("route-view--active", active);
    if (active) {
      await views[key]?.activate?.({ profileId: state.selectedProfileId, config: state.config });
      views[key]?.setActive?.(true);
    } else {
      views[key]?.deactivate?.();
      views[key]?.setActive?.(false);
    }
  }

  updateUrlState(
    {
      route: state.route,
      profileId: state.selectedProfileId,
    },
    { replace },
  );
}

async function setProfile(profileId) {
  state.selectedProfileId = resolveProfileId(state.profiles, profileId || state.config.default_profile_id);
  renderShellState();
  updateUrlState(
    {
      route: state.route,
      profileId: state.selectedProfileId,
    },
    { replace: true },
  );

  await Promise.all(
    Object.values(views).map(async (view) => {
      if (view?.onProfileChange) {
        await view.onProfileChange(state.selectedProfileId);
      }
    }),
  );
}

async function updateConfig(patch) {
  const response = await api.updateConfig(patch);
  state.config = normalizeConfig(response.config || response.plugin_config?.config || state.config);
  Object.values(views).forEach((view) => {
    view?.updateConfig?.(state.config);
  });
  return state.config;
}

async function loadAuthSession() {
  try {
    return await api.getAuthSession();
  } catch (error) {
    if (error?.status === 404) {
      const authError = new Error(
        "AFKBOT UI 0.4.1 requires AFKBOT 1.3.0+ with the core /v1/auth/session endpoint available.",
      );
      authError.code = "ui_auth_endpoint_missing";
      authError.status = 404;
      throw authError;
    }
    throw error;
  }
}

async function logout() {
  try {
    await api.logout();
  } catch (error) {
    if (!(error?.status === 401 && error?.code === "ui_auth_required")) {
      showToast(normalizeError(error), "danger");
    }
  } finally {
    beginAuthRedirect();
  }
}

function beginAuthRedirect() {
  if (state.authRedirecting) {
    return;
  }
  clearAuthRefreshTimer();
  state.authRedirecting = true;
  state.globalError = "Authentication required. Redirecting to login…";
  state.booting = false;
  renderShellState();
  window.setTimeout(() => {
    window.location.assign(buildLoginUrl(resolveNextUrl()));
  }, 40);
}

function resolveNextUrl() {
  const current = readCurrentUiUrl();
  if (current.startsWith("/")) {
    return current;
  }
  return webBase;
}

async function requireInteractiveAuth() {
  if (!state.auth.configured || state.authRedirecting) {
    return state.authRedirecting;
  }
  await refreshAuthSession();
  return state.authRedirecting;
}

async function refreshAuthSession() {
  if (!state.auth.configured || state.authRedirecting) {
    return;
  }
  try {
    const previousAuth = JSON.stringify(state.auth);
    const previousSession = JSON.stringify(state.session);
    const authResponse = await loadAuthSession();
    state.auth = normalizeAuthState(authResponse?.auth);
    state.session = authResponse?.authenticated ? authResponse.session || null : null;
    if (state.auth.configured && !authResponse?.authenticated) {
      beginAuthRedirect();
      return;
    }
    if (JSON.stringify(state.auth) !== previousAuth || JSON.stringify(state.session) !== previousSession) {
      renderAuthState();
    }
  } catch (error) {
    if (error?.status === 401 && error?.code === "ui_auth_required") {
      beginAuthRedirect();
      return;
    }
    if (error?.code === "ui_auth_endpoint_missing") {
      state.globalError = normalizeError(error);
      renderErrorState();
    }
  } finally {
    scheduleAuthRefresh();
  }
}

function scheduleAuthRefresh() {
  clearAuthRefreshTimer();
  if (!state.auth.configured || state.authRedirecting) {
    return;
  }
  authRefreshTimer = window.setTimeout(() => {
    void refreshAuthSession();
  }, AUTH_SESSION_REFRESH_MS);
}

function clearAuthRefreshTimer() {
  if (authRefreshTimer !== null) {
    window.clearTimeout(authRefreshTimer);
    authRefreshTimer = null;
  }
}

function renderShellState() {
  renderRouteState();
  renderProfileState();
  renderAuthState();
  renderBootState();
  renderErrorState();
}

function renderRouteState() {
  refs.routeLinks.forEach((node) => {
    const active = node.dataset.routeLink === state.route;
    node.classList.toggle("tab-button--active", active);
    node.setAttribute("aria-current", active ? "page" : "false");

    const url = new URL(window.location.href);
    url.searchParams.set("tab", node.dataset.routeLink);
    if (state.selectedProfileId) {
      url.searchParams.set("profile", state.selectedProfileId);
    }
    node.href = `${url.pathname}${url.search}${url.hash}`;
  });
}

function renderProfileState() {
  refs.profileSelect.innerHTML = renderProfileOptions();
  refs.profileSelect.disabled = state.booting || state.authRedirecting || !state.profiles.length;
  if (state.selectedProfileId) {
    refs.profileSelect.value = state.selectedProfileId;
  }
}

function renderAuthState() {
  const authVisible = state.auth.configured;
  refs.authPanel.hidden = !authVisible;
  if (authVisible) {
    refs.authStatus.textContent = state.session?.username
      ? `Signed in as ${state.session.username}`
      : "Protected workspace";
  }
}

function renderBootState() {
  refs.bootPanel.hidden = !state.booting;
}

function renderErrorState() {
  refs.error.innerHTML = state.globalError
    ? `<div class="inline-alert inline-alert--danger">${escapeHtml(state.globalError)}</div>`
    : "";
}

function renderProfileOptions() {
  if (!state.profiles.length) {
    return '<option value="">No profiles</option>';
  }
  return state.profiles
    .map(
      (profile) => `
        <option value="${escapeAttribute(profile.id)}" ${profile.id === state.selectedProfileId ? "selected" : ""}>
          ${escapeHtml(profile.name || profile.id)}${profile.is_default ? " · default" : ""}
        </option>
      `,
    )
    .join("");
}

function resolveProfileId(profiles, preferredProfileId) {
  if (!profiles.length) {
    return "";
  }
  const preferred = profiles.find((profile) => profile.id === preferredProfileId);
  if (preferred) {
    return preferred.id;
  }
  const defaultProfile = profiles.find((profile) => profile.is_default);
  return defaultProfile?.id || profiles[0].id;
}

function normalizeConfig(config) {
  return {
    poll_interval_sec: Number(config.poll_interval_sec || defaultConfig.poll_interval_sec),
    default_profile_id: String(config.default_profile_id || defaultConfig.default_profile_id),
    task_flow_poll_interval_sec: Number(
      config.task_flow_poll_interval_sec
      || config.poll_interval_sec
      || defaultConfig.task_flow_poll_interval_sec
    ),
    task_flow_board_limit_per_column: Number(
      config.task_flow_board_limit_per_column
      || config.board_limit_per_column
      || defaultConfig.task_flow_board_limit_per_column
    ),
    task_flow_actor_type: String(
      config.task_flow_actor_type
      || config.actor_type
      || defaultConfig.task_flow_actor_type
    ),
    task_flow_actor_ref: String(
      config.task_flow_actor_ref
      || config.actor_ref
      || defaultConfig.task_flow_actor_ref
    ),
  };
}

function normalizeAuthState(auth) {
  return {
    ...defaultAuthState,
    ...(auth || {}),
    protected_plugin_ids: Array.isArray(auth?.protected_plugin_ids) ? auth.protected_plugin_ids : [],
  };
}

function showToast(message, kind = "info") {
  refs.flash.innerHTML = `<div class="flash flash--${escapeAttribute(kind)}">${escapeHtml(message)}</div>`;
  if (flashTimer !== null) {
    window.clearTimeout(flashTimer);
  }
  flashTimer = window.setTimeout(() => {
    refs.flash.innerHTML = "";
    flashTimer = null;
  }, 2600);
}

function routeLabel(route) {
  if (route === "task-flow") {
    return "Task Flow";
  }
  if (route === "subagents") {
    return "Subagents";
  }
  if (route === "skills") {
    return "Skills";
  }
  if (route === "bootstrap") {
    return "Bootstrap";
  }
  return "Automations";
}

function normalizeError(error) {
  if (error?.code === "ui_auth_required") {
    return "Authentication required.";
  }
  return error instanceof Error && error.message ? error.message : "Unexpected error";
}
