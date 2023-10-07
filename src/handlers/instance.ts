import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';
import prisma from '../lib/db';
import { step } from '../core/story';
import { WebSocketResponseType, send } from '../websocket-schema';

async function createInstanceHandler(
  ws: ServerWebSocket<WebSocketData>,
  data: {
    type: 'createInstance';
    payload: { userId: string; description: string };
  },
) {
  try {
    const instance = await prisma.instance.create({
      data: {
        user: {
          connect: {
            id: data.payload.userId,
          },
        },
        description: data.payload.description,
      },
    });

    console.log('Created instance: ' + instance.id);

    step(ws, instance.id);
  } catch (err) {
    console.error(err);

    send(ws, {
      type: WebSocketResponseType.error,
      payload: {
        id: '',
        content: err as string,
      },
    });
  }
}

export { createInstanceHandler };
