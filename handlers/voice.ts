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
    console.log('Initializing AssemblyAI websocket.');
    assemblyWs = await initAssemblyWs();

    assemblyWs.addEventListener('message', (event) => {
      const data = JSON.parse(event.data as string);

      console.log('Received data from AssemblyAI.', data);

      if (data.text) {
        ws.send(
          JSON.stringify({
            type: 'transcription',
            payload: data.text,
          }),
        );
      }

      if (data.message_type === 'FinalMessage') {
        assemblyWs?.send(JSON.stringify({ terminate_session: true }));
      } else if (data.message_type === 'SessionTerminated') {
        assemblyWs?.close();
        assemblyWebsockets.delete(ws.data.webSocketToken!.userId);
      }
    });

    assemblyWebsockets.set(ws.data.webSocketToken!.userId, assemblyWs);
  }

  try {
    console.log('Sending data to AssemblyAI.');
    assemblyWs.send(JSON.stringify({ audio_data: data.payload }));
  } catch (e) {
    console.log(data);
    console.error('Error sending data to AssemblyAI.', e);
  }
}

async function processVoiceEnd(
  ws: ServerWebSocket<WebSocketData>,
  data: {
    type: 'voice_end';
  },
) {
  const assemblyWs = assemblyWebsockets.get(ws.data.webSocketToken!.userId);
  if (assemblyWs) {
    const buffer = Buffer.alloc(44100 * 2);
    let base64Buffer = buffer.toString('base64');
    assemblyWs.send(JSON.stringify({ audio_data: base64Buffer }));

    assemblyWs.send(JSON.stringify({ terminate_session: true }));
  }
}

export { processVoiceInput, processVoiceEnd };
