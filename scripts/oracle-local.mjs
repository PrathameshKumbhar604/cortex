
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    "Get-Service OracleServiceFREE | Select-Object -ExpandProperty Status",
  ],
  { encoding: "utf8" },
);

if (result.status !== 0 || !result.stdout.trim()) {
  console.error(
    "OracleServiceFREE was not found. Verify that Oracle Database Free is installed."
  );
  process.exit(1);
}

if (result.stdout.trim() !== "Running") {
  console.error(
    "Oracle Database is not running. Start it with: Start-Service OracleServiceFREE"
  );
  process.exit(1);
}

const port = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    "(Test-NetConnection localhost -Port 1521 -WarningAction SilentlyContinue).TcpTestSucceeded",
  ],
  { encoding: "utf8" },
);

if (port.status !== 0 || !port.stdout.includes("True")) {
  console.error(
    "Oracle is running, but port 1521 is not reachable. Check the Oracle TNS Listener service."
  );
  process.exit(1);
}

console.log("Oracle Database is reachable on localhost:1521.");
console.log("Connect using service name FREEPDB1.");
