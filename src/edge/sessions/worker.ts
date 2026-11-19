import { MemorySessionIndex } from "./index";
import { SessionRefresh } from "./refresh";
import type {
  SessionWorkerRequest,
  SessionWorkerResponse,
} from "./worker-messages";

declare const self: Worker;

function send(message: SessionWorkerResponse): void {
  self.postMessage(message);
}

const refresh = new SessionRefresh(
  new MemorySessionIndex(),
  (directory, error) =>
    send({ type: "error", directory, message: String(error) }),
  (directory, sessions) => send({ type: "snapshot", directory, sessions }),
);

self.onmessage = (event: MessageEvent<SessionWorkerRequest>) => {
  const message = event.data;
  switch (message.type) {
    case "register":
      refresh.register(message.instanceId, message.sessionFile);
      break;
    case "unregister":
      refresh.unregister(message.instanceId);
      break;
  }
};
refresh.start();
