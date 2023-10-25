import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';
import { WebSocketResponseType, send } from '../websocket';

// Documentation: https://www.assemblyai.com/docs/guides/real-time-streaming-transcription

const SAMPLE_RATE = 44100;
const assemblyWebsockets = new Map<string, WebSocket>();

async function initAssemblyWs(ws: ServerWebSocket<WebSocketData>) {
  if (!process.env.ASSEMBLYAI_API_KEY) {
    throw new Error('ASSEMBLYAI_API_KEY is not defined');
  }

  const assemblyWs = new WebSocket(
    `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=${SAMPLE_RATE}`,
    {
      headers: {
        authorization: process.env.ASSEMBLYAI_API_KEY,
      },
    },
  );

  assemblyWs.addEventListener('open', () => {
    console.log('Connected to AssemblyAI.');
  });

  assemblyWs.addEventListener('message', (event) => {
    const data = JSON.parse(event.data as string);

    console.log('Received data from AssemblyAI.', data);

    if (data.text) {
      send(ws, {
        type: WebSocketResponseType.transcription,
        payload: {
          id: '',
          content: data.text,
        },
      });
    }

    if (data.message_type === 'FinalMessage') {
      assemblyWs?.send(JSON.stringify({ terminate_session: true }));
    } else if (data.message_type === 'SessionTerminated') {
      assemblyWs?.close();
      assemblyWebsockets.delete(ws.data.webSocketToken!.userId);
    }
  });

  assemblyWs.addEventListener('error', (err) => {
    console.error('Error from AssemblyAI.', err);
    assemblyWs.close();
    assemblyWebsockets.delete(ws.data.webSocketToken!.userId);
  });

  assemblyWs.addEventListener('close', () => {
    console.log('Disconnected from AssemblyAI.');
    assemblyWebsockets.delete(ws.data.webSocketToken!.userId);
  });

  assemblyWebsockets.set(ws.data.webSocketToken!.userId, assemblyWs);

  return assemblyWs;
}

async function transcribeAudio(
  ws: ServerWebSocket<WebSocketData>,
  base64Audio: string,
) {
  let assemblyWs = assemblyWebsockets.get(ws.data.webSocketToken!.userId);
  if (!assemblyWs) {
    console.log('Initializing AssemblyAI websocket.');
    assemblyWs = await initAssemblyWs(ws);
  }

  try {
    console.log('Sending data to AssemblyAI.');
    assemblyWs.send(JSON.stringify({ audio_data: base64Audio }));
  } catch (e) {
    console.error('Error sending data to AssemblyAI.', e);
  }
}

async function finishTranscription(ws: ServerWebSocket<WebSocketData>) {
  const assemblyWs = assemblyWebsockets.get(ws.data.webSocketToken!.userId);

  if (assemblyWs) {
    const buffer = Buffer.alloc(44100 * 2);
    let base64Buffer = buffer.toString('base64');
    assemblyWs.send(JSON.stringify({ audio_data: base64Buffer }));
    assemblyWs.send(JSON.stringify({ terminate_session: true }));
  } else {
    console.log('No AssemblyAI websocket found to terminate.');
  }
}

export { initAssemblyWs, transcribeAudio, finishTranscription };
