import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Each worker gets its own throwaway database, created before any module has a
 * chance to read VAYLIRON_DB. Test files that never touch the database simply
 * ignore it.
 */
const worker = process.env.VITEST_WORKER_ID ?? "0";
const dir = path.join(os.tmpdir(), "vayliron-tests");
fs.mkdirSync(dir, { recursive: true });

const dbPath = path.join(dir, `worker-${worker}.db`);
for (const suffix of ["", "-wal", "-shm"]) {
  fs.rmSync(`${dbPath}${suffix}`, { force: true });
}

process.env.VAYLIRON_DB = dbPath;
process.env.SESSION_SECRET = "test-secret";
