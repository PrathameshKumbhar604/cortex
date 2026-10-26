// Starts (or creates) the local Oracle AI Database Free container used for memory.
// Reads ORACLE_DB_PASSWORD from .env; data lives in the "cortex-oradata" Docker volume.
// Usage: npm run oracle:local
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const NAME = "cortex-oracle";
const IMAGE = "container-registry.oracle.com/database/free:latest";
const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const pwd = env.ORACLE_DB_PASSWORD;
if (!pwd) {
  console.error("Set ORACLE_DB_PASSWORD in .env first.");
  process.exit(1);
}

const docker = (...args) => spawnSync("docker", args, { encoding: "utf8" });
const exists = docker("ps", "-a", "--filter", `name=^${NAME}$`, "--format", "{{.Status}}").stdout.trim();

if (!exists) {
  console.log("Creating the database container (first run takes a few minutes)…");
  execFileSync("docker", ["run", "-d", "--name", NAME, "-p", "1521:1521", "-e", `ORACLE_PWD=${pwd}`, "-v", "cortex-oradata:/opt/oracle/oradata", IMAGE], {
    stdio: ["ignore", "ignore", "inherit"],
  });
} else if (!exists.startsWith("Up")) {
  console.log("Starting the database container…");
  docker("start", NAME);
}

const started = Date.now();
for (;;) {
  const logs = docker("logs", "--tail", "50", NAME);
  if (/DATABASE IS READY TO USE/.test(logs.stdout + logs.stderr)) break;
  if (Date.now() - started > 15 * 60_000) {
    console.error("The database did not become ready in 15 minutes. Check: docker logs cortex-oracle");
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
console.log(`Oracle is ready on localhost:1521/FREEPDB1 (${Math.round((Date.now() - started) / 1000)}s).`);
