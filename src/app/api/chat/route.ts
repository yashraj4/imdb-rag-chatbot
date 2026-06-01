// @ts-nocheck
import { streamText, embed } from 'ai';
import { google } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import { Pinecone } from '@pinecone-database/pinecone';
import ragDataFallback from '@/rag-data.json';

export const maxDuration = 30;

// Setup local Ollama fallback for offline local development
const ollama = createOllama({
  baseURL: 'http://127.0.0.1:11434/api',
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const lastMessage = messages[messages.length - 1].content;
    
    const hasGemini = !!process.env.GEMINI_API_KEY;
    const hasPinecone = !!process.env.PINECONE_API_KEY && !!process.env.PINECONE_INDEX;

    let retrievedContext = '';

    // 1. DUAL-MODE RETRIEVAL SYSTEM
    if (hasGemini && hasPinecone) {
      try {
        console.log('Production mode: Performing Semantic Vector Search via Pinecone...');
        
        // Connect to Pinecone
        const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
        const index = pinecone.Index(process.env.PINECONE_INDEX!);

        // Generate query embedding
        const { embedding } = await embed({
          model: google.embedding('text-embedding-004'),
          value: lastMessage,
        });

        // Query vector database for top 5 nearest neighbors
        const queryResponse = await index.query({
          vector: embedding,
          topK: 5,
          includeMetadata: true
        });

        retrievedContext = queryResponse.matches
          .filter(match => match.metadata && match.score && match.score > 0.4)
          .map(match => `Source: ${match.metadata.url}\n${match.metadata.text}`)
          .join('\n\n');
          
      } catch (err: any) {
        console.error('Vector DB query failed, falling back to local search:', err.message);
      }
    }

    // Local Search Fallback (if Pinecone fails or keys are missing)
    if (!retrievedContext) {
      console.log('Development mode: Performing Local BM25-lite keyword search...');
      const queryWords = lastMessage.toLowerCase().match(/\w+/g) || [];
      
      const scoredChunks = ragDataFallback.map((chunk: any) => {
        let score = 0;
        if (chunk.words) {
          for (const word of queryWords) {
            if (chunk.words.includes(word)) score++;
          }
        }
        return { ...chunk, score };
      }).sort((a: any, b: any) => b.score - a.score).slice(0, 5);

      retrievedContext = scoredChunks
        .filter((c: any) => c.score > 0)
        .map((c: any) => `Source: ${c.url}\n${c.text}`)
        .join('\n\n');
    }

    // 2. CHAT GENERATION SYSTEM (Dual-mode: Cloud Gemini vs Local Ollama)
    const systemPrompt = `You are an expert, professional, and friendly AI assistant. Use the following parsed IMDb information to answer the user's question accurately. 

If the context contains the answer, answer it clearly and mention the source links if appropriate.
If the context does not contain the answer, say "Based on the scraped IMDb data in my index, I couldn't find that specific information" and then provide your best helpful general response.

IMDb Context:
${retrievedContext || 'No context found.'}`;

    // Cloud Routing (Vercel/Netlify Production)
    if (hasGemini) {
      console.log('Routing generation to Cloud Google Gemini...');
      const result = streamText({
        model: google('gemini-1.5-flash'),
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      });
      return result.toTextStreamResponse();
    } 
    
    // Local Routing (Offline Local Dev via Ollama)
    else {
      console.log('Routing generation to Local Ollama (llama3)...');
      const result = streamText({
        // @ts-ignore
        model: ollama('llama3'),
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      });
      // @ts-ignore
      return result.toTextStreamResponse();
    }

  } catch (error: any) {
    console.error('Chat API Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
