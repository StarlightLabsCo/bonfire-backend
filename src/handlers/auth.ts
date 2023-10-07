import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';
import db from '../lib/db';

async function AuthHandler(ws: ServerWebSocket<WebSocketData>, data: any) {
  const token = data.payload;

  const webSocketToken = await db.webSocketAuthenticationToken.findUnique({
    where: token,
  });

  if (!webSocketToken) {
    console.error('Provided token is invalid.');
    return;
  } else {
    ws.data.webSocketToken = webSocketToken;
    console.log('Websocket authenticated. User ID: ' + webSocketToken.userId);

    clearTimeout(ws.data.timeout!);
  }
}

export { AuthHandler };
