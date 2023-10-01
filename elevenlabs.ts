import { ServerWebSocket } from 'bun';
import { WebSocketData } from '.';

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
    console.log('Received message from 11 labs.');
    ws.send(event.data);
  });
  elevenWs.addEventListener('error', (err) => {
    console.error('Error from 11 labs.', err);
  });
  elevenWs.addEventListener('close', () => {
    console.log('Disconnected from 11 labs.');
  });

  return elevenWs;
}

async function audioStreamRequest(
  ws: ServerWebSocket<WebSocketData>,
  text: string,
) {
  if (!process.env.NARRATOR_VOICE_ID) {
    throw new Error('NARRATOR_VOICE_ID is not defined');
  }

  let elevenLabsWS = new WebSocket(
    `wss://api.elevenlabs.io/v1/text-to-speech/${process.env.NARRATOR_VOICE_ID}/stream-input?model_id=eleven_english_v2&output_format=pcm_44100`,
  );

  elevenLabsWS.addEventListener('open', () => {
    console.log('Connected to 11 labs.');

    elevenLabsWS.send(
      JSON.stringify({
        text: text + ' ',
        voice_settings: {
          stability: 0.8,
          similarity_boost: true,
        },
        xi_api_key: process.env.ELEVEN_LABS_API_KEY,
      }),
    );

    elevenLabsWS.send(
      JSON.stringify({
        text: '',
      }),
    );
  });
  elevenLabsWS.addEventListener('message', (event) => {
    console.log('Received message from 11 labs.');
    ws.send(event.data);

    const data = JSON.parse(event.data.toString());
    console.log(`isFinal: `, data.isFinal);
  });
  elevenLabsWS.addEventListener('close', () => {
    console.log('Disconnected from 11 labs.');
  });
}

export { initElevenLabsWs, audioStreamRequest };
