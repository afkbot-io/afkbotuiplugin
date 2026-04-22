import type { FormEvent } from "react";

import type { AutomationFilters } from "@/features/automations/model/automations.types";

type AutomationsFiltersProps = {
  filteredCount: number;
  filters: AutomationFilters;
  onFilterChange: <K extends keyof AutomationFilters>(key: K, value: AutomationFilters[K]) => void;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  query: string;
  visibleCount: number;
};

export function AutomationsFilters({
  filteredCount,
  filters,
  onFilterChange,
  onQueryChange,
  onSubmit,
  query,
  visibleCount,
}: AutomationsFiltersProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className="board-toolbar board-toolbar--visible automation-filters" onSubmit={handleSubmit}>
      <div className="board-toolbar__summary">
        <span className="badge">{filteredCount || visibleCount} visible</span>
        <span className="board-toolbar__hint">
          Search by name, prompt, execution mode, cron, webhook status, or profile scope.
        </span>
      </div>
      <div className="board-toolbar__controls">
        <div className="board-toolbar__fields">
          <input
            aria-label="Search automations"
            className="input board-toolbar__search"
            name="query"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search automations…"
            type="search"
            value={query}
          />
          <select
            aria-label="Filter trigger"
            className="select board-toolbar__select"
            name="trigger_type"
            onChange={(event) => onFilterChange("triggerType", event.target.value)}
            value={filters.triggerType}
          >
            <option value="">All Triggers</option>
            <option value="cron">Cron</option>
            <option value="webhook">Webhook</option>
          </select>
          <select
            aria-label="Filter status"
            className="select board-toolbar__select"
            name="status"
            onChange={(event) => onFilterChange("status", event.target.value)}
            value={filters.status}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="deleted">Deleted</option>
          </select>
          <label className="checkbox-row checkbox-row--compact board-toolbar__checkbox">
            <input
              checked={filters.includeDeleted}
              name="include_deleted"
              onChange={(event) => onFilterChange("includeDeleted", event.target.checked)}
              type="checkbox"
            />
            <span>Include deleted</span>
          </label>
        </div>
        <div className="board-toolbar__actions">
          <button className="button button--primary" type="submit">
            Apply Filters
          </button>
        </div>
      </div>
    </form>
  );
}
