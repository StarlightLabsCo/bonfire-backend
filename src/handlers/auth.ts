import { ServerWebSocket } from 'bun';
import { WebSocketData, connectionIdToWebSocket, redis } from '..';
import db from '../lib/db';

async function authHandler(
  ws: ServerWebSocket<WebSocketData>,
  data: {
    type: 'auth';
    payload: {
      token: string;
      connectionId: string;
    };
  },
) {
  const { token, connectionId } = data.payload;

  const webSocketToken = await db.webSocketAuthenticationToken.findUnique({
    where: {
      token,
    },
  });

  if (!webSocketToken || webSocketToken.expires < new Date()) {
    console.error('Provided token is invalid.');
    return;
  } else {
    ws.data.webSocketToken = webSocketToken;
    ws.data.connectionId = connectionId;

    connectionIdToWebSocket[connectionId] = ws;

    console.log(
      'Websocket authenticated. User ID: ' +
        webSocketToken.userId +
        '. Connection ID: ' +
        connectionId,
    );

    clearTimeout(ws.data.timeout!);

    // Clear out any old connectionIds from the user
    const oldKeys = await redis.keys(`${webSocketToken.userId}-*`);
    const keysToDelete = oldKeys.filter(
      (key) => key !== `${webSocketToken.userId}-${connectionId}`,
    );
    if (keysToDelete.length > 0) {
      console.log(`Deleting old connection keys: ${keysToDelete}`);
      await redis.del(...keysToDelete);
    }

    // Send any queued messages
    const queuedMessages = await redis.lrange(connectionId, 0, -1);
    for (const message of queuedMessages) {
      ws.send(message);
    }
    await redis.del(connectionId);
  }
}

export { authHandler };
