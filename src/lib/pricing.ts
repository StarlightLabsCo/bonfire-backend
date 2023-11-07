import {
  ElevenLabsRequestLog,
  OpenAIRequestLog,
  ReplicateRequestLog,
} from '@prisma/client';
import prisma from '../lib/db';
import { ServerWebSocket } from 'bun';
import { WebSocketData } from '..';
import { WebSocketResponseType, send } from '../websocket';

export type CompletionModelCost = {
  prompt: number;
  completion: number;
};

export const MODEL_COSTS = {
  'gpt-3.5-turbo': {
    prompt: 0.0015 / 1000,
    completion: 0.002 / 1000,
  },
  'gpt-3.5-turbo-0613': {
    prompt: 0.0015 / 1000,
    completion: 0.002 / 1000,
  },
  'gpt-3.5-turbo-16k': {
    prompt: 0.003 / 1000,
    completion: 0.004 / 1000,
  },
  'gpt-3.5-turbo-16k-0613': {
    prompt: 0.003 / 1000,
    completion: 0.004 / 1000,
  },
  'gpt-4': {
    prompt: 0.003 / 1000,
    completion: 0.006 / 1000,
  },
  'gpt-4-0613': {
    prompt: 0.03 / 1000,
    completion: 0.06 / 1000,
  },
  'gpt-4-32k': {
    prompt: 0.06 / 1000,
    completion: 0.12 / 1000,
  },
  'gpt-4-32k-0613': {
    prompt: 0.06 / 1000,
    completion: 0.12 / 1000,
  },
};

function openAICost(request: OpenAIRequestLog) {
  if (!request.model) {
    console.error('No model provided');
    return 0;
  }

  const promptCost =
    request.promptTokens *
    MODEL_COSTS[request.model as keyof typeof MODEL_COSTS].prompt;

  const completionCost =
    request.completionTokens *
    MODEL_COSTS[request.model as keyof typeof MODEL_COSTS].completion;

  return promptCost + completionCost;
}

function elevenLabsCost(request: ElevenLabsRequestLog) {
  if (!request.numCharacters) return 0;

  return request.numCharacters * (0.24 / 1000); // TODO: make this more accurate - https://elevenlabs.io/subscription
}

function replicateCost(request: ReplicateRequestLog) {
  if (!request.imageURL) return 0;

  return 0.012; // TODO: make this more accurate - https://replicate.com/pricing
}

async function hasTokensLeft(
  userId: string,
  ws: ServerWebSocket<WebSocketData>,
) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  // Testers get unlimited credits
  if (user?.isTester) return true;

  // Check to see how many credits they've used total
  const instances = await prisma.instance.findMany({
    where: {
      user: {
        id: userId,
      },
    },
    include: {
      messages: {
        include: {
          openAIRequestLog: true,
          elevenLabsRequestLog: true,
          replicateRequestLog: true,
        },
      },
    },
  });

  const totalCost = instances.reduce((acc, instance) => {
    return (
      acc +
      instance.messages.reduce((acc, message) => {
        if (message.role === 'user') return acc;

        const openai = message.openAIRequestLog
          ? openAICost(message.openAIRequestLog)
          : 0;
        const elevenlabs = message.elevenLabsRequestLog
          ? elevenLabsCost(message.elevenLabsRequestLog)
          : 0;
        const replicate = message.replicateRequestLog
          ? replicateCost(message.replicateRequestLog)
          : 0;

        return acc + openai + elevenlabs + replicate;
      }, 0)
    );
  }, 0);
  console.log(`{${userId}}'s total cost: $${totalCost}}`);

  if (totalCost >= 5.0) {
    send(ws, {
      type: WebSocketResponseType.outOfCredits,
      payload: {
        id: '',
        content: '',
      },
    });

    return false;
  }

  return true;
}

export { openAICost, elevenLabsCost, replicateCost, hasTokensLeft };
