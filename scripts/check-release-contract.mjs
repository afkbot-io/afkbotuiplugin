import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.resolve(repoRoot, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function validateVersionSync({
  changelogVersion,
  manifestVersion,
  packageVersion,
  readmeVersion,
}) {
  assert(manifestVersion, "Plugin manifest is missing a version.");
  assert(packageVersion === manifestVersion, `package.json version ${packageVersion} does not match manifest version ${manifestVersion}.`);
  assert(readmeVersion === manifestVersion, `README current release ${readmeVersion} does not match manifest version ${manifestVersion}.`);
  assert(changelogVersion === manifestVersion, `Top changelog entry ${changelogVersion} does not match manifest version ${manifestVersion}.`);
}

export function readSourceMounts(indexHtml) {
  return {
    apiBase: indexHtml.match(/data-api-base="([^"]+)"/u)?.[1] || "",
    webBase: indexHtml.match(/data-web-base="([^"]+)"/u)?.[1] || "",
  };
}

export function validateSourceMounts({ apiPrefix, indexHtml, webPrefix }) {
  const sourceMounts = readSourceMounts(indexHtml);
  assert(sourceMounts.apiBase === apiPrefix, `web/index.html data-api-base ${sourceMounts.apiBase} does not match manifest api prefix ${apiPrefix}.`);
  assert(sourceMounts.webBase === webPrefix, `web/index.html data-web-base ${sourceMounts.webBase} does not match manifest web prefix ${webPrefix}.`);
}

export function validateArtifactIgnore(ignoredPaths, gitignoreSource) {
  for (const ignoredPath of ignoredPaths) {
    assert(gitignoreSource.includes(ignoredPath), `.gitignore is missing ${ignoredPath}.`);
  }
}

function collectAssetRefs(source) {
  return [...source.matchAll(/["'`](assets\/[^"'`]+\.(?:css|js))["'`]/g)].map((match) => match[1]);
}

function mustExist(relativePath) {
  const absolutePath = path.resolve(repoRoot, relativePath);
  statSync(absolutePath);
  return absolutePath;
}

function toRepoAssetPath(assetPath, webPrefix, webRoot) {
  const normalizedAssetPath = assetPath.replace(/^\//u, "");
  const normalizedWebPrefix = String(webPrefix || "").replace(/^\/|\/$/gu, "");
  if (normalizedWebPrefix && normalizedAssetPath.startsWith(`${normalizedWebPrefix}/`)) {
    return path.join(webRoot, normalizedAssetPath.slice(normalizedWebPrefix.length + 1));
  }
  if (normalizedAssetPath.startsWith("assets/")) {
    return path.join(webRoot, normalizedAssetPath);
  }
  return normalizedAssetPath;
}

export function checkReleaseContract() {
  const pluginManifest = readJson(".afkbot-plugin/plugin.json");
  const packageJson = readJson("package.json");
  const readme = readFileSync(path.resolve(repoRoot, "README.md"), "utf8");
  const changelog = readFileSync(path.resolve(repoRoot, "CHANGELOG.md"), "utf8");
  const sourceIndex = readFileSync(path.resolve(repoRoot, "web/index.html"), "utf8");
  const gitignore = readFileSync(path.resolve(repoRoot, ".gitignore"), "utf8");

  const manifestVersion = String(pluginManifest.version || "").trim();
  const packageVersion = String(packageJson.version || "").trim();
  const readmeVersion = readme.match(/Current release:\s+`([^`]+)`/u)?.[1] || "";
  const changelogVersion = changelog.match(/^##\s+([0-9]+\.[0-9]+\.[0-9]+)\s+-/mu)?.[1] || "";
  validateVersionSync({
    changelogVersion,
    manifestVersion,
    packageVersion,
    readmeVersion,
  });

  const pythonRoot = String(pluginManifest.paths?.python_root || "").trim();
  const webRoot = String(pluginManifest.paths?.web_root || "").trim();
  const webPrefix = String(pluginManifest.mounts?.web_prefix || "").trim();
  const apiPrefix = String(pluginManifest.mounts?.api_prefix || "").trim();
  assert(pythonRoot, "Plugin manifest is missing paths.python_root.");
  assert(webRoot, "Plugin manifest is missing paths.web_root.");
  mustExist(pythonRoot);
  mustExist(webRoot);
  validateSourceMounts({
    apiPrefix,
    indexHtml: sourceIndex,
    webPrefix,
  });
  validateArtifactIgnore(
    [".coverage", ".pytest_cache/", ".playwright-cli/", "output/", "playwright-report/", "test-results/", "web/coverage/"],
    gitignore,
  );

  const distIndexPath = path.join(webRoot, "index.html");
  const distIndex = readFileSync(mustExist(distIndexPath), "utf8");
  const appScriptRef = distIndex.match(/src="([^"]*assets\/app\.js)"/u)?.[1] || "";
  const appCssRef = distIndex.match(/href="([^"]*assets\/app\.css)"/u)?.[1] || "";
  assert(appScriptRef, "web/dist/index.html is missing the main app.js reference.");
  assert(appCssRef, "web/dist/index.html is missing the main app.css reference.");

  const appScriptPath = toRepoAssetPath(appScriptRef, webPrefix, webRoot);
  const appCssPath = toRepoAssetPath(appCssRef, webPrefix, webRoot);
  mustExist(appScriptPath);
  mustExist(appCssPath);

  const appScript = readFileSync(path.resolve(repoRoot, appScriptPath), "utf8");
  const referencedAssets = new Set(collectAssetRefs(distIndex).concat(collectAssetRefs(appScript)));
  referencedAssets.forEach((assetPath) => {
    mustExist(toRepoAssetPath(assetPath, webPrefix, webRoot));
  });

  return {
    appCssPath,
    appScriptPath,
    changelogVersion,
    gitignoreChecked: true,
    manifestVersion,
    packageVersion,
    referencedAssets: [...referencedAssets].sort(),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = checkReleaseContract();
  process.stdout.write(
    [
      `release contract ok`,
      `version=${result.manifestVersion}`,
      `app=${result.appScriptPath}`,
      `css=${result.appCssPath}`,
      `assets=${result.referencedAssets.length}`,
    ].join(" ") + "\n",
  );
}
