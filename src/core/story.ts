import { ServerWebSocket } from 'bun';
import { MessageRole } from '@prisma/client';
import db from '../lib/db';
import { openai } from '../services/openai';
import { initElevenLabsWs } from '../services/elevenlabs';

import { WebSocketData } from '..';
import { initStory } from './init';
import { planStory } from './plan';
import { getMessages } from './utils';
import { generateSuggestions } from './suggestions';
import { generateImageFromStory, generateImagePlaceholder } from './images';
import { WebSocketResponseType, send } from '../websocket-schema';

async function openaiCompletion(
  ws: ServerWebSocket<WebSocketData>,
  instanceId: string,
  functionName: string,
  functionDescription: string,
  functionParameters: any,
) {
  // Create initial message that will be updated with the response
  const message = await db.message.create({
    data: {
      instance: {
        connect: {
          id: instanceId,
        },
      },
      content: '',
      role: MessageRole.assistant,
    },
  });

  // Get messages & initialize 11 labs
  const [messages, elevenLabsWs] = await Promise.all([
    getMessages(instanceId),
    initElevenLabsWs(ws),
  ]);

  const response = await openai.chat.completions.create(
    {
      messages: messages,
      model: 'gpt-4',
      stream: true,
      functions: [
        {
          name: functionName,
          description: functionDescription,
          parameters: functionParameters,
        },
      ],
      function_call: {
        name: functionName,
      },
    },
    {
      headers: {
        'X-Starlight-Message-Id': message.id,
        'X-Starlight-Function-Name': functionName,
      },
    },
  );

  send(ws, {
    type: WebSocketResponseType.message,
    payload: {
      id: message.id,
      content: '',
    },
  });

  let buffer = '';
  let firstParamKey = Object.keys(functionParameters.properties)[0];

  for await (const chunk of response) {
    let args = chunk.choices[0].delta.function_call?.arguments;

    try {
      if (args) {
        buffer += args;
        buffer = buffer.replace(/\\n/g, '\n');

        // Remove the param key from the stream
        if (
          `{\n"${firstParamKey}":"`.includes(buffer) ||
          `{\n"${firstParamKey}": "`.includes(buffer) ||
          `{\n "${firstParamKey}": "`.includes(buffer) ||
          `{\n  "${firstParamKey}": "`.includes(buffer) ||
          `{"${firstParamKey}": "`.includes(buffer) ||
          `{"${firstParamKey}":"`.includes(buffer) ||
          `{ "${firstParamKey}": "`.includes(buffer) ||
          `{ "${firstParamKey}":"`.includes(buffer)
        ) {
          console.log('skipping beginning');
          continue;
        }

        if (args.includes('}')) {
          console.log('skipping end');
          continue;
        }

        send(ws, {
          type: WebSocketResponseType['message-append'],
          payload: {
            id: message.id,
            content: args,
          },
        });

        console.log('[Story] Sending to 11 labs:', args);

        elevenLabsWs.send(JSON.stringify({ text: args }));
      }
    } catch (err) {
      console.error(err);
    }
  }

  elevenLabsWs.send(JSON.stringify({ text: '' }));

  // Clean up and send final - removing the stray ending " in the process
  buffer = buffer.replace(/\\n/g, '');
  buffer = buffer.replace(
    new RegExp(`{\\s*"${firstParamKey}"\\s*:\\s*"`, 'g'),
    '',
  );
  buffer = buffer.replace(/"\s*\}\s*$/, '');

  send(ws, {
    type: WebSocketResponseType['message'],
    payload: {
      id: message.id,
      content: buffer,
    },
  });

  await db.message.update({
    where: {
      id: message.id,
    },
    data: {
      content: buffer,
    },
  });
}

async function progressStory(
  ws: ServerWebSocket<WebSocketData>,
  instanceId: string,
) {
  const instance = await db.instance.findUnique({
    where: {
      id: instanceId,
    },
  });

  if (!instance) {
    console.error('Instance not found');
    return;
  }

  const messages = await getMessages(instanceId);

  if (messages.length === 0) {
    // No messages, so we need to initialize the story
    await initStory(instance.id);
    await planStory(instance.id);

    send(ws, {
      type: WebSocketResponseType.instance,
      payload: {
        id: instance.id,
        content: '',
      },
    });

    await openaiCompletion(
      ws,
      instanceId,
      'introduce_story_and_characters',
      'Given the pre-created plan, create a irrestiable and vibrant introduction to the beginning of story, settings, and characters ending with a clear decision point where the story begins for the players. Keep it short and punchy. No newlines.',
      {
        type: 'object',
        properties: {
          introduction: {
            type: 'string',
          },
        },
      },
    );
  } else {
    // We have messages, so we need to continue the story
    await openaiCompletion(
      ws,
      instanceId,
      'continue_story',
      'Continue the story based on the previous messages, integrating what the players said, but also not letting them take over the story. Keep it grounded in the world you created, and make sure to keep the story moving forward, but with correct pacing. Stories should be interesting, but not too fast paced, and not too slow. Expand upon the plan made previously.',
      {
        type: 'object',
        properties: {
          story: {
            type: 'string',
            description:
              'The new story to add to the existing story. Keep it short and punchy. No newlines.',
          },
        },
      },
    );
  }

  // Generate placeholder so it'll always be infront of the suggestions in the history
  // also prevents images from coming out of order
  const message = await generateImagePlaceholder(ws, instanceId);

  generateSuggestions(ws, instanceId);
  generateImageFromStory(ws, message.id);
}

export { progressStory as step };
