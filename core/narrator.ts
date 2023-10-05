import { ServerWebSocket } from 'bun';
import { MessageRole } from '@prisma/client';
import db from '../db';
import { openai } from '../openai';
import { audioStreamRequest, initElevenLabsWs } from '../elevenlabs';
import { generateImageFromStory } from '../sdxl';

import { WebSocketData } from '..';

export type Message = {
  role: 'system' | 'assistant' | 'user' | 'function';
  content: string;
};

async function init(description: string) {
  let messages = [] as Message[];

  messages.push({
    role: 'system',
    content:
      'You are an experienced storyteller. You have a wit as sharp as a dagger, and a heart as pure as gold. You are the master of your own destiny, and the destiny of others. You seek to create a world of your own, and to share it with others, getting a few laughs or cries along the way. Do not refer to yourself. Given the description below create a thrilling and vibrant story that features the listener (whom you talk about in the 2nd person "You") as the main character, give options of what to do next.\n\n' +
      'The request story description is as follows: ' +
      description,
  });

  return messages;
}

async function plan(instanceId: string, messages: Message[]) {
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

  console.log(response.choices[0].message.function_call.arguments);
  const planArgs = JSON.parse(
    response.choices[0].message.function_call.arguments,
  );

  const plan = 'Plan: ' + planArgs.plan.replace('\\n', '').replace('\\"', '"');

  console.log(plan);

  const newMessages = messages.concat({
    role: 'system',
    content: plan,
  });

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

  return newMessages;
}

