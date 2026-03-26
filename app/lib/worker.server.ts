import { startScanWorker } from "../jobs/process-scan.server";
import { startFixWorker } from "../jobs/apply-fix.server";

let workersStarted = false;

export function ensureWorkersRunning() {
  if (workersStarted) return;
  workersStarted = true;

  startScanWorker();
  startFixWorker();

  console.log("BullMQ workers started: scan-processing, fix-application");
}
