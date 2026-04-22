import { forwardRef } from "react";

import type { AppRouteProps, RouteHandle } from "@/app/routes";
import { subagentsDefinition } from "@/features/subagents/subagents.definition";
import { TextLibraryPage } from "@/features/text-library/ui/TextLibraryPage";

export const SubagentsPage = forwardRef<RouteHandle, AppRouteProps>(function SubagentsPage(props, ref) {
  return <TextLibraryPage {...props} definition={subagentsDefinition} ref={ref} />;
});
