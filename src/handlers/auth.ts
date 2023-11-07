import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';
import db from '../lib/db';
import { hasTokensLeft } from '../lib/pricing';
import { generateAdventureSuggestions } from '../core/suggestions';

async function authHandler(ws: ServerWebSocket<WebSocketData>, data: any) {
  const token = data.payload;

  console.log('Authenticating websocket with token: ' + token);

  const webSocketToken = await db.webSocketAuthenticationToken.findUnique({
    where: {
      token: token,
    },
  });

  if (!webSocketToken || webSocketToken.expires < new Date()) {
    console.error('Provided token is invalid.');
    return;
  } else {
    ws.data.webSocketToken = webSocketToken;
    console.log('Websocket authenticated. User ID: ' + webSocketToken.userId);

    clearTimeout(ws.data.timeout!);

    // Generating suggestions for adventures
    const canPlay = await hasTokensLeft(webSocketToken.userId, ws);
    if (!canPlay) return;

    console.log(
      'Generating adventure suggestions for user',
      webSocketToken.userId,
    );
    generateAdventureSuggestions(ws, webSocketToken.userId);
  }
}

export { authHandler };
