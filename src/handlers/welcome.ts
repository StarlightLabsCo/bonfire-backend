import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';
import db from '../lib/db';
import {
  finishElevenLabsWs,
  initElevenLabsWs,
  sendToElevenLabsWs,
} from '../services/elevenlabs';
import { hasTokensLeft } from '../lib/pricing';

async function welcomeHandler(
  ws: ServerWebSocket<WebSocketData>,
  data: {
    type: 'welcome';
    payload: { description: string };
  },
) {
  const canPlay = await hasTokensLeft(ws.data.webSocketToken?.userId!, ws);
  if (!canPlay) return;

  const user = await db.user.findUnique({
    where: {
      id: ws.data.webSocketToken?.userId,
    },
  });

  if (!user) {
    console.error('User not found');
    return;
  }

  let name = user.name ? user.name.split(' ')[0] : 'there';

  let initialWelcome = `Ah, hello ${name}. Are you ready for an adventure?`; // TODO: make this dynamic

  let elevenLabsWs = await initElevenLabsWs(ws);
  sendToElevenLabsWs(elevenLabsWs, '', initialWelcome);
  finishElevenLabsWs(elevenLabsWs, '');
}

export { welcomeHandler };
