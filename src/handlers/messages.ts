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
  const prisma = require('@prisma/client').prisma;

  async function getMessagesToUndo() {
    // Find the two most recent 'Suggestions'
    const suggestionMessages = await prisma.message.findMany({
      where: {
        role: 'function',
        content: {
          type: 'generate_suggestions',
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 2,
    });

    // If there's less than 2 suggestion messages, return empty (or handle appropriately)
    if (suggestionMessages.length < 2) {
      return [];
    }

    const secondMostRecentSuggestion = suggestionMessages[1];

    // Fetch all messages after the second most recent 'Suggestions' until the most recent 'Suggestions'
    const messagesToDelete = await prisma.message.findMany({
      where: {
        createdAt: {
          gte: secondMostRecentSuggestion.createdAt,
          lt: suggestionMessages[0].createdAt,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return messagesToDelete;
  }

  getMessagesToUndo().then((messages) => {
    console.log(messages);
    messages.forEach((message: Message) => {
      console.log(message.content);
    });
    // If you wish to delete them:
    // messages.forEach(async message => {
    //   await prisma.message.delete({ where: { id: message.id } });
    // });
    send(ws, {
      type: WebSocketResponseType['delete-messages'],
      payload: {
        id: data.payload.instanceId,
        content: {
          ids: [messages.map((message: Message) => message.id)],
        },
      },
    });
  });
}

export { addPlayerMessage, undo };
