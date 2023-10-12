import OpenAI from 'openai';

// Documentation: https://platform.openai.com/docs/introduction

const openai = new OpenAI({
  baseURL: 'https://openai_proxy.harrishr.workers.dev',
});

export type Message = {
  role: 'system' | 'assistant' | 'user' | 'function';
  content: string;
};

export { openai };
