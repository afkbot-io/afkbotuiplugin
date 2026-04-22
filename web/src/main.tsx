import { createRoot } from "react-dom/client";

import { App } from "@/app/App";
import { AppProviders } from "@/app/AppProviders";
import "@/styles/app.less";

const rootNode = document.getElementById("app");

if (!rootNode) {
  throw new Error("Missing #app root.");
}

createRoot(rootNode).render(
  <AppProviders>
    <App />
  </AppProviders>,
);
