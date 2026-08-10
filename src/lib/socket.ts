import { io } from "socket.io-client";

type LiveSocket = {
  emit: (event: string, ...args: unknown[]) => LiveSocket;
  off: (event: string, listener?: (...args: never[]) => void) => LiveSocket;
  on: (event: string, listener: (...args: never[]) => void) => LiveSocket;
};

const disabledSocket: LiveSocket = {
  emit: () => disabledSocket,
  off: () => disabledSocket,
  on: () => disabledSocket,
};

const socketUrl = process.env.NEXT_PUBLIC_API_SOCKET_URL?.trim();
const shouldConnect = Boolean(socketUrl && socketUrl !== "undefined");

export const socket: LiveSocket = shouldConnect
  ? io(socketUrl!, {
      transports: ["websocket"],
      reconnection: true,
    }) as LiveSocket
  : disabledSocket;
