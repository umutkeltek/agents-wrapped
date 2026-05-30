import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

// Stream a file line-by-line. Reading a whole multi-hundred-MB session file with
// readFile(..., "utf8") throws ERR_STRING_TOO_LONG on Node (V8 caps strings at
// ~536MB) even though Bun tolerates it — which silently dropped giant sessions.
// Streaming sidesteps the string-length limit on every runtime.
export async function* readLines(path: string): AsyncGenerator<string> {
  const stream = createReadStream(path, { encoding: "utf8" });
  try {
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      yield line;
    }
  } finally {
    stream.close();
  }
}
