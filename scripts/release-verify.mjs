import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function verifyRelease({ root = packageRoot, sha }) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) {
    throw new Error("RELEASE_SHA_INVALID");
  }

  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  if (manifest.private === true || manifest.name === "@ilokesto/queryable") {
    throw new Error("PRIVATE_RELEASE");
  }

  throw new Error("RELEASE_VERIFIER_NOT_CONFIGURED");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { sha: { type: "string" } } });
  verifyRelease({ sha: values.sha }).then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch(error => {
    process.stderr.write(`${JSON.stringify({ status: "rejected", message: error.message, publishPerformed: false })}\n`);
    process.exitCode = 1;
  });
}
