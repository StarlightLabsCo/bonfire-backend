import { ServerWebSocket } from 'bun';
import { WebSocketData, connectionIdToWebSocket, redis } from '.';

// Place to keep track of all the websocket responses from server to client

enum WebSocketResponseType {
  'adventure-suggestions',
  'instance',
  'stop-audio',
  'message',
  'message-append',
  'image',
  'suggestions',
  'audio',
  'transcription',
  'outOfCredits',
  'error',
}
type WebSocketResponse = {
  type: WebSocketResponseType;
  payload: {
    id: string;
    content: string | object;
  };
};

async function send(
  ws: ServerWebSocket<WebSocketData>,
  data: WebSocketResponse,
) {
  const websocket = connectionIdToWebSocket[ws.data.connectionId!];
  if (websocket && websocket.readyState === 1) {
    websocket.send(JSON.stringify(data));
  } else {
    redis.rpush(ws.data.connectionId!, JSON.stringify(data));
  }
}

export { WebSocketResponse, WebSocketResponseType, send };
