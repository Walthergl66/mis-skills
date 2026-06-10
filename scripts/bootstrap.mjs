import { spawnSync } from "node:child_process";

const run = (args) => {
  const result = spawnSync("npm", ["run", ...args], {
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(["install:skills"]);
run(["sync"]);
run(["inventory"]);
run(["validate"]);
