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

const messagesToString = (messages: OpenAIMessage[]) => {
  const string = messages.reduce((acc, message) => {
    if (message.role === 'user') {
      return acc + 'Player: ' + message.content + '\n';
    }
    if (message.role === 'assistant') {
      return acc + 'Narrator: ' + message.content + '\n';
    } else {
      return acc;
    }
  }, '');

  return string;
};

export { getMessages, messagesToString };
