import { MessageRole } from '@prisma/client';
import db from '../lib/db';
import { openai } from '../services/openai';
import { getMessages } from './utils';

export async function generateModifierForAction(instanceId: string) {
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

  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === MessageRole.assistant) {
      messages[i].content = '[Narration]: ' + messages[i].content;
    }
  }

  let message = await db.message.create({
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

  let modifier: number | null = null;
  let reason: string | null = null;
  let retryCount = 0;
  let retryLimit = 3;

  while (!modifier && retryCount < retryLimit) {
    retryCount++;

    const response = await openai.chat.completions.create(
      {
        messages: messages,
        model: 'gpt-4',
        functions: [
          {
            name: 'generate_action_dice_modifier',
            description:
              "Based on the story BEFORE THE MOST RECENT ACTION TOOK PLACE, generate a modifier for the narrator's dice roll for that specific action. This modifier should be representative of the confluence of all relevant factors within the story prior to the most recent action. This modifier should not be based on the outcome of said action or it's effects on the world. It must SOLELY be based on effects and actions before it took place. 0 is neutral, and should be the most common. Non-zero numbers are proportionately common to their proximity to zero. [Min: -15, Max: 15]",
            parameters: {
              type: 'object',
              properties: {
                action_modifier: {
                  type: 'number',
                  description:
                    'Modifier for the action. Must not be based on the outcome. Should only be based on prior information. [Min: -15, Max: 15]',
                },
                reason: {
                  type: 'string',
                  description: 'Reason for the modifier.',
                },
              },
            },
          },
        ],
        function_call: {
          name: 'generate_action_dice_modifier',
        },
      },
      {
        headers: {
          'X-Starlight-Message-Id': message.id,
          'X-Starlight-Function-Name': 'generate_action_dice_modifier',
        },
      },
    );

    const args = response.choices[0].message.function_call?.arguments;
    if (!args) {
      continue;
    }

    const argsJSON = JSON.parse(args);

    console.log(`[generate_action_dice_modifier] argsJSON`, argsJSON);

    if ((!argsJSON.action_modifier || !argsJSON.reason) && argsJSON.payload) {
      modifier = argsJSON.payload.action_modifier;
      reason = argsJSON.payload.reason;
    } else {
      modifier = argsJSON.action_modifier;
      reason = argsJSON.reason;
    }

    console.log(
      '[generate_action_dice_modifier] modifier, reason',
      modifier,
      reason,
    );
  }

  if (modifier === null || reason === null) {
    console.error('Failed to generate modifier.');
    return;
  }

  let content = JSON.stringify({
    type: 'generate_action_dice_modifier',
    payload: {
      action_modifier: modifier,
      reason: reason,
    },
  });

  message = await db.message.update({
    where: {
      id: message.id,
    },
    data: {
      content: content,
    },
  });

  return { modifier, reason };
}
