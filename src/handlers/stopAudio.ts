import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';
import { userIdToElevenLabsWs } from '../services/elevenlabs';

async function stopAudioHandler(
  ws: ServerWebSocket<WebSocketData>,
  data: {
    type: 'stopAudio';
    payload: {};
  },
) {
  const elevenLabsWs = userIdToElevenLabsWs[ws.data.webSocketToken?.userId!];
  if (!elevenLabsWs) return;

  elevenLabsWs.close();
  delete userIdToElevenLabsWs[ws.data.webSocketToken?.userId!];
}

export { stopAudioHandler };
