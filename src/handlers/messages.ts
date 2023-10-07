import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';
import { MessageRole } from '@prisma/client';
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
  ws: ServerWebSocket,
  data: {
    type: 'undo';
    payload: { instanceId: string };
  },
) {
  // const messages = await db.message.findMany({
  //   where: {
  //     instanceId: data.payload.instanceId,
  //   },
  //   orderBy: {
  //     createdAt: 'desc',
  //   },
  // });
  // if (messages.length === 0) {
  //   return;
  // }
  // // TODO: delete the last suggestion, the last image, the last narrator message, and the last user message
  // // TODO: and then send back the suggestions right before that
  // const lastMessage = messages[0]; // suggestions
  // const secondLastMessage = messages[1]; // image
  // const thirdLastMessage = messages[2]; // narrator
  // const fourthLastMessage = messages[3]; // user
  // const fifthLastMessage = messages[4]; // new suggestions
  // for (const message of messages) {
  //   if (message.id === fifthLastMessage.id) {
  //     break;
  //   }
  //   await db.message.delete({
  //     where: {
  //       id: message.id,
  //     },
  //   });
  //   send(ws, {
  //     type: WebSocketResponseType['message'],
  //     payload: {
  //       id: message.id,
  //     },
  //   });
  // }
  // send(ws, {
  //   type: WebSocketResponseType.suggestions,
  //   payload: {
  //     id: fifthLastMessage.id,
  //     content: JSON.parse(fifthLastMessage.content),
  //   },
  // });
}

export { addPlayerMessage, undo };
