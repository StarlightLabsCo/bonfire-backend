import { ServerWebSocket } from 'bun';
import { audioStreamRequest } from '../elevenlabs';
import { WebSocketData } from '..';
import db from '../db';

async function welcomeHandler(ws: ServerWebSocket<WebSocketData>, data: any) {
  const user = await db.user.findUnique({
    where: {
      id: ws.data.webSocketToken?.userId,
    },
  });

  if (!user) {
    console.error('User not found');
    return;
  }

  await audioStreamRequest(
    ws,
    user.name
      ? `Ah, hello ${user.name.split(' ')[0]}. Are you ready for an adventure?`
      : 'Ah hello there. Are you ready for an adventure?',
  );
}

export { welcomeHandler };
