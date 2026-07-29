import type { Server } from "node:http";
import type { WebSocketServer } from "ws";

type ClosableWorkers = { stopWithdrawalWorkers(): Promise<void> } | null;
type ClosableRedis = { shutdown(): Promise<void> };

export type RuntimeShutdownDependencies = {
  httpServer: Server;
  webSocketServer: WebSocketServer | null;
  workers: ClosableWorkers;
  redis: ClosableRedis;
  redisConfigured: boolean;
  deadlineMs?: number;
};

export async function drainRuntime({
  httpServer,
  webSocketServer,
  workers,
  redis,
  redisConfigured,
  deadlineMs = 10_000,
}: RuntimeShutdownDependencies): Promise<string[]> {
  const failures: string[] = [];
  const deadline = Date.now() + deadlineMs;

  const httpDrain = httpServer.listening
    ? new Promise<void>((resolve) => {
        httpServer.close((error) => {
          if (error) failures.push(`http:${error.message}`);
          resolve();
        });
        httpServer.closeIdleConnections();
      })
    : Promise.resolve();

  const websocketDrain = (async () => {
    if (!webSocketServer) return;
    for (const client of webSocketServer.clients) {
      client.close(1001, "server_shutdown");
    }
    while (webSocketServer.clients.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    for (const client of webSocketServer.clients) client.terminate();
    await new Promise<void>((resolve) => webSocketServer.close(() => resolve()));
  })().catch((error: unknown) => {
    failures.push(`websocket:${error instanceof Error ? error.message : String(error)}`);
  });

  await Promise.race([
    Promise.all([httpDrain, websocketDrain]),
    new Promise<void>((resolve) => setTimeout(resolve, deadlineMs)),
  ]);
  if (webSocketServer) {
    for (const client of webSocketServer.clients) client.terminate();
    await websocketDrain;
  }
  if (httpServer.listening) httpServer.closeAllConnections();

  try {
    await workers?.stopWithdrawalWorkers();
  } catch (error) {
    failures.push(`workers:${error instanceof Error ? error.message : String(error)}`);
  }

  if (redisConfigured) {
    try {
      await redis.shutdown();
    } catch (error) {
      failures.push(`redis:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return failures;
}
