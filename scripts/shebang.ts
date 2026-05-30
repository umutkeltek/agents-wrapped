// Post-build: make the bundled CLI directly executable as a node bin.
import { chmod, readFile, writeFile } from "node:fs/promises";

const target = new URL("../dist/cli.js", import.meta.url);
const SHEBANG = "#!/usr/bin/env node\n";

const content = await readFile(target, "utf8");
if (!content.startsWith("#!")) {
  await writeFile(target, SHEBANG + content);
}
await chmod(target, 0o755);
console.log("✓ shebang + chmod applied to dist/cli.js");
