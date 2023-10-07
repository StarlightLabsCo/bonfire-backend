import { MessageRole } from '@prisma/client';
import db from '../lib/db';
import { openai } from '../services/openai';
import { getMessages } from './utils';

async function planStory(instanceId: string) {
  const instance = await db.instance.findUnique({
    where: {
      id: instanceId,
    },
  });

  if (!instance) {
    throw new Error('[planStory] Instance not found');
  }

  const messages = await getMessages(instanceId);

  const response = await openai.chat.completions.create({
    messages: messages,
    model: 'gpt-4',
    functions: [
      {
        name: 'plan_story',
        description:
          'Image a detailed plan for the story. This should describes the overarching story, the main characters, twists, and the main goal. This will only be reference to yourself, the storyteller, and not to be shared with the players. Be specific in your plan, naming characters, locations, events and make sure to include the players in the story. No newlines.',
        parameters: {
          type: 'object',
          properties: {
            plan: {
              type: 'string',
            },
          },
        },
      },
    ],
    function_call: {
      name: 'plan_story',
    },
  });

  if (!response.choices[0].message.function_call) {
    console.error('[plan] No function call found');
    return messages;
  }

  const args = JSON.parse(response.choices[0].message.function_call.arguments);

  const plan = 'Plan: ' + args.plan.replace('\\n', '').replace('\\"', '"');

  await db.message.create({
    data: {
      instance: {
        connect: {
          id: instanceId,
        },
      },
      content: plan,
      role: MessageRole.system,
    },
  });
}

export { planStory };
