import OpenAI from 'openai';

// Documentation: https://platform.openai.com/docs/introduction

const openai = new OpenAI();

export type Message = {
  role: 'system' | 'assistant' | 'user' | 'function';
  content: string;
};

export { openai };
