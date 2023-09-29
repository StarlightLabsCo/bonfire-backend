import { ServerWebSocket } from 'bun';
import db from '../db';
import { audioStreamRequest } from '../elevenlabs';
import { openai } from '../openai';
import { WebSocketData } from '..';
import { MessageRole } from '@prisma/client';

type Message = {
  role: 'system' | 'assistant' | 'user' | 'function';
  content: string;
};

async function init(description: string) {
  let messages = [] as Message[];

  messages.push({
    role: 'system',
    content:
      'You are an experienced Dungeon Master, filled with the knowledge of ages. You have a wit as sharp as a dagger, and a heart as pure as gold. You are the master of your own destiny, and the destiny of others. You seek to create a world of your own, and to share it with others, and get a few laughs or cries along the way. An epic story awaits, for you are the Dungeon Master, and you are the narrator of this story. Do not refer to yourself, and speak of your adventurers in the third person. \n\n' +
      'The provided description of the story is as follows: ' +
      description,
  });

  return messages;
}

async function feel() {}

async function plan() {}

async function say() {}

// ----------------------------------------------

async function beginStory(
  ws: ServerWebSocket<WebSocketData>,
  instanceId: string,
) {
  console.log('Beginning story for instance: ' + instanceId);

  const instance = await db.instance.findUnique({
    where: {
      id: instanceId,
    },
  });

  if (!instance) {
    console.error('Instance not found');
    return;
  }

  const messages = await init(instance.description);

  const response = await openai.chat.completions.create({
    messages: messages,
    model: 'gpt-3.5-turbo',
    functions: [
      {
        name: 'introduce_story_and_characters',
        description:
          'A short introduction to the story and characters ending with an interesting situation or starting point where the story begins for the players. Avoid newline charcters, and keep the story to a single paragraph.',
        parameters: {
          type: 'object',
          properties: {
            introduction: {
              type: 'string',
            },
          },
        },
      },
    ],
    function_call: {
      name: 'introduce_story_and_characters',
    },
  });

  if (!response.choices) {
    console.error('No response from OpenAI');
    return;
  }

  const choice = response.choices[0];
  if (choice.message.function_call) {
    const function_call = choice.message.function_call;

    const data = JSON.parse(function_call.arguments);

    // Create message
    const message = await db.message.create({
      data: {
        instance: {
          connect: {
            id: instanceId,
          },
        },
        content: data.introduction,
        role: MessageRole.assistant,
      },
    });

    ws.send(JSON.stringify({ type: 'message-append', payload: message }));

    if (!process.env.NARRATOR_VOICE_ID) {
      console.error('No narrator voice ID');
      return;
    }

    await audioStreamRequest(ws, data.introduction);

    ws.send(
      JSON.stringify({
        type: 'instance-created',
        payload: { instanceId: instance.id },
      }),
    );
  } else {
    console.error('No function call');
    console.log(choice);
    return;
  }
}

async function continueStory(
  ws: ServerWebSocket<WebSocketData>,
  instanceId: string,
) {
  const dbMessages = await db.message.findMany({
    where: {
      instanceId: instanceId,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  const messages = dbMessages.map((message) => {
    return {
      role: message.role,
      content: message.content,
    };
  });

  const response = await openai.chat.completions.create({
    messages: messages,
    model: 'gpt-3.5-turbo',
    functions: [
      {
        name: 'continue_story',
        description:
          'Continue the story based on the previous messages, integrating what the players said, but also not letting them take over the story. Keep it grounded in the world you created, and make sure to keep the story moving forward. Avoid newline charcters, and keep the story to a single paragraph.',
        parameters: {
          type: 'object',
          properties: {
            story: {
              type: 'string',
            },
          },
        },
      },
    ],
    function_call: {
      name: 'continue_story',
    },
  });

  if (!response.choices) {
    console.error('No response from OpenAI');
    return;
  }

  const choice = response.choices[0];
  if (choice.message.function_call) {
    const function_call = choice.message.function_call;
    console.log(function_call.arguments);

    const data = JSON.parse(function_call.arguments);
    console.log(data);

    // Create message
    const message = await db.message.create({
      data: {
        instance: {
          connect: {
            id: instanceId,
          },
        },
        content: data.story,
        role: MessageRole.assistant,
      },
    });

    ws.send(JSON.stringify({ type: 'message-append', payload: message }));

    if (!process.env.NARRATOR_VOICE_ID) {
      console.error('No narrator voice ID');
      return;
    }

    await audioStreamRequest(ws, data.story);
  } else {
    console.error('No function call');
    console.log(choice);
    return;
  }
}

export { beginStory, continueStory };
