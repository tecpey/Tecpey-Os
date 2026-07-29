import { randomUUID } from "node:crypto";
import {
  listRecoverableExchangeOrderCommands,
  processExchangeOrderCommand,
  readExchangeOrderCommand,
} from "../src/lib/trading/order-command-service";

const workerId = `exchange-order-${process.pid}-${randomUUID()}`;
const batchSize = Math.max(
  1,
  Math.min(100, Number(process.env.EXCHANGE_ORDER_WORKER_BATCH ?? 25)),
);
const concurrency = Math.max(
  1,
  Math.min(8, Number(process.env.EXCHANGE_ORDER_WORKER_CONCURRENCY ?? 2)),
);

const commandIds = await listRecoverableExchangeOrderCommands(batchSize);
let cursor = 0;
const counters = {
  discovered: commandIds.length,
  final: 0,
  queued: 0,
  processing: 0,
  unavailable: 0,
  failedTerminal: 0,
};

async function runLane(lane: number): Promise<void> {
  while (cursor < commandIds.length) {
    const index = cursor;
    cursor += 1;
    const commandId = commandIds[index];
    if (!commandId) return;

    const result = await processExchangeOrderCommand(
      commandId,
      `${workerId}:lane-${lane}`,
    );
    if (result.status === "final") {
      counters.final += 1;
    } else if (result.status === "queued") {
      counters.queued += 1;
    } else if (result.status === "processing") {
      counters.processing += 1;
    } else {
      counters.unavailable += 1;
    }

    const snapshot = await readExchangeOrderCommand(commandId);
    if (snapshot?.state === "failed_terminal") {
      counters.failedTerminal += 1;
    }
  }
}

await Promise.all(
  Array.from(
    { length: Math.min(concurrency, Math.max(1, commandIds.length)) },
    (_, index) => runLane(index + 1),
  ),
);

const ok = counters.unavailable === 0 && counters.failedTerminal === 0;
console.log(JSON.stringify({ ok, workerId, ...counters }));
if (!ok) process.exitCode = 1;
