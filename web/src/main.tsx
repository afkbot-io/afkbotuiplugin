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

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    const basePath = __WEB_BASE_PATH__.replace(/\/$/, "");
    navigator.serviceWorker.register(`${basePath}/service-worker.js`).catch(() => undefined);
  });
}
