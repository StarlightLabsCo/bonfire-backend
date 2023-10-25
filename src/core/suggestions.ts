import { ServerWebSocket } from 'bun';
import db from '../lib/db';
import { openai } from '../services/openai';
import { getMessages } from './utils';
import { WebSocketData } from '..';
import { WebSocketResponseType, send } from '../websocket';
import { Message as OpenAIMessage } from '../services/openai';
import { MessageRole } from '@prisma/client';

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

  let messages = await getMessages(instanceId);
  messages = messages.filter((message) => message.role != MessageRole.function);
  messages = messages.slice(-5);

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

  let suggestionsArray: string[] = [];
  let retryCount = 0;
  let retryLimit = 3;

  while (suggestionsArray.length == 0 && retryCount < retryLimit) {
    retryCount++;

    const response = await openai.chat.completions.create(
      {
        messages: messages,
        model: 'gpt-4-32k',
        functions: [
          {
            name: 'generate_action_suggestions',
            description:
              "List 1-3 optimal actions for players, described in up to 3 words, based on the story. Analyze how past events affect each action's potential success, without predicting outcomes. Assign a unique modifier (-15 to 15) to each action for a d20 roll, reflecting pre-established conditions. Explain the reasoning for each modifier before stating its value.",
            parameters: {
              type: 'object',
              properties: {
                actions: {
                  type: 'array',
                  description:
                    'Suggested actions, no duplicates. [Min: 1, Max: 3]',
                  items: {
                    type: 'object',
                    properties: {
                      action: {
                        type: 'string',
                        description:
                          'A suggested action for the player to take. [Min: 1 word, Max: 3 words]',
                      },
                      modifier_reason: {
                        type: 'string',
                        description:
                          'The reasoning to determine the modifier for the action. Must not be based on the outcome. Should only be based on prior information. [Min: 1 word, Max: 20 words]',
                      },
                      modifier: {
                        type: 'number',
                        description:
                          'Modifier for the action. Must not be based on the outcome of the action. [Min: -15, Max: 15, 0 is neutral and most common]',
                      },
                    },
                  },
                },
              },
            },
          },
        ],
        function_call: {
          name: 'generate_action_suggestions',
        },
      },
      {
        headers: {
          'X-Starlight-Message-Id': suggestions.id,
          'X-Starlight-Function-Name': 'generate_action_suggestions',
        },
      },
    );

    const args = response.choices[0].message.function_call?.arguments;
    if (!args) {
      continue;
    }

    const argsJSON = JSON.parse(args);

    if (Array.isArray(argsJSON.actions) && argsJSON.actions.length > 0) {
      suggestionsArray = argsJSON.actions;
    } else if (Array.isArray(argsJSON.payload) && argsJSON.payload.length > 0) {
      suggestionsArray = argsJSON.payload;
    }

    messages.push({
      role: MessageRole.function,
      name: 'generate_action_suggestions',
      content: args,
    });

    // Validation
    const validationResponse = await openai.chat.completions.create(
      {
        messages: messages,
        model: 'gpt-4',
        functions: [
          {
            name: 'validate_suggestions',
            description: `As the narrator, you generated the most recent actions. Based on the story, are these the most relevant and entertaining possible actions in the current context? Are all the actions unique? Are there 1-3 actions? Have all characters / objects been introduced in the story? Can the player do all of these actions in the current situation? If the actions are not valid, provide a reason. If they are valid, leave the reason blank.`,
            parameters: {
              type: 'object',
              properties: {
                answer: {
                  type: 'string',
                  description: '[YES / NO]',
                },
                reason: {
                  type: 'string',
                  description: 'Reason for answer.',
                },
              },
            },
          },
        ],
        function_call: {
          name: 'validate_suggestions',
        },
      },
      {
        headers: {
          'X-Starlight-Message-Id': '',
          'X-Starlight-Function-Name': 'validate_suggestions',
        },
      },
    );

    if (!validationResponse.choices[0].message.function_call) {
      console.error('No validation response found');
      return;
    }

    const data = JSON.parse(
      validationResponse.choices[0].message.function_call.arguments,
    );

    console.log('validation data', data);

    if (!data.answer) {
      console.error('Failed to validate suggestions');
      continue;
    }

    if (
      data.answer &&
      typeof data.answer === 'string' &&
      data.answer.toLowerCase().includes('no')
    ) {
      messages.push({
        role: 'system',
        content:
          'Previously you generated these suggestions: [' +
          suggestionsArray +
          '] but they were not the best possible actions in the current context because [' +
          data.reason +
          ']. Please try again.',
      });

      suggestionsArray = [];
      continue;
    }
  }

  // After validation loop
  if (suggestionsArray.length == 0) {
    console.error('Failed to generate suggestions.');
    return;
  }

  let content = JSON.stringify({
    type: 'generate_suggestions',
    payload: suggestionsArray,
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
  const instances = await db.instance.findMany({
    where: {
      userId: userId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 5,
  });

  let messages = [
    {
      role: 'system',
      content:
        'You are an experienced storyteller, with a sharp wit, a heart of gold and a love for stories. Your goal is to bring people on new experiences.' +
        (instances.length > 0
          ? `In the past the player has requested these adventures, but don't format the phraseology of the titles based on these: ${instances
              .map((instance) => '- ' + instance.description + '\n')
              .join('')}.\n`
          : '') +
        ' Come up with a single new, entirely new, short, curiosity-inspiring title, devoid of alliteration, for adventures this player may enjoy. The title should be completely unrelated to the previous adventures, in different genres too! I repeat, no alliteration!!! Priortize readable and story potential over literary flare. Use verbs for the story premise, and make sure the verbs are something that a person could do. Avoid abstract words & concepts. Adjectives should be meaningful to the nouns they modify. Verbs should be meaningful to their corespoding direct objects. Be creative! Be clear! Be memorable!',
    },
  ] as OpenAIMessage[];

  const response = await openai.chat.completions.create(
    {
      messages: messages,
      model: 'gpt-4',
      temperature: 0.95,
      functions: [
        {
          name: 'generate_new_adventure_suggestions',
          description:
            'Suggestions should be entirely unique (max 20 characters). Each title should be completely unrelated to each other. Be vibrant, and creative! Use verbs to describe actions! e.g. No colons or semicolons. [3 suggestions max]',
          parameters: {
            type: 'object',
            properties: {
              new_adventure_suggestions: {
                type: 'array',
                items: {
                  type: 'string',
                  description: 'A suggested title for an adventure.',
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
