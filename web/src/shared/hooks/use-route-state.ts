import { useEffect, useState } from "react";

import { readUrlState, type RouteId, updateUrlState } from "@/shared/lib/url-state";

type UrlState = {
  route: RouteId;
  profileId: string;
};

export function useRouteState() {
  const [state, setState] = useState<UrlState>(() => readUrlState());

  useEffect(() => {
    function handlePopstate() {
      setState(readUrlState());
    }

    window.addEventListener("popstate", handlePopstate);
    return () => {
      window.removeEventListener("popstate", handlePopstate);
    };
  }, []);

  function setRoute(route: RouteId, options: { replace?: boolean } = {}) {
    updateUrlState({ route, profileId: state.profileId }, options);
    setState(readUrlState());
  }

  function setProfile(profileId: string, options: { replace?: boolean } = {}) {
    updateUrlState({ route: state.route, profileId }, options);
    setState(readUrlState());
  }

  return {
    route: state.route,
    profileId: state.profileId,
    setRoute,
    setProfile,
    syncFromWindow() {
      setState(readUrlState());
    },
  };
}
