import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';
import db from '../lib/db';
import { Message, openai } from '../services/openai';
import { initElevenLabsWs } from '../services/elevenlabs';

async function welcomeHandler(
  ws: ServerWebSocket<WebSocketData>,
  data: {
    type: 'welcome';
    payload: { description: string };
  },
) {
  const user = await db.user.findUnique({
    where: {
      id: ws.data.webSocketToken?.userId,
    },
  });

  if (!user) {
    console.error('User not found');
    return;
  }

  let name = user.name ? user.name.split(' ')[0] : 'there';

  let initialWelcome = `Ah, hello ${name}. Are you ready for an adventure?`;

  let elevenLabsWs = await initElevenLabsWs(ws);
  elevenLabsWs.send(JSON.stringify({ text: initialWelcome }));
  elevenLabsWs.send(JSON.stringify({ text: '' }));

  // banter(ws, name, data.payload.description, initialWelcome);
}

async function banter(
  ws: ServerWebSocket<WebSocketData>,
  name: string,
  description: string,
  initialWelcome: string,
) {
  let messages = [] as Message[];
  messages.push({
    role: 'system',
    content:
      'You are an experienced storyteller. You have a wit as sharp as a dagger, and a heart as pure as gold. You are the master of your own destiny, and the destiny of others. You seek to create a world of your own, and to share it with others, getting a few laughs or cries along the way. \n\n' +
      `${name}'s request for a a follows: \n` +
      description,
  });

  messages.push({
    role: 'assistant',
    content: initialWelcome,
  });

  const response = await openai.chat.completions.create({
    messages: messages,
    model: 'gpt-4',
    functions: [
      {
        name: 'generate_banter',
        description:
          "Thinking of a good story takes some time, engage in some fun banter while the story is being generated. No newlines. Keep it short & sweet! Comment at the end that you're almost ready to begin.",
        parameters: {
          type: 'object',
          properties: {
            banter: {
              type: 'string',
            },
          },
        },
      },
    ],
    function_call: {
      name: 'generate_banter',
    },
  });

  if (!response.choices[0].message.function_call) {
    console.error('[plan] No function call found');
    return;
  }

  const banterArgs = JSON.parse(
    response.choices[0].message.function_call.arguments,
  );

  let banter = banterArgs.banter.replace('\\n', '').replace('\\"', '"');

  console.log(`Banter: ${banter}`);

  let elevenLabsWs = await initElevenLabsWs(ws);
  elevenLabsWs.send(JSON.stringify({ text: banter }));
  elevenLabsWs.send(JSON.stringify({ text: '' }));
}

export { welcomeHandler };
