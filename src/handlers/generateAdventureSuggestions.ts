import { hasTokensLeft } from '../lib/pricing';
import { generateAdventureSuggestions } from '../core/suggestions';
import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';

async function generateAdventureSuggestionsHandler(
  ws: ServerWebSocket<WebSocketData>,
  data: {
    type: 'generateAdventureSuggestions';
    payload: {};
  },
) {
  const canPlay = await hasTokensLeft(ws.data.webSocketToken!.userId, ws);
  if (!canPlay) return;

  console.log(
    'Generating adventure suggestions for user',
    ws.data.webSocketToken!.userId,
  );
  generateAdventureSuggestions(ws, ws.data.webSocketToken!.userId);
}

export { generateAdventureSuggestionsHandler };