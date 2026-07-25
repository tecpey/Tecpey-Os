import { createServer } from "node:http";

const LOOPBACK_HOST = "127.0.0.1";

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

export async function startRedisRestStub({ port, token }) {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("redis_rest_stub_port_invalid");
  }
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("redis_rest_stub_token_required");
  }

  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/ping") {
      sendJson(response, 404, { error: "not_found" });
      return;
    }

    if (request.headers.authorization !== `Bearer ${token}`) {
      sendJson(response, 401, { error: "unauthorized" });
      return;
    }

    sendJson(response, 200, { result: "PONG" });
  });

  await new Promise((resolvePromise, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolvePromise();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, LOOPBACK_HOST);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise((resolvePromise) => server.close(resolvePromise));
    throw new Error("redis_rest_stub_address_unavailable");
  }

  let stopPromise;
  return {
    host: LOOPBACK_HOST,
    port: address.port,
    url: `http://${LOOPBACK_HOST}:${address.port}`,
    stop() {
      if (stopPromise) return stopPromise;
      stopPromise = new Promise((resolvePromise, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolvePromise();
        });
      });
      return stopPromise;
    },
  };
}