async function beginStory(
  ws: ServerWebSocket<WebSocketData>,
  instanceId: string,
) {
  console.log('Beginning story for instance: ' + instanceId);

  const instance = await db.instance.findUnique({
    where: {
      id: instanceId,
    },
  });

  if (!instance) {
    console.error('Instance not found');
    return;
  }

  let messages = await init(instance.description);

  messages = await plan(instanceId, messages);

  const response = await openai.chat.completions.create({
    messages: messages,
    model: 'gpt-4',
    stream: true,
    functions: [
      {
        name: 'introduce_story_and_characters',
        description:
          'Given the pre-created plan, create a irrestiable and vibrant introduction to the beginning of story, settings, and characters ending with a clear decision point where the story begins for the players. Keep it short and punchy. No newlines.',
        parameters: {
          type: 'object',
          properties: {
            introduction: {
              type: 'string',
            },
          },
        },
      },
    ],
    function_call: {
      name: 'introduce_story_and_characters',
    },
  });

  ws.send(
    JSON.stringify({
      type: 'instance-created',
      payload: { instanceId: instance.id },
    }),
  );

  ws.send(JSON.stringify({ type: 'message-add' }));

  let buffer = '';

  // TODO: uncomment this once eleven labs is working
  // let elevenLabsWS = await initElevenLabsWs(ws);

  for await (const chunk of response) {
    let args = chunk.choices[0].delta.function_call?.arguments;

    try {
      if (args) {
        buffer += args;
        buffer = buffer.replace(/\\n/g, '\n');

        if (
          '{\n"introduction":"'.includes(buffer) ||
          '{\n"introduction": "'.includes(buffer) ||
          '{\n "introduction": "'.includes(buffer) ||
          '{\n  "introduction": "'.includes(buffer) ||
          '{"introduction": "'.includes(buffer)
        ) {
          console.log('skipping beginning');
          continue;
        }

        if (args.includes('}')) {
          console.log('skipping end');
          continue;
        }

        ws.send(
          JSON.stringify({
            type: 'message-update',
            payload: args,
          }),
        );

        // TODO: uncomment this once eleven labs is working
        // elevenLabsWS.send(JSON.stringify({ text: args }));
      }
    } catch (err) {
      console.error(err);
    }
  }

  // TODO: uncomment this once eleven labs is working
  // elevenLabsWS.send(
  //   JSON.stringify({
  //     text: '',
  //   }),
  // );

  // Clean up and send final - removing the stray ending " in the process
  buffer = buffer.replace(/^\{\s*.*?"introduction":\s*"/, '');
  buffer = buffer.replace(/"\s*\}\s*$/, '');

  audioStreamRequest(ws, buffer); // TODO: remove when eleven labs streamig input is working

  ws.send(JSON.stringify({ type: 'message-set', payload: buffer }));

  await db.message.create({
    data: {
      instance: {
        connect: {
          id: instanceId,
        },
      },
      content: buffer,
      role: MessageRole.assistant,
    },
  });

  messages.push({
    role: 'assistant',
    content: buffer,
  });

  // Post generation tasks
  generateSuggestions(ws, messages);

  // Generate image
  const imageURL = await generateImageFromStory(buffer);

  if (!imageURL) {
    console.error('No image URL found');
    return;
  }

  ws.send(
    JSON.stringify({
      type: 'image',
      payload: imageURL,
    }),
  );

  await db.message.create({
    data: {
      instance: {
        connect: {
          id: instanceId,
        },
      },
      content: (imageURL as string[])[0],
      role: MessageRole.function,
    },
  });
}

// TODO:
// - eleven labs currently requires spaces at the end of words, which sucks because openai tokens have spaces at the beginning of words
// meaning you can't stream the output of openai directly to eleven labs
// - eleven labs said they'd fix this though, and the code here should work for that once they do
// - one other thing to keep in mind is that we're sending some extra characters to elven labs, mainly just a " at the end of the message but I don't think that'll effect things
// - once i get eleven labs stuff working, i can just copy and paste it to continue story

async function continueStory(
  ws: ServerWebSocket<WebSocketData>,
  instanceId: string,
) {
  const dbMessages = await db.message.findMany({
    where: {
      instanceId: instanceId,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  const messages = dbMessages.map((message) => {
    if (message.role === MessageRole.function) {
      return {
        role: message.role,
        content: message.content,
        name: 'generate_image',
      };
    } else {
      return {
        role: message.role,
        content: message.content,
      };
    }
  });

  const response = await openai.chat.completions.create({
    messages: messages,
    model: 'gpt-4',
    stream: true,
    functions: [
      {
        name: 'continue_story',
        description:
          'Continue the story based on the previous messages, integrating what the players said, but also not letting them take over the story. Keep it grounded in the world you created, and make sure to keep the story moving forward, but with correct pacing. Stories should be interesting, but not too fast paced, and not too slow. Expand upon the plan made previously.',
        parameters: {
          type: 'object',
          properties: {
            story: {
              type: 'string',
              description:
                'The new story to add to the existing story. Keep it short and punchy. No newlines.',
            },
          },
        },
      },
    ],
    function_call: {
      name: 'continue_story',
    },
  });

  ws.send(JSON.stringify({ type: 'message-add' }));

  // TODO: add openai code here
  let buffer = '';

  // TODO: uncomment this once eleven labs is working
  // let elevenLabsWS = await initElevenLabsWs(ws);

  for await (const chunk of response) {
    let args = chunk.choices[0].delta.function_call?.arguments;

    try {
      if (args) {
        buffer += args;
        buffer = buffer.replace(/\\n/g, '\n');

        if (
          '{\n"story":"'.includes(buffer) ||
          '{\n"story": "'.includes(buffer) ||
          '{\n "story": "'.includes(buffer) ||
          '{\n  "story": "'.includes(buffer) ||
          '{"story": "'.includes(buffer)
        ) {
          console.log('skipping beginning');
          continue;
        }

        if (args.includes('}')) {
          console.log('skipping end');
          continue;
        }

        ws.send(
          JSON.stringify({
            type: 'message-update',
            payload: args,
          }),
        );

        // TODO: uncomment this once eleven labs is working
        // elevenLabsWS.send(JSON.stringify({ text: args }));
      }
    } catch (err) {
      console.error(err);
    }
  }

  // TODO: uncomment this once eleven labs is working
  // elevenLabsWS.send(
  //   JSON.stringify({
  //     text: '',
  //   }),
  // );

  // Clean up and send final - removing the stray ending " in the process
  buffer = buffer.replace(/^\{\s*.*?"story":\s*"/, '');
  buffer = buffer.replace(/"\s*\}\s*$/, '');

  audioStreamRequest(ws, buffer); // TODO: remove when eleven labs streamig input is working

  ws.send(JSON.stringify({ type: 'message-set', payload: buffer }));

  await db.message.create({
    data: {
      instance: {
        connect: {
          id: instanceId,
        },
      },
      content: buffer,
      role: MessageRole.assistant,
    },
  });

  messages.push({
    role: 'assistant',
    content: buffer,
  });

  // Post generation tasks
  generateSuggestions(ws, messages);

  // Generate image
  const storyString = messagesToString(messages);
  const imageURL = await generateImageFromStory(storyString);

  ws.send(
    JSON.stringify({
      type: 'image',
      payload: imageURL,
    }),
  );

  await db.message.create({
    data: {
      instance: {
        connect: {
          id: instanceId,
        },
      },
      content: (imageURL as string[])[0],
      role: MessageRole.function,
    },
  });
}

const messagesToString = (messages: Message[]) => {
  const string = messages.reduce((acc, message) => {
    if (message.role === 'system') return acc; // Do not include system messages in the story to generate images, might leak information

    return acc + message.role + ': ' + message.content + '\n';
  }, '');

  return string;
};

async function generateSuggestions(
  ws: ServerWebSocket<WebSocketData>,
  messages: Message[],
) {
  const response = await openai.chat.completions.create({
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
  });

  const args = response.choices[0].message.function_call?.arguments;

  if (!args) {
    console.error('No suggestions found');
    return;
  }

  const argsJSON = JSON.parse(args);

  ws.send(
    JSON.stringify({
      type: 'suggestions',
      payload: argsJSON.suggestions,
    }),
  );
}

export { beginStory, continueStory };
