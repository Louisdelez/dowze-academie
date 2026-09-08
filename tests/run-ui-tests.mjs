import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import process from "node:process";

const port = 1421;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite s’est arrêté (${server.exitCode}).\n${serverOutput}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite démarre encore.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Vite n’a pas démarré à temps.\n${serverOutput}`);
}

function runScript(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`tests/${file}`], {
      cwd: process.cwd(),
      env: { ...process.env, ETUDE_TEST_URL: baseUrl },
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(`${file} a échoué avec le code ${code}.`)));
  });
}

try {
  await waitForServer();
  const files = (await readdir("tests"))
    .filter((file) => file.startsWith("ui-") && file.endsWith(".mjs"))
    .sort();
  for (const file of files) {
    process.stdout.write(`\n— ${file}\n`);
    await runScript(file);
  }
  process.stdout.write(`\n${files.length} parcours UI validés.\n`);
} finally {
  if (server.exitCode === null) server.kill("SIGTERM");
}
