import { ServerWebSocket } from 'bun';
import db from './db';
import { createInstanceHandler } from './handlers/instance';
import { welcomeHandler } from './handlers/welcome';
import { addPlayerMessage } from './handlers/messages';
import { generateImage } from './sdxl';

export type WebSocketData = {
  userId: string;
};

const handlers: {
  [key: string]: (ws: ServerWebSocket<WebSocketData>, data: any) => void;
} = {
  welcome: welcomeHandler,
  'create-instance': createInstanceHandler,
  'add-player-message': addPlayerMessage,
};

const server = Bun.serve<WebSocketData>({
  port: 3001,
  async fetch(req, server) {
    // Authorization
    const sessionToken = req.headers
      .get('cookie')
      ?.split('; ')
      .find((row) => row.startsWith('next-auth.session-token='));

    const tokenValue = sessionToken?.split('=')[1];

    const session = await db.session.findUnique({
      where: {
        sessionToken: tokenValue,
      },
    });

    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Upgrade to WebSocket
    const success = server.upgrade(req, {
      data: {
        userId: session.userId,
      },
    });
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
      console.log('Websocket opened. User ID: ' + ws.data.userId);
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

    async close(ws) {
      console.log('Websocket closed. User ID: ' + ws.data.userId);
    },
  },
});

console.log(`Listening on ${server.hostname}:${server.port}`);
