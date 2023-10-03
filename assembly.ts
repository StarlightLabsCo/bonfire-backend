import { ServerWebSocket } from 'bun';
import { WebSocketData } from '.';

const CHANNELS = 1;
const SAMPLE_RATE = 16000;

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
    console.log('Received message from AssemblyAI.', event.data);
    ws.send(event.data);
  });

  assemblyWs.addEventListener('error', (err) => {
    console.error('Error from AssemblyAI.', err);
  });

  assemblyWs.addEventListener('close', () => {
    console.log('Disconnected from AssemblyAI.');
  });

  return assemblyWs;
}

export { initAssemblyWs };
