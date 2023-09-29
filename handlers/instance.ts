import { ServerWebSocket } from 'bun';
import prisma from '../db';

async function createInstance(
  ws: ServerWebSocket<{ authToken: string }>,
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

    ws.send(
      JSON.stringify({
        type: 'instance-created',
        payload: { instanceId: instance.id },
      }),
    );
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

export { createInstance };
