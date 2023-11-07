import { ServerWebSocket } from 'bun';
import { WebSocketData } from '.';

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

function send(ws: ServerWebSocket<WebSocketData>, data: WebSocketResponse) {
  ws.send(JSON.stringify(data));
}

export { WebSocketResponse, WebSocketResponseType, send };
