import { ServerWebSocket } from 'bun';
import db from '../lib/db';
import { openai } from '../services/openai';
import { getMessages } from './utils';
import { WebSocketData } from '..';
import { WebSocketResponseType, send } from '../websocket-schema';
import { Message as OpenAIMessage } from '../services/openai';

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

async function generateAdventureSuggestions(
  ws: ServerWebSocket<WebSocketData>,
  userId: string,
) {
  console.log('Generating adventure suggestions for user', userId);

  const instances = await db.instance.findMany({
    where: {
      userId: userId,
    },
  });

  let messages = [
    {
      role: 'system',
      content:
        'You are an experienced storyteller, with a sharp wit, a heart of gold and a love for stories. Your goal is to bring people on new experiences.' +
        (instances.length > 0
          ? `In the past the player has requested these adventures: ${instances
              .map((instance) => instance.description)
              .join(
                ', ',
              )}.\n\n Come up with 3 new, entirely new, short & vibrant titles for adventures the this player may enjoy. Each title should be completely unrelated to the previous adventures, in different genres too!`
          : '') +
        '\n\n',
    },
  ] as OpenAIMessage[];

  const response = await openai.chat.completions.create(
    {
      messages: messages,
      model: 'gpt-4',
      temperature: 1.0,
      functions: [
        {
          name: 'generate_new_adventure_suggestions',
          description:
            'Suggestions should be entirely unique (max 20 characters). Each title should be completely unrelated to each other. Think of them as blockbuster movie or book titles! Be vibrant, and creative! Use verbs! Unrelated! No colons or semicolons.',
          parameters: {
            type: 'object',
            properties: {
              new_adventure_suggestions: {
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
        name: 'generate_new_adventure_suggestions',
      },
    },
    {
      headers: {
        'X-Starlight-Message-Id': '',
        'X-Starlight-Function-Name': 'generate_adventure_suggestions',
      },
    },
  );

  if (!response.choices[0].message.function_call) {
    console.error('No suggestions found');
    return;
  }

  console.log(messages);
  console.log(response.choices[0].message.function_call);

  const args = response.choices[0].message.function_call.arguments;
  const argsJSON = JSON.parse(args);

  const content = JSON.stringify({
    type: 'generate_adventure_suggestions',
    payload: argsJSON.new_adventure_suggestions,
  });

  send(ws, {
    type: WebSocketResponseType['adventure-suggestions'],
    payload: {
      id: '',
      content,
    },
  });
}

export { generateSuggestions, generateAdventureSuggestions };
