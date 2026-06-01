interface ChatRequestBody {
  messages: any[];
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const maxDuration = 30;

const openRouterApiUrl = 'https://openrouter.ai/api/v1/chat/completions';
const defaultModel = 'openai/gpt-4o-mini';

function extractMessageText(message: any): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter((part: any) => part?.type === 'text')
      .map((part: any) => part.text || '')
      .join('\n');
  }

  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((part: any) => part?.type === 'text')
      .map((part: any) => part.text || '')
      .join('\n');
  }

  return '';
}

function toOpenRouterMessages(messages: any[]): OpenRouterMessage[] {
  return messages
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: extractMessageText(message),
    }))
    .filter((message) => (
      (message.role === 'user' || message.role === 'assistant') &&
      message.content.trim().length > 0
    ));
}

function createUIMessageStreamResponse(answer: string): Response {
  const responseBody = [
    'data: {"type":"start"}',
    '',
    'data: {"type":"start-step"}',
    '',
    'data: {"type":"text-start","id":"0"}',
    '',
    `data: {"type":"text-delta","id":"0","delta":${JSON.stringify(answer)}}`,
    '',
    'data: {"type":"text-end","id":"0"}',
    '',
    'data: {"type":"finish-step"}',
    '',
    'data: {"type":"finish","finishReason":"stop"}',
    '',
    'data: [DONE]',
    '',
  ].join('\n');

  return new Response(responseBody, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

async function askOpenRouter(messages: OpenRouterMessage[]): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is missing in .env.local');
  }

  const response = await fetch(openRouterApiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'RAG Scrap Chat',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || defaultModel,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant. Answer directly in plain text. Do not use Markdown bold.',
        },
        ...messages,
      ],
      temperature: 0.4,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || data?.message || response.statusText;
    throw new Error(`OpenRouter error ${response.status}: ${message}`);
  }

  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || answer.trim().length === 0) {
    throw new Error('OpenRouter returned an empty answer');
  }

  return answer.trim();
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body: ChatRequestBody = await req.json();
    const { messages } = body;

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages payload is missing or empty' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const openRouterMessages = toOpenRouterMessages(messages);
    const answer = await askOpenRouter(openRouterMessages);

    console.info('[Chat Generation] Request routed to OpenRouter.');
    return createUIMessageStreamResponse(answer);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[OpenRouter Chat] API Error:', errorMsg);
    return createUIMessageStreamResponse(`OpenRouter setup issue: ${errorMsg}`);
  }
}
