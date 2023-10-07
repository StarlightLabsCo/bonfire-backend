import { ServerWebSocket } from 'bun';
import { WebSocketAuthenticationToken } from '@prisma/client';
import { AuthHandler } from './handlers/auth';
import { welcomeHandler } from './handlers/welcome';
import { createInstanceHandler } from './handlers/instance';
import { addPlayerMessage, undo } from './handlers/messages';
import { processVoiceEnd, processVoiceInput } from './handlers/voice';

export type WebSocketData = {
  timeout: Timer | null;
  webSocketToken: WebSocketAuthenticationToken | null;
};

const handlers: {
  [key: string]: (ws: ServerWebSocket<WebSocketData>, data: any) => void;
} = {
  auth: AuthHandler,
  welcome: welcomeHandler,
  'create-instance': createInstanceHandler,
  voice: processVoiceInput,
  'voice-end': processVoiceEnd,
  'add-player-message': addPlayerMessage,
  undo: undo,
};

const server = Bun.serve<WebSocketData>({
  port: process.env.PORT ? parseInt(process.env.PORT) : 80,
  async fetch(req, server) {
    const success = server.upgrade(req, {
      data: {
        timeout: null,
        webSocketToken: null,
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
      console.log('Websocket opened: ' + ws.remoteAddress);

      const timeout = setTimeout(() => {
        console.log('Closing websocket due to timeout. Did not authenticate.');
        ws.close();
      }, 2000);

      ws.data.timeout = timeout;
    },

    async message(ws, message) {
      const data = JSON.parse(message.toString());

      // If the websocket is not authenticated, only allow auth messages.
      if (!ws.data.webSocketToken) {
        if (data.type !== 'auth') {
          console.error('Unauthorized websocket message.');
          return;
        }
      }

      const handler = handlers[data.type as keyof typeof handlers];
      if (handler) {
        handler(ws, data);
      } else {
        console.error('No handler found for ' + data.type);
      }
    },

    async close(ws) {
      console.log(
        'Websocket closed. ' + ws.remoteAddress + ' ' + ws.data.webSocketToken,
      );
    },
  },
});

console.log(`Listening on ${server.hostname}:${server.port}`);
