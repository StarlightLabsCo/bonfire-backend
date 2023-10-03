import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';
import { initAssemblyWs } from '../assembly';

const assemblyWebsockets = new Map<string, WebSocket>();

async function processVoiceInput(
  ws: ServerWebSocket<WebSocketData>,
  data: {
    type: 'voice';
    payload: string;
  },
) {
  let assemblyWs = assemblyWebsockets.get(ws.data.webSocketToken!.userId);
  if (!assemblyWs) {
    assemblyWs = await initAssemblyWs(ws);
    assemblyWebsockets.set(ws.data.webSocketToken!.userId, assemblyWs);
  }

  assemblyWs.send(data.payload); // TODO
}

export { processVoiceInput };
