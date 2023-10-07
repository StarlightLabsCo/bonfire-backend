import Replicate from 'replicate';

// Documentation: https://replicate.com/stability-ai/sdxl/api

if (!process.env.REPLICATE_API_TOKEN) {
  throw new Error('REPLICATE_API_TOKEN is not defined');
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

async function generateImage(prompt: string, negative_prompt: string) {
  const output = await replicate.run(
    'stability-ai/sdxl:af1a68a271597604546c09c64aabcd7782c114a63539a4a8d14d1eeda5630c33',
    {
      input: {
        prompt,
        negative_prompt,
        width: 1344,
        height: 768,
        scheduler: 'KarrasDPM',
        refine: 'expert_ensemble_refiner',
        apply_watermark: false,
      },
    },
  );

  return output as string[];
}

export { generateImage };
