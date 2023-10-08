import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';
import { Message, MessageRole } from '@prisma/client';
import db from '../lib/db';
import { step } from '../core/story';
import { WebSocketResponseType, send } from '../websocket-schema';

async function addPlayerMessage(
  ws: ServerWebSocket<WebSocketData>,
  data: {
    type: 'add-player-message';
    payload: { instanceId: string; content: string };
  },
) {
  console.log(
    'addPlayerMessage',
    data.payload.instanceId,
    data.payload.content,
  );
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

  step(ws, data.payload.instanceId);
}

async function undo(
  ws: ServerWebSocket<WebSocketData>,
  data: {
    type: 'undo';
    payload: { instanceId: string };
  },
) {
  async function getMessagesToUndo() {
    const messages = await db.message.findMany({
      where: {
        instanceId: data.payload.instanceId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    let generateSuggestionsCount = 0;

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      if (message.role === MessageRole.function) {
        const content = JSON.parse(message.content);

        if (content.type === 'generate_suggestions') {
          generateSuggestionsCount++;
          if (generateSuggestionsCount === 2) {
            return messages.slice(0, i);
          }
        }

        continue;
      }
    }

    return [];
  }

  const messagesToDelete = await getMessagesToUndo();
  if (messagesToDelete.length === 0) {
    console.log(
      'No messages to delete -- couldnt find 2nd to last generate_suggestions',
    );
  }

  for (let i = 0; i < messagesToDelete.length; i++) {
    const message = messagesToDelete[i];
    console.log('Deleting message', message.id, message.role);
    await db.message.delete({ where: { id: message.id } });
  }
}

export { addPlayerMessage, undo };
