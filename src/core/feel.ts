import { MessageRole } from '@prisma/client';
import db from '../lib/db';
import { getMessages } from './utils';
import { openai } from '../services/openai';

export async function react(instanceId: string) {
  const instance = await db.instance.findUnique({
    where: {
      id: instanceId,
    },
  });

  if (!instance) {
    throw new Error('[reaction] Instance not found');
  }

  let messages = await getMessages(instanceId);

  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === MessageRole.assistant) {
      messages[i].content = '[Narration]: ' + messages[i].content;
    }
  }

  messages.push({
    content: '[Narrator Inner Monologue] As the narrator, I feel ',
    role: MessageRole.assistant,
  });

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

  console.log(
    '[generate_narrator_internal_monologue_reaction] messages',
    messages,
  );
  const response = await openai.chat.completions.create(
    {
      messages: messages,
      model: 'gpt-3.5-turbo',
      functions: [
        {
          name: 'generate_narrator_internal_monologue_reaction',
          description:
            'From the perspective of the narrator, create a one sentence reaction based on the last player action (and the correspodning dice roll) and its impact on the story beginning with the words "I feel" with a reasoning as well. Include the full sentence. Do not exactly copy prior information. Stick to new info. No newlines.',
          parameters: {
            type: 'object',
            properties: {
              reaction: {
                type: 'string',
              },
            },
          },
        },
      ],
      function_call: {
        name: 'generate_narrator_internal_monologue_reaction',
      },
    },
    {
      headers: {
        'X-Starlight-Message-Id': message.id,
        'X-Starlight-Function-Name':
          'generate_narrator_internal_monologue_reaction',
      },
    },
  );

  if (!response.choices[0].message.function_call) {
    console.error(
      '[generate_narrator_internal_monologue_reaction] No function call found',
    );
    return messages;
  }

  const args = JSON.parse(response.choices[0].message.function_call.arguments);

  const reaction =
    'Reaction: As the narrator, I feel ' +
    args.reaction.replace('\\n', '').replace('\\"', '"');

  console.log(`[generate_narrator_internal_monologue_reaction] ${reaction}`);

  await db.message.update({
    where: {
      id: message.id,
    },
    data: {
      content: '[Narrator Inner Monologue] ' + reaction,
    },
  });
}
