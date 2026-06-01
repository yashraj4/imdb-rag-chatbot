import { streamText, embed, ModelMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import { Pinecone } from '@pinecone-database/pinecone';
import { config, validateEnvironment } from '@/lib/config';
import ragDataFallback from '@/rag-data.json';

interface ChatRequestBody {
  messages: ModelMessage[];
}

interface FallbackChunk {
  url: string;
  text: string;
  words?: string[];
}

export const maxDuration = 30;

// Setup local Ollama fallback for local offline developer support
const ollama = createOllama({
  baseURL: 'http://127.0.0.1:11434/api',
});

export async function POST(req: Request): Promise<Response> {
  const requestStartTime = performance.now();
  try {
    const body: ChatRequestBody = await req.json();
    const { messages } = body;
    
    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages payload is missing or empty' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const lastMessageObj = messages[messages.length - 1];
    let lastMessage = '';
    
    if (typeof lastMessageObj.content === 'string') {
      lastMessage = lastMessageObj.content;
    } else if (Array.isArray(lastMessageObj.content)) {
      lastMessage = lastMessageObj.content
        .filter(part => part.type === 'text')
        .map(part => (part as any).text || '')
        .join(' ');
    }

    const { hasGemini, hasPinecone } = validateEnvironment();

    let retrievedContext = '';
    let dbMatchCount = 0;

    // 1. DUAL-MODE SEMANTIC VECTOR RETRIEVAL
    if (hasGemini && hasPinecone && config.pineconeApiKey && config.pineconeIndex) {
      const dbStartTime = performance.now();
      try {
        console.info('[Chat API] Performing Semantic Vector Search via Pinecone Cloud DB...');
        const pinecone = new Pinecone({ apiKey: config.pineconeApiKey });
        const index = pinecone.Index(config.pineconeIndex);

        // Generate dynamic prompt embedding
        const { embedding } = await embed({
          model: google.embedding('text-embedding-004'),
          value: lastMessage,
        });

        // Search nearest neighbor records
        const queryResponse = await index.query({
          vector: embedding,
          topK: 5,
          includeMetadata: true
        });

        if (queryResponse.matches) {
          retrievedContext = queryResponse.matches
            .filter(match => match.metadata && match.score && match.score > 0.4)
            .map(match => {
              const metadata = match.metadata as { url: string; text: string };
              dbMatchCount++;
              return `Source: ${metadata.url}\n${metadata.text}`;
            })
            .join('\n\n');
        }

        const dbDuration = (performance.now() - dbStartTime).toFixed(2);
        console.info(`[Vector Retrieval] Success: Found ${dbMatchCount} matches in ${dbDuration}ms`);

      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('[Vector Retrieval Failed] Routing to local keyword fallback:', errorMsg);
      }
    }

    // Local Search Fallback (if Pinecone is missing/fails or off-grid)
    if (!retrievedContext) {
      const localStartTime = performance.now();
      console.info('[Chat API] Running local keyword-based indexing search...');
      const queryWords = lastMessage.toLowerCase().match(/\w+/g) || [];
      
      const typedFallbackData = ragDataFallback as FallbackChunk[];
      
      const scoredChunks = typedFallbackData.map((chunk) => {
        let score = 0;
        if (chunk.words) {
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

      const localDuration = (performance.now() - localStartTime).toFixed(2);
      console.info(`[Local Retrieval] Success: Context prepared in ${localDuration}ms`);
    }

    // 2. CONTEXT-AWARE SYSTEM PROMPT INJECTION
    const systemPrompt = `You are a helpful, friendly, and expert AI assistant. Use the following context from IMDb to answer the user's question accurately. 

If the context contains the answer, answer it clearly and mention the source links where appropriate.
If the context doesn't contain the answer, say "Based on the scraped IMDb data in my index, I couldn't find that specific information" and then provide your best helpful general response.

IMDb Context:
${retrievedContext || 'No IMDb list information available.'}`;

    // 3. DUAL-MODE GENERATION ROUTER (Gemini vs local Ollama)
    if (hasGemini) {
      console.info('[Chat Generation] Request routed to Cloud Google Gemini-1.5-Flash');
      const result = streamText({
        model: google('gemini-1.5-flash'),
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        onFinish: () => {
          const totalDuration = (performance.now() - requestStartTime).toFixed(2);
          console.info(`[Chat API Complete] Gemini streaming finished. Total Latency: ${totalDuration}ms`);
        }
      });
      return result.toTextStreamResponse();
    } else {
      console.info('[Chat Generation] Request routed to Local Ollama Instance (llama3)');
      
      // We safely cast the ollama model instance to prevent Next.js TS compiler warnings
      const ollamaModel = ollama('llama3') as any;
      
      const result = streamText({
        model: ollamaModel,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        onFinish: () => {
          const totalDuration = (performance.now() - requestStartTime).toFixed(2);
          console.info(`[Chat API Complete] Local Ollama streaming finished. Total Latency: ${totalDuration}ms`);
        }
      });
      return result.toTextStreamResponse();
    }

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Chat Engine Panic] API Error:', errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
