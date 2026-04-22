import type { TextLibraryUiDefinition } from "@/features/text-library/model/text-library.types";
import { AsyncButton } from "@/shared/ui/AsyncButton";
import { PageHeader } from "@/shared/ui/PageHeader";

export function TextLibraryHeader({
  onCreate,
  onRefresh,
  refreshing,
  ui,
}: {
  onCreate: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  ui: TextLibraryUiDefinition;
}) {
  return (
    <PageHeader
      actions={
        <>
        <AsyncButton
          className="button button--ghost"
          idleLabel={ui.refreshLabel}
          loading={refreshing}
          onClick={onRefresh}
          pendingLabel="Refreshing…"
        />
        <button className="button button--primary" onClick={onCreate} type="button">
          {ui.newLabel}
        </button>
        </>
      }
      className="tl-page__head"
      eyebrow={ui.surfaceEyebrow}
      title={ui.surfaceTitle}
    />
  );
}
