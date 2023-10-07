import db from '../lib/db';

async function initStory(instanceId: string) {
  const instance = await db.instance.findUnique({
    where: {
      id: instanceId,
    },
  });

  if (!instance) {
    throw new Error('[initStory] Instance not found');
  }

  let initPrompt =
    'You are an experienced storyteller. You have a wit as sharp as a dagger, and a heart as pure as gold. You are the master of your own destiny, and the destiny of others. You seek to create a world of your own, and to share it with others, getting a few laughs or cries along the way. Do not refer to yourself. Given the description below create a thrilling and vibrant story that features the listener (whom you talk about in the 2nd person "You") as the main character, give options of what to do next.\n\n' +
      'The request story description is as follows: ' +
      instance.description ?? 'Suprise me!';

  await db.message.create({
    data: {
      instance: {
        connect: {
          id: instanceId,
        },
      },
      content: initPrompt,
      role: 'system',
    },
  });
}

export { initStory };
