import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';
import prisma from '../db';
import { beginStory } from '../core/narrator';

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

    beginStory(ws, instance.id);
  } catch (err) {
    console.error(err);

    ws.send(
      JSON.stringify({
        type: 'error',
        payload: { message: err },
      }),
    );
  }
}

export { createInstanceHandler };
