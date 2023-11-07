import { ServerWebSocket } from 'bun';
import { WebSocketAuthenticationToken } from '@prisma/client';
import { authHandler } from './handlers/auth';
import { welcomeHandler } from './handlers/welcome';
import { createInstanceHandler } from './handlers/instance';
import { addPlayerMessage, undo } from './handlers/messages';
import { processVoiceEnd, processVoiceInput } from './handlers/voice';
import { stopAudioHandler } from './handlers/stopAudio';
import Redis from 'ioredis';

export const redis = new Redis({
  port: process.env.REDISPORT ? parseInt(process.env.REDISPORT) : 6379,
  host: process.env.REDISHOST || 'localhost',
  username: process.env.REDISUSER,
  password: process.env.REDISPASSWORD,
});

export let connectionIdToWebSocket: {
  [key: string]: ServerWebSocket<WebSocketData> | null;
} = {};

export type WebSocketData = {
  timeout: Timer | null;
  heartbeat: Timer | null;
  webSocketToken: WebSocketAuthenticationToken | null;
};

const handlers: {
  [key: string]: (ws: ServerWebSocket<WebSocketData>, data: any) => void;
} = {
  auth: authHandler,
  welcome: welcomeHandler,
  createInstance: createInstanceHandler,
  voice: processVoiceInput,
  voiceEnd: processVoiceEnd,
  addPlayerMessage: addPlayerMessage,
  undo: undo,
  stopAudio: stopAudioHandler,
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

    return new Response('Not found', { status: 404 });
  },
  websocket: {
    async open(ws) {
      console.log('Websocket opened: ' + ws.remoteAddress);

      const timeout = setTimeout(() => {
        console.log('Closing websocket due to timeout. Did not authenticate.');
        ws.close();
      }, 2000);

      const heartbeat = setInterval(() => {
        ws.ping();
      }, 30000);

      ws.data.timeout = timeout;
      ws.data.heartbeat = heartbeat;
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

      if (ws.data.timeout) {
        clearTimeout(ws.data.timeout);
      }

      if (ws.data.heartbeat) {
        clearInterval(ws.data.heartbeat);
      }
    },
  },
});

console.log(`Listening on ${server.hostname}:${server.port}`);
