import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));
const pluginManifest = JSON.parse(readFileSync(path.resolve(repoRoot, ".afkbot-plugin/plugin.json"), "utf8")) as {
  mounts?: {
    api_prefix?: string;
    web_prefix?: string;
  };
  version?: string;
};
const apiBasePath = pluginManifest.mounts?.api_prefix || "/v1/plugins/afkbotui";
const webBasePath = pluginManifest.mounts?.web_prefix || "/plugins/afkbotui";

export default defineConfig({
  root: path.resolve(repoRoot, "web"),
  base: `${webBasePath.replace(/\/$/, "")}/`,
  define: {
    __APP_VERSION__: JSON.stringify(pluginManifest.version || "0.0.0"),
    __API_BASE_PATH__: JSON.stringify(apiBasePath),
    __WEB_BASE_PATH__: JSON.stringify(webBasePath),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(repoRoot, "web/src"),
    },
  },
  build: {
    outDir: path.resolve(repoRoot, "web/dist"),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        assetFileNames: (assetInfo) => {
          if ((assetInfo.name || "").endsWith(".css")) {
            return "assets/app.css";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}", "../tests/**/*.test.ts"],
    setupFiles: path.resolve(repoRoot, "web/src/test/setup.ts"),
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/shared/api/client.ts", "src/app/routes.ts", "src/vite-env.d.ts"],
      thresholds: {
        branches: 70,
        lines: 80,
        statements: 80,
      },
    },
  },
});
