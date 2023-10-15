import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';
import { transcribeAudio, finishTranscription } from '../services/assembly';

async function processVoiceInput(
  ws: ServerWebSocket<WebSocketData>,
  data: {
    type: 'voice';
    payload: string;
  },
) {
  transcribeAudio(ws, data.payload);
}

async function processVoiceEnd(
  ws: ServerWebSocket<WebSocketData>,
  data: {
    type: 'voiceEnd';
  },
) {
  finishTranscription(ws);
}

export { processVoiceInput, processVoiceEnd };
