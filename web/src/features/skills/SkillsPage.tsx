import { forwardRef } from "react";

import type { AppRouteProps, RouteHandle } from "@/app/routes";
import { skillsDefinition } from "@/features/skills/skills.definition";
import { TextLibraryPage } from "@/features/text-library/ui/TextLibraryPage";

export const SkillsPage = forwardRef<RouteHandle, AppRouteProps>(function SkillsPage(props, ref) {
  return <TextLibraryPage {...props} definition={skillsDefinition} ref={ref} />;
});
