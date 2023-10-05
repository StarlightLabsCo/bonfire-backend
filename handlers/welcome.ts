import { ServerWebSocket } from 'bun';
import { audioStreamRequest } from '../elevenlabs';
import { WebSocketData } from '..';
import db from '../db';
import { openai } from '../openai';
import { Message } from '../core/narrator';

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

  await audioStreamRequest(ws, initialWelcome);

  let messages = [] as Message[];
  messages.push({
    role: 'system',
    content:
      'You are an experienced storyteller. You have a wit as sharp as a dagger, and a heart as pure as gold. You are the master of your own destiny, and the destiny of others. You seek to create a world of your own, and to share it with others, getting a few laughs or cries along the way. \n\n' +
      `${name}'s request for a a follows: \n` +
      data.payload.description,
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
        name: 'banter',
        description:
          "Thinking of a good story takes some time, engage in some fun banter while the story is being generated. No newlines. Keep it short & sweet! Comment at the end that you're almost ready to begin.",
        parameters: {
          type: 'object',
          properties: {
            banter: {
              type: 'string',
              description: 'No newlines. Keep it short & sweet!',
            },
          },
        },
      },
    ],
    function_call: {
      name: 'banter',
    },
  });

  if (!response.choices[0].message.function_call) {
    console.error('[plan] No function call found');
    return messages;
  }

  const banterArgs = JSON.parse(
    response.choices[0].message.function_call.arguments,
  );

  let banter = banterArgs.banter.replace('\\n', '').replace('\\"', '"');

  console.log(`Banter: ${banter}`);

  audioStreamRequest(ws, banter);
}

export { welcomeHandler };
