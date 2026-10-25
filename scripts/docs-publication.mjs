import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exists(rootPath, file) {
  try {
    await access(path.join(rootPath, file));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function invariant(condition, code) {
  if (!condition) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
}

export async function verifyAuthoring(rootPath = root) {
  const packageManifest = JSON.parse(await readFile(path.join(rootPath, "package.json"), "utf8"));
  const websiteManifest = JSON.parse(await readFile(path.join(rootPath, "website/package.json"), "utf8"));
  const mode = JSON.parse(await readFile(path.join(rootPath, "website/lib/docs-mode.json"), "utf8"));
  const workspace = await readFile(path.join(rootPath, "pnpm-workspace.yaml"), "utf8");
  const sourceConfig = await readFile(path.join(rootPath, "website/source.config.ts"), "utf8");
  const docs = await readdir(path.join(rootPath, "docs"));
  const workflowDir = path.join(rootPath, ".github/workflows");
  const workflowNames = await exists(rootPath, ".github/workflows")
    ? await readdir(workflowDir)
    : [];

    invariant(packageManifest.name === "@ilokesto/queryable", "PACKAGE_IDENTITY");
    invariant(packageManifest.private === false && packageManifest.publishConfig?.access === "public", "PUBLIC_PACKAGE_REQUIRED");
    invariant(websiteManifest.private === true, "PRIVATE_WEBSITE_REQUIRED");
    invariant(mode.mode === "private-authoring-only", "DOCS_MODE");
    invariant(mode.package === "queryable" && mode.channel === "next", "DOCS_COLLECTION");
    invariant(JSON.stringify(mode.locales) === JSON.stringify(["en", "ko"]), "DOCS_LOCALES");
    invariant(Array.isArray(mode.publicCollections) && mode.publicCollections.length === 0, "PUBLIC_COLLECTIONS");
    invariant(Array.isArray(mode.releasedCollections) && mode.releasedCollections.length === 0, "RELEASED_COLLECTIONS");
    invariant(Array.isArray(mode.runtimeAliases) && mode.runtimeAliases.length === 0, "RUNTIME_ALIASES");
    invariant(Array.isArray(mode.publisherWorkflows) && mode.publisherWorkflows.length === 0, "PUBLISHER_WORKFLOWS");
    invariant(/^\s+-\s+website\s*$/m.test(workspace), "WEBSITE_WORKSPACE");
    invariant((sourceConfig.match(/defineDocs\s*\(/g) ?? []).length === 1, "MULTIPLE_DOC_COLLECTIONS");
    invariant(sourceConfig.includes("authoringMode.canonicalDocs"), "CANONICAL_DOCS_SOURCE");
    invariant(docs.includes("meta.json") && docs.includes("index.mdx") && docs.includes("index.ko.mdx"), "BILINGUAL_DOCS");
    invariant(
      Object.keys(websiteManifest.dependencies ?? {}).every(name => !name.startsWith("@ilokesto/")),
      "WEBSITE_RUNTIME_ALIAS",
    );
    invariant(!await exists(rootPath, "docs-publication"), "PUBLICATION_ARCHIVE_PRESENT");

    const workflows = await Promise.all(workflowNames.map(async name => ({
      name,
      text: await readFile(path.join(workflowDir, name), "utf8"),
    })));
    for (const workflow of workflows) {
      invariant(
        !/actions\/deploy-pages@|peaceiris\/actions-gh-pages@|\b(?:vercel|netlify)\s+(?:deploy|--prod)/.test(workflow.text),
        "DOCS_DEPLOY_WORKFLOW",
      );
    }

    return {
      status: "pass",
      mode: mode.mode,
      package: packageManifest.name,
      private: false,
      locales: mode.locales,
      channel: mode.channel,
      canonicalMdxPages: docs.filter(name => /\.mdx$/.test(name)).length,
      publicCollections: 0,
      releasedCollections: 0,
      releaseReceipts: 0,
      runtimeAliases: 0,
      publisherWorkflows: 0,
      packageReleaseWorkflows: workflowNames.filter(name => /^(?:publish|release)\.ya?ml$/.test(name)).sort(),
      verificationWorkflows: workflowNames.filter(name => name === "ci.yml"),
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "verify" || args.length > 0) {
    process.stderr.write(`${JSON.stringify({ status: "fail", code: "CLI_ARGUMENT" })}\n`);
    process.exitCode = 1;
  } else {
    verifyAuthoring().then(result => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }).catch(error => {
      process.stderr.write(`${JSON.stringify({ status: "fail", code: error.code ?? "INVALID_INPUT" })}\n`);
      process.exitCode = 1;
    });
  }
}
