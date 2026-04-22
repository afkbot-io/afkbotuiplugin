import { forwardRef } from "react";

import type { AppRouteProps, RouteHandle } from "@/app/routes";
import { bootstrapDefinition } from "@/features/bootstrap/bootstrap.definition";
import { TextLibraryPage } from "@/features/text-library/ui/TextLibraryPage";

export const BootstrapPage = forwardRef<RouteHandle, AppRouteProps>(function BootstrapPage(props, ref) {
  return <TextLibraryPage {...props} definition={bootstrapDefinition} ref={ref} />;
});
