import { createServer } from "node:net";

interface Connection {
  readonly on: (event: string, listener: (chunk: string) => void) => unknown;
  readonly setEncoding: (encoding: "utf8") => unknown;
}

const FIRST_ARGUMENT = 2;
const [socketPath = ""] = process.argv.slice(FIRST_ARGUMENT);

const server = createServer((connection: Connection) => {
  const chunks: string[] = [];
  connection.setEncoding("utf8");
  connection.on("data", (chunk) => {
    chunks.push(chunk);
  });
  connection.on("end", () => {
    process.stdout.write(chunks.join(""));
  });
});

server.listen(socketPath, () => {
  process.stdout.write("listening\n");
});

process.on("SIGTERM", () => {
  server.close();
  process.exit();
});
