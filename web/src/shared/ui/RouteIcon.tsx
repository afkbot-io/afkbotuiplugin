import type { RouteId } from "@/shared/lib/url-state";

type RouteIconProps = {
  routeId: RouteId;
};

const iconPaths: Record<RouteId, string> = {
  automations: "M6 12a6 6 0 1 1 12 0 6 6 0 0 1-12 0Zm6-8v8l5 3",
  bootstrap: "M6 4h9l3 3v13H6V4Zm8 0v4h4M9 12h6M9 16h4",
  chat: "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v6A2.5 2.5 0 0 1 17.5 15H10l-4 4v-4A2 2 0 0 1 4 13V6.5Z",
  docs: "M7 3h7l4 4v14H7V3Zm7 0v5h5M10 12h6M10 16h6",
  employees: "M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm8 1a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5ZM3.5 20a4.5 4.5 0 0 1 9 0M13.5 20a3.5 3.5 0 0 1 7 0",
  skills: "M12 3l2.4 5 5.6.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9 5.6-.8L12 3Z",
  subagents: "M12 3l7 4v6c0 4.4-3 7.2-7 8-4-0.8-7-3.6-7-8V7l7-4Zm0 5v5l4 2",
  "task-flow": "M5 6h5v5H5V6Zm9 0h5v5h-5V6ZM5 15h5v3H5v-3Zm9 0h5v3h-5v-3ZM10 8.5h4M10 16.5h4",
};

export function RouteIcon({ routeId }: RouteIconProps) {
  return (
    <svg aria-hidden="true" className="route-icon" focusable="false" viewBox="0 0 24 24">
      <path d={iconPaths[routeId]} />
    </svg>
  );
}
