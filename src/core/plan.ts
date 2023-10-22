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

  const message = await db.message.create({
    data: {
      instance: {
        connect: {
          id: instanceId,
        },
      },
      content: '',
      role: MessageRole.system,
    },
  });

  const response = await openai.chat.completions.create(
    {
      messages: messages,
      model: 'gpt-4',
      functions: [
        {
          name: 'plan_story',
          description:
            'Imagine a detailed plan for the story. Describe, in detail, the overarching story, the main characters, twists, the main goal, as well as smaller scale beats and memorable moments. This will only be referenced by yourself, the storyteller, and should not be shared with the players. Be specific in your plan, naming characters, locations, events in depth while making sure to include the players in the story. Always think a few steps ahead to make the story feel alive. No newlines.',
          parameters: {
            type: 'object',
            properties: {
              plan: {
                type: 'string',
                description: 'No newlines.',
              },
            },
          },
        },
      ],
      function_call: {
        name: 'plan_story',
      },
    },
    {
      headers: {
        'X-Starlight-Message-Id': message.id,
        'X-Starlight-Function-Name': 'plan_story',
      },
    },
  );

  console.log('[plan] response', response);

  if (!response.choices[0].message.function_call) {
    console.error('[plan] No function call found');
    return messages;
  }

  const args = JSON.parse(
    response.choices[0].message.function_call.arguments.replace('\\n', ''),
  );

  const plan = 'Plan: ' + args.plan.replace('\\"', '"');

  await db.message.update({
    where: {
      id: message.id,
    },
    data: {
      content: plan,
    },
  });
}

async function plan(instanceId: string) {
  const instance = await db.instance.findUnique({
    where: {
      id: instanceId,
    },
  });

  if (!instance) {
    throw new Error('[plan] Instance not found');
  }

  let messages = await getMessages(instanceId);
  messages = messages.filter((message) => message.role != MessageRole.function);

  // Add narration prefix to assistant messages
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === MessageRole.assistant) {
      messages[i].content = '[Narration]: ' + messages[i].content;
    }
  }

  const message = await db.message.create({
    data: {
      instance: {
        connect: {
          id: instanceId,
        },
      },
      content: '',
      role: MessageRole.system,
    },
  });

  messages.push({
    content: '[Narrator Inner Monologue] I will ',
    role: MessageRole.assistant,
  });

  const response = await openai.chat.completions.create(
    {
      messages: messages,
      model: 'gpt-4',
      functions: [
        {
          name: 'generate_narrator_internal_monologue_plan',
          description:
            'One sentence describing how you, the narrator, will adjust the story based on the player\'s last action and its corresponding dice roll. (The impact of an action that recieves an average dice roll should still have a meaningful impact on the immediate events in the story.) Your plan should be a single sentence that begins with "I will". Provide an indepth thought process, and a full sentence. Include the full sentence including the initial "I will". Do not repeat prior information. No newlines.',
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
        name: 'generate_narrator_internal_monologue_plan',
      },
    },
    {
      headers: {
        'X-Starlight-Message-Id': message.id,
        'X-Starlight-Function-Name':
          'generate_narrator_internal_monologue_plan',
      },
    },
  );

  if (!response.choices[0].message.function_call) {
    console.error('[generate_narrator_plan] No function call found');
    return messages;
  }

  const args = JSON.parse(response.choices[0].message.function_call.arguments);

  const plan = 'Plan: ' + args.plan.replace('\\n', '').replace('\\"', '"');

  console.log(`[generate_narrator_internal_monologue_plan] ${plan}`);

  await db.message.update({
    where: {
      id: message.id,
    },
    data: {
      content: '[Narrator Inner Monologue] ' + plan,
    },
  });
}

export { planStory, plan };
