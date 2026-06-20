import { lazy, type ForwardRefExoticComponent, type LazyExoticComponent, type RefAttributes } from "react";

import type { RouteId } from "@/shared/lib/url-state";
import { routeLabel } from "@/shared/lib/workspace";

export type RouteHandle = {
  refresh: () => Promise<void>;
};

export type AppRouteProps = {
  active: boolean;
  api: unknown;
  config: Record<string, unknown>;
  notify: (message: string, kind?: string) => void;
  navigateToRoute?: (routeId: RouteId) => void;
  profileId: string;
  profiles: Array<{ id?: string | null; title?: string | null }>;
  updateConfig: (patch: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export type RouteConfig = {
  component: LazyExoticComponent<ForwardRefExoticComponent<AppRouteProps & RefAttributes<RouteHandle>>>;
  id: RouteId;
  label: string;
};

const LazyAutomationsRoute = lazy(async () => ({
  default: (await import("@/features/automations/AutomationsPage")).AutomationsPage,
}));

const LazyChatRoute = lazy(async () => ({
  default: (await import("@/features/chat/ChatPage")).ChatPage,
}));

const LazyTaskFlowRoute = lazy(async () => ({
  default: (await import("@/features/task-flow/TaskFlowPage")).TaskFlowPage,
}));

const LazyTaskDocumentsRoute = lazy(async () => ({
  default: (await import("@/features/task-documents/TaskDocumentsPage")).TaskDocumentsPage,
}));

const LazyEmployeesPage = lazy(async () => ({
  default: (await import("@/features/employees/EmployeesPage")).EmployeesPage,
}));

const LazySubagentsPage = lazy(async () => ({
  default: (await import("@/features/subagents/SubagentsPage")).SubagentsPage,
}));

const LazySkillsPage = lazy(async () => ({
  default: (await import("@/features/skills/SkillsPage")).SkillsPage,
}));

const LazyBootstrapPage = lazy(async () => ({
  default: (await import("@/features/bootstrap/BootstrapPage")).BootstrapPage,
}));

export const routeConfigs: RouteConfig[] = [
  {
    component: LazyChatRoute,
    id: "chat",
    label: routeLabel("chat"),
  },
  {
    component: LazyTaskFlowRoute,
    id: "task-flow",
    label: routeLabel("task-flow"),
  },
  {
    component: LazyAutomationsRoute,
    id: "automations",
    label: routeLabel("automations"),
  },
  {
    component: LazyTaskDocumentsRoute,
    id: "docs",
    label: routeLabel("docs"),
  },
  {
    component: LazyEmployeesPage,
    id: "employees",
    label: routeLabel("employees"),
  },
  {
    component: LazySubagentsPage,
    id: "subagents",
    label: routeLabel("subagents"),
  },
  {
    component: LazySkillsPage,
    id: "skills",
    label: routeLabel("skills"),
  },
  {
    component: LazyBootstrapPage,
    id: "bootstrap",
    label: routeLabel("bootstrap"),
  },
];
