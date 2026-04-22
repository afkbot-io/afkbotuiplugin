import type { TextLibraryItem, TextLibraryUiDefinition } from "@/features/text-library/model/text-library.types";
import { SurfaceLoader } from "@/shared/ui/SurfaceLoader";

function renderBadges(badges: TextLibraryItem["cardBadges"]) {
  return badges
    .filter((badge) => badge.text)
    .map((badge) => (
      <span className={badge.className || "badge"} key={`${badge.className || "badge"}-${badge.text}`}>
        {badge.text}
      </span>
    ));
}

export function TextLibraryGrid({
  cardClass,
  empty,
  items,
  loading,
  onOpen,
  refreshing,
  selectedId,
  ui,
}: {
  cardClass: string;
  empty: boolean;
  items: TextLibraryItem[];
  loading: boolean;
  onOpen: (itemId: string) => void;
  refreshing: boolean;
  selectedId: string;
  ui: TextLibraryUiDefinition;
}) {
  if (empty && !loading) {
    return (
      <div className="empty-surface">
        <div className="placeholder-card inspector-empty__card">
          <div className="panel-section__title">{ui.emptyTitle}</div>
          <p className="muted">{ui.emptyDescription}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {loading ? <SurfaceLoader message={ui.loadingListLabel} title="Loading…" /> : null}
      {refreshing ? <SurfaceLoader message="Refreshing library…" variant="inline" /> : null}
      {items.map((item) => (
        <button
          className={`card ${cardClass} card--button${selectedId === item.id ? " card--selected" : ""}`}
          key={item.id}
          onClick={() => onOpen(item.id)}
          type="button"
        >
          <div className="card__topline">
            <div className="card__title">{item.id}</div>
            <div className="chip-row">{renderBadges(item.cardBadges)}</div>
          </div>
          <div className="card__snippet">{item.summary || ui.emptySummaryLabel}</div>
          <div className="card__footer">
            <div className="card__badges">{item.path ? <span className="badge">{item.path}</span> : null}</div>
          </div>
        </button>
      ))}
    </>
  );
}
