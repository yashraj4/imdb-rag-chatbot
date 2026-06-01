import { streamText, embed, ModelMessage } from 'ai';
import { google } from '@ai-sdk/google';
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

    // 3. DUAL-MODE GENERATION ROUTER (Gemini vs Custom local simulated stream)
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
      console.info('[Chat Generation] Routing to Local Simulated Streaming (Offline Developer Mode)...');
      
      // Generate highly realistic response using local fetched RAG context
      let mockAnswer = '';
      if (retrievedContext) {
        mockAnswer = `[Offline Local RAG Search]\n\nBased on the local scraped IMDb lists, here is the relevant context I fetched for you:\n\n${retrievedContext}\n\n*(Note: To activate real Google Gemini 1.5 Flash generation, please add GEMINI_API_KEY to your env settings).*`;
      } else {
        mockAnswer = `[Offline Local RAG Search]\n\nI couldn't find any close matches in the local IMDb scraped data for your question: "${lastMessage}".\n\n*(Note: To activate real Google Gemini 1.5 Flash generation, please add GEMINI_API_KEY to your env settings).*`;
      }

      const encoder = new TextEncoder();
      const customStream = new ReadableStream({
        async start(controller) {
          // Stream word by word to emulate active streaming response
          const words = mockAnswer.split(' ');
          for (const word of words) {
            controller.enqueue(encoder.encode(word + ' '));
            await new Promise(resolve => setTimeout(resolve, 30));
          }
          controller.close();
        }
      });

      return new Response(customStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked'
        }
      });
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
