import { ServerWebSocket } from 'bun';
import db from '../lib/db';
import { openai } from '../services/openai';
import { getMessages } from './utils';
import { WebSocketData } from '..';
import { WebSocketResponseType, send } from '../websocket-schema';

async function generateSuggestions(
  ws: ServerWebSocket<WebSocketData>,
  instanceId: string,
) {
  const instance = await db.instance.findUnique({
    where: {
      id: instanceId,
    },
  });

  if (!instance) {
    throw new Error('[planStory] Instance not found');
  }

  const messages = await getMessages(instanceId);

  let suggestions = await db.message.create({
    data: {
      instance: {
        connect: {
          id: instanceId,
        },
      },
      content: '',
      role: 'function',
    },
  });

  const response = await openai.chat.completions.create(
    {
      messages: messages,
      model: 'gpt-4',
      functions: [
        {
          name: 'generate_suggestions',
          description:
            'Given the the current story, generate a list of short (~2-5 words) for the players to choose from. This should be a list of 2-3 options, each with a short description of what the option is. The players will choose one of these options, and the story will continue from there.',
          parameters: {
            type: 'object',
            properties: {
              suggestions: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
            },
          },
        },
      ],
      function_call: {
        name: 'generate_suggestions',
      },
    },
    {
      headers: {
        'X-Starlight-Message-Id': suggestions.id,
        'X-Starlight-Function-Name': 'generate_suggestions',
      },
    },
  );

  const args = response.choices[0].message.function_call?.arguments;

  if (!args) {
    console.error('No suggestions found');
    return;
  }

  const argsJSON = JSON.parse(args);

  let content = JSON.stringify({
    type: 'generate_suggestions',
    payload: argsJSON.suggestions,
  });

  suggestions = await db.message.update({
    where: {
      id: suggestions.id,
    },
    data: {
      content,
    },
  });

  send(ws, {
    type: WebSocketResponseType.suggestions,
    payload: {
      id: suggestions.id,
      content,
    },
  });
}

export { generateSuggestions };
