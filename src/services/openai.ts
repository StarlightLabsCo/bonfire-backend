import OpenAI from 'openai';

// Documentation: https://platform.openai.com/docs/introduction

const openai = new OpenAI({
  baseURL:
    'https://gateway.ai.cloudflare.com/v1/c38bc3761ea690e1a45693a40ce4fb2f/bonfire/openai',
});

export type Message = {
  role: 'system' | 'assistant' | 'user' | 'function';
  content: string;
};

export { openai };
