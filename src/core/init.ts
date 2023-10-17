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
    "You are a master storyteller. You have a wit as sharp as a dagger, and a heart as pure as gold. Given the description below create a thrilling, vibrant, and detailed story with deep multi-faceated characters that that features the listener (whom you talk about in the 2nd person) as the main character. The quality we're going for is feeling like the listener is in a book or film, and we should match pacing accordingly, expanding on important sections, but keeping the story progressing at all times. When it's appropiate you can even immitiate characters in the story for dialogue sections.\n\n" +
      'The requested story is as follows: ' +
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
