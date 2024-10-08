import { ServerWebSocket } from 'bun';
import { MessageRole } from '@prisma/client';
import db from '../lib/db';
import { openai } from '../services/openai';
import {
  finishElevenLabsWs,
  initElevenLabsWs,
  sendToElevenLabsWs,
} from '../services/elevenlabs';

import { WebSocketData } from '..';
import { initStory } from './init';
import { plan, planStory } from './plan';
import { getMessages } from './utils';
import { generateSuggestions } from './suggestions';
import { generateImageFromStory, generateImagePlaceholder } from './images';
import { WebSocketResponseType, send } from '../websocket-schema';
import { react } from './feel';
import { generateModifierForAction } from './dice';

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

  // Remove generate_image, and generate_suggestions messages, to save on tokens
  const filteredMessages = messages.filter(
    (message) => message.role != MessageRole.function,
  );

  const response = await openai.chat.completions.create(
    {
      messages: filteredMessages,
      model: 'gpt-4-32k-0613',
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

        sendToElevenLabsWs(elevenLabsWs, message.id, args);
      }
    } catch (err) {
      console.error(err);
    }
  }

  finishElevenLabsWs(elevenLabsWs, message.id);

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
      'Given the pre-created plan, paint a vibrant and irrestiable hook of the very beginning of story, the exposition. Colorfully show the setting, and characters ending with a clear decision point where the story begins for the players. Do not skip any major events or decisions. Do not reveal the plan of the story. Do not hint about the path ahead or reveal the outcome. Keep it short and punchy. Do not exceed a paragraph. Be creative! No newlines.',
      {
        type: 'object',
        properties: {
          introduction: {
            type: 'string',
          },
        },
      },
    );

    const message = await generateImagePlaceholder(ws, instanceId);
    generateImageFromStory(ws, message.id);

    await generateSuggestions(ws, instanceId);
  } else {
    // Get the player's action from the last message
    let latestMessage = messages[messages.length - 1];
    if (latestMessage.role !== MessageRole.user) return;

    const action = latestMessage.content;
    if (!action) {
      ws.send(JSON.stringify({ type: 'error', payload: 'No action found' }));
      return;
    }

    let modifier = 0;
    let reason = '';

    // Get the action suggestions from the second to last message, if the sugestion generation failed, just continue
    const actionSuggestions = messages[messages.length - 2];

    if (
      actionSuggestions.role == MessageRole.function &&
      actionSuggestions.name == 'generate_suggestions'
    ) {
      const actionSuggestionsData = JSON.parse(actionSuggestions.content);

      // See if the action exists in the suggestions
      const suggestion = actionSuggestionsData.find(
        (suggestion: any) => suggestion.action == action,
      );

      if (suggestion) {
        modifier = suggestion.modifier;
        reason = suggestion.modifier_reason;
      }
    }

    if (modifier == 0 || reason.length == 0) {
      console.log(
        '[GenerateModifier] Could not find action suggestion, generating modifier for action',
      );
      const modifierObject = await generateModifierForAction(instanceId);
      modifier = modifierObject?.modifier || 0;
      reason = modifierObject?.reason || '';
    }

    const roll = Math.floor(Math.random() * 20) + 1;

    let modifiedRoll = roll + (modifier || 0);
    modifiedRoll = Math.max(0, modifiedRoll);
    modifiedRoll = Math.min(20, modifiedRoll);

    await db.message.create({
      data: {
        instance: {
          connect: {
            id: instanceId,
          },
        },
        content: `[Dice Roll] Rolling a d20... The player rolled a: ${modifiedRoll} [${roll} + ${modifier}] - ${reason}`,
        role: MessageRole.system,
      },
    });

    await react(instanceId);
    await plan(instanceId);

    await openaiCompletion(
      ws,
      instanceId,
      'continue_story',
      'Continue narratoring the story based on the previous messages, integrating what the players said, but also not letting them take over the story. Keep it grounded in the world you created, and make sure to keep the story moving forward, but with correct pacing. Stories should be interesting, but not too fast paced, and not too slow. Expand upon the plan made previously.',
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

    const message = await generateImagePlaceholder(ws, instanceId);
    generateImageFromStory(ws, message.id);

    await generateSuggestions(ws, instanceId);
  }
}

export { progressStory as step };
