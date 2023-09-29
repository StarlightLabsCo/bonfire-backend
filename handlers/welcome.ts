import { ServerWebSocket } from 'bun';
import { generateAudio } from '../elevenlabs';
import { WebSocketData } from '..';
import db from '../db';

async function welcomeHandler(ws: ServerWebSocket<WebSocketData>, data: any) {
  const user = await db.user.findUnique({
    where: {
      id: ws.data.userId,
    },
  });

  if (!user) {
    console.error('User not found');
    return;
  }

  const audio = await generateAudio(
    user.name
      ? `Ah, hello ${
          user.name.split(' ')[0]
        }.<break time="0.5s" /> Are you ready for an adventure?`
      : 'Ah hello there. <break time="0.5s" /> Are you ready for an adventure?',
    '1Tbay5PQasIwgSzUscmj',
  );

  if (!audio) {
    console.error('No audio returned');
    return;
  }

  ws.send(
    JSON.stringify({
      type: 'audio',
      payload: {
        audio: audio,
      },
    }),
  );
}

export { welcomeHandler };
