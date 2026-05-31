// @ts-nocheck
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import ragData from '@/rag-data.json';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key is required' }), { status: 401 });
    }

    const openai = createOpenAI({ apiKey });
    
    const { messages } = await req.json();
    const lastMessage = messages[messages.length - 1].content.toLowerCase();
    const queryWords = lastMessage.match(/\w+/g) || [];

    // Local Keyword Search (BM25-lite) for RAG Context
    const scoredChunks = ragData.map((chunk: any) => {
      let score = 0;
      if (chunk.words) {
        for (const word of queryWords) {
          if (chunk.words.includes(word)) score++;
        }
      }
      return { ...chunk, score };
    }).sort((a: any, b: any) => b.score - a.score).slice(0, 5); // top 5 chunks

    const contextText = scoredChunks
      .filter((c: any) => c.score > 0)
      .map((c: any) => `Source: ${c.url}\n${c.text}`)
      .join('\n\n');

    const systemPrompt = `You are a helpful AI assistant. Use the following context from IMDB to answer the user's question accurately. If the context doesn't contain the answer, say so clearly.\n\nContext:\n${contextText}`;

    const result = streamText({
      model: openai('gpt-4o-mini'),
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    });

    return result.toTextStreamResponse();
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
