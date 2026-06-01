import path from 'path';
import fs from 'fs';

interface ChatRequestBody {
  messages: any[];
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const maxDuration = 30;

// Load local RAG data for keyword search
let ragData: any[] = [];
try {
  const filePath = path.join(process.cwd(), 'src', 'rag-data.json');
  if (fs.existsSync(filePath)) {
    ragData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
} catch (err) {
  console.error('[Chat API] Failed to load rag-data.json:', err);
}

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

async function askLLM(messages: OpenRouterMessage[], systemPrompt: string): Promise<string> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;

  if (!openRouterKey && !openAIKey) {
    throw new Error('No API key found. Please define either OPENAI_API_KEY or OPENROUTER_API_KEY in your environment variables.');
  }

  const isOpenAI = !!openAIKey;
  const apiUrl = isOpenAI
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';

  const apiKey = isOpenAI ? openAIKey : openRouterKey;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  if (!isOpenAI) {
    headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL || 'http://localhost:3000';
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME || 'RAG Scrap Chat';
  }

  const model = isOpenAI
    ? (process.env.OPENAI_MODEL || 'gpt-4o-mini')
    : (process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini');

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...messages,
      ],
      temperature: 0.4,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const provider = isOpenAI ? 'OpenAI' : 'OpenRouter';
    const message = data?.error?.message || data?.message || response.statusText;
    throw new Error(`${provider} error ${response.status}: ${message}`);
  }

  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || answer.trim().length === 0) {
    const provider = isOpenAI ? 'OpenAI' : 'OpenRouter';
    throw new Error(`${provider} returned an empty answer`);
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
    const lastMessage = openRouterMessages[openRouterMessages.length - 1]?.content || '';

    // Search nearest keyword matches from rag-data.json
    let retrievedContext = '';
    if (lastMessage && ragData.length > 0) {
      const queryWords = lastMessage.toLowerCase().match(/\w+/g) || [];
      const scoredChunks = ragData.map((chunk: any) => {
        let score = 0;
        if (chunk.words && Array.isArray(chunk.words)) {
          for (const word of queryWords) {
            if (chunk.words.includes(word)) {
              score++;
            }
          }
        }
        return { ...chunk, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

      retrievedContext = scoredChunks
        .filter((c) => c.score > 0)
        .map((c) => `Source: ${c.url}\n${c.text}`)
        .join('\n\n');
    }

    const systemPrompt = `You are a helpful, friendly, and expert AI assistant. Use the following context from IMDb to answer the user's question accurately. 

If the context contains the answer, answer it clearly and mention the source links where appropriate.
If the context doesn't contain the answer, say "Based on the scraped IMDb data in my index, I couldn't find that specific information" and then provide your best helpful general response.

IMDb Context:
${retrievedContext || 'No IMDb list information available.'}`;

    const answer = await askLLM(openRouterMessages, systemPrompt);

    console.info(`[Chat Generation] Request successfully routed to ${process.env.OPENAI_API_KEY ? 'OpenAI' : 'OpenRouter'}.`);
    return createUIMessageStreamResponse(answer);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Chat Engine Panic] API Error:', errorMsg);
    return createUIMessageStreamResponse(`RAG Chat API issue: ${errorMsg}`);
  }
}
