import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';
import { MessageRole } from '@prisma/client';
import db from '../db';
import { continueStory } from '../core/narrator';

async function addPlayerMessage(
  ws: ServerWebSocket<WebSocketData>,
  data: {
    type: 'add-player-message';
    payload: { instanceId: string; content: string };
  },
) {
  await db.message.create({
    data: {
      instance: {
        connect: {
          id: data.payload.instanceId,
        },
      },
      content: data.payload.content,
      role: MessageRole.user,
    },
  });

  continueStory(ws, data.payload.instanceId);
}

export { addPlayerMessage };
