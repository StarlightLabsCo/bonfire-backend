import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';
import { WebSocketResponseType, send } from '../websocket-schema';

// Documentation: https://docs.elevenlabs.io/api-reference/text-to-speech-websockets

async function initElevenLabsWs(ws: ServerWebSocket<WebSocketData>) {
  if (!process.env.NARRATOR_VOICE_ID) {
    throw new Error('NARRATOR_VOICE_ID is not defined');
  }

  let elevenWs = new WebSocket(
    `wss://api.elevenlabs.io/v1/text-to-speech/${process.env.NARRATOR_VOICE_ID}/stream-input?model_id=eleven_english_v2&output_format=pcm_44100`,
  );

  elevenWs.addEventListener('open', () => {
    console.log('Connected to 11 labs.');

    elevenWs.send(
      JSON.stringify({
        text: ' ',
        voice_settings: {
          stability: 0.8,
          similarity_boost: true,
        },
        xi_api_key: process.env.ELEVEN_LABS_API_KEY,
      }),
    );
  });

  elevenWs.addEventListener('message', (event) => {
    const data = JSON.parse(event.data.toString());

    send(ws, {
      type: WebSocketResponseType.audio,
      payload: {
        id: '',
        content: data.audio,
      },
    });
  });
  elevenWs.addEventListener('error', (err) => {
    console.error('Error from 11 labs.', err);
  });
  elevenWs.addEventListener('close', () => {
    console.log('Disconnected from 11 labs.');
  });

  // return elevenWas after it's connected
  return new Promise<WebSocket>((resolve) => {
    elevenWs.addEventListener('open', () => {
      resolve(elevenWs);
    });
  });
}

export { initElevenLabsWs };