import { ServerWebSocket } from 'bun';
import { createInstance } from './handlers/instance';

const handlers: {
  [key: string]: (
    ws: ServerWebSocket<{ authToken: string }>,
    data: any,
  ) => void;
} = {
  'create-instance': createInstance,
};

const server = Bun.serve<{ authToken: string }>({
  port: 3001,
  fetch(req, server) {
    const success = server.upgrade(req);
    if (success) {
      // Bun automatically returns a 101 Switching Protocols
      // if the upgrade succeeds
      return undefined;
    }

    // handle HTTP request normally
    return new Response('Hello world!');
  },
  websocket: {
    async open(ws) {
      console.log('Websocket opened: ' + ws);
    },

    async message(ws, message) {
      console.log(`Received: ${message}`);

      const data = JSON.parse(message.toString());

      const handler = handlers[data.type as keyof typeof handlers];
      if (handler) {
        handler(ws, data);
      } else {
        console.error('No handler found for ' + data.type);
      }
    },
  },
});

console.log(`Listening on ${server.hostname}:${server.port}`);
