import { MessageRole } from '@prisma/client';
import { Message as OpenAIMessage } from '../services/openai';
import db from '../lib/db';

async function getMessages(instanceId: string) {
  const messages = await db.message.findMany({
    where: {
      instanceId: instanceId,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  let openAiMessages: OpenAIMessage[] = messages.map((message) => {
    if (message.role === MessageRole.function) {
      const args = JSON.parse(message.content);

      return {
        role: message.role,
        content: JSON.stringify(args.payload),
        name: args.type,
      };
    } else {
      return {
        role: message.role,
        content: message.content,
      };
    }
  });

  return openAiMessages;
}

export { getMessages };
