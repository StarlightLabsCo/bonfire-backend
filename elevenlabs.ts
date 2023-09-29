function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  let bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function generateAudio(text: string, voiceId: string) {
  if (!process.env.ELEVEN_LABS_API_KEY) {
    throw new Error('ELEVEN_LABS_API_KEY is not defined');
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        accept: 'audio/mpeg',
        'xi-api-key': process.env.ELEVEN_LABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_english_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to generate audio: ${response.statusText}`);
  }

  const audioData = await response.arrayBuffer();
  const audioBase64 = arrayBufferToBase64(audioData);

  return audioBase64;
}

export { generateAudio };
