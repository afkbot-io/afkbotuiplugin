import type { ChangeEvent, FormEvent } from "react";

import type { TextLibraryUiDefinition } from "@/features/text-library/model/text-library.types";

export function TextLibraryToolbar({
  itemCount,
  onQueryChange,
  onSubmit,
  query,
  ui,
}: {
  itemCount: number;
  onQueryChange: (nextValue: string) => void;
  onSubmit: () => void;
  query: string;
  ui: TextLibraryUiDefinition;
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onQueryChange(event.target.value);
  };

  return (
    <form className="board-toolbar board-toolbar--visible automation-filters tl-toolbar" onSubmit={handleSubmit}>
      <div className="board-toolbar__summary">
        <span className="badge">{ui.visibleLabel(itemCount)}</span>
        <span className="board-toolbar__hint">{ui.searchHint}</span>
      </div>
      <div className="board-toolbar__controls">
        <div className="board-toolbar__fields board-toolbar__fields--single">
          <input
            aria-label={ui.searchPlaceholder}
            className="input"
            name="query"
            onChange={handleChange}
            placeholder={ui.searchPlaceholder}
            type="search"
            value={query}
          />
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
