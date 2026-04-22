import { PageHeader } from "@/shared/ui/PageHeader";

type AutomationsHeaderProps = {
  onCreate: () => void;
};

export function AutomationsHeader({ onCreate }: AutomationsHeaderProps) {
  return (
    <PageHeader
      actions={
        <button className="button button--primary" onClick={onCreate} type="button">
          New Automation
        </button>
      }
      eyebrow="Workspace / Automations"
      title="Automations"
    />
  );
}
