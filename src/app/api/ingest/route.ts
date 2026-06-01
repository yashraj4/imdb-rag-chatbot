import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { google } from '@ai-sdk/google';
import { embedMany } from 'ai';
import { RecursiveCharacterTextSplitter } from '@/lib/splitter';
import { config, validateEnvironment } from '@/lib/config';

interface ScrapedChunk {
  id: string;
  url: string;
  text: string;
  words: string[];
}

const urlsToScrape: string[] = [
  'https://www.imdb.com/list/ls023470650/',
  'https://www.imdb.com/list/ls002987241/'
];

// Instantiating semantic Recursive Text Splitter
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200
});

async function scrapeText(url: string): Promise<string> {
  const startTime = performance.now();
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    }
  });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  
  // Remove non-content structural elements
  $('script, style, nav, footer, header').remove();
  
  let text = '';
  const listItems = $('.lister-item, .ipc-metadata-list-summary-item');
  
  if (listItems.length > 0) {
    listItems.each((_, el) => {
      text += $(el).text().replace(/\s+/g, ' ').trim() + '\n\n';
    });
  } else {
    text = $('body').text().replace(/\s+/g, ' ').trim();
  }

  const duration = (performance.now() - startTime).toFixed(2);
  console.info(`[Scraper] Scraped ${url} successfully in ${duration}ms`);
  return text;
}

export async function POST(req: Request): Promise<Response> {
  const pipelineStartTime = performance.now();
  try {


    console.info('[Data Pipeline] Starting ingestion and semantic parsing...');
    const allChunks: ScrapedChunk[] = [];

    // 1. Scraping Step
    for (const url of urlsToScrape) {
      try {
        const text = await scrapeText(url);
        const chunks = splitter.splitText(text);
        
        for (const chunk of chunks) {
          if (chunk.length > 50) {
            const cleanText = chunk.trim();
            allChunks.push({
              id: `${Buffer.from(url).toString('base64').slice(0, 15)}-${Math.random().toString(36).substring(2, 7)}`,
              url,
              text: cleanText,
              words: Array.from(new Set(cleanText.toLowerCase().match(/\w+/g) || []))
            });
          }
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[Scraper Error] Failed to scrape ${url}:`, errorMessage);
      }
    }

    const { hasGemini, hasPinecone } = validateEnvironment();
    let vectorDbStatus = 'Skipped (Keys not configured)';
    let localFileStatus = 'Saved successfully';

    // 2. Vector DB Ingestion (Pinecone + Gemini Embeddings)
    if (hasGemini && hasPinecone && config.pineconeApiKey && config.pineconeIndex) {
      const dbStartTime = performance.now();
      console.info('[Data Pipeline] Processing high-dimensional embeddings...');
      
      const pinecone = new Pinecone({
        apiKey: config.pineconeApiKey
      });
      const index = pinecone.Index(config.pineconeIndex);

      const textsToEmbed = allChunks.map(c => c.text);
      
      // Generating embeddings with Google's text-embedding-004
      const { embeddings } = await embedMany({
        model: google.embedding('text-embedding-004'),
        values: textsToEmbed,
      });

      // Mapping chunk records to Pinecone format
      const vectors = allChunks.map((chunk, idx) => ({
        id: chunk.id,
        values: embeddings[idx],
        metadata: {
          url: chunk.url,
          text: chunk.text
        }
      }));

      // Ingesting in batch arrays of 100 to prevent API timeouts
      const batchSize = 100;
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        await index.upsert(batch as any);
      }
      
      const dbDuration = (performance.now() - dbStartTime).toFixed(2);
      vectorDbStatus = `Ingested ${vectors.length} vectors in ${dbDuration}ms`;
      console.info(`[Vector Ingestion] Successful: ${vectorDbStatus}`);
    }

    // 3. Local Sync JSON Backup (Enables local dev fallback)
    const dataDir = path.join(process.cwd(), 'src');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(dataDir, 'rag-data.json'), 
      JSON.stringify(allChunks, null, 2)
    );

    const totalPipelineDuration = (performance.now() - pipelineStartTime).toFixed(2);
    console.info(`[Data Pipeline] Completed in ${totalPipelineDuration}ms`);

    return NextResponse.json({
      success: true,
      message: 'Ingestion pipeline executed successfully',
      chunksIndexed: allChunks.length,
      pipelineExecution: {
        scraping: 'Completed (Cheerio)',
        localIndex: localFileStatus,
        cloudVectorDB: vectorDbStatus,
        totalDurationMs: parseFloat(totalPipelineDuration)
      }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Pipeline Panic] Ingestion crashed:', errorMessage);
    return NextResponse.json(
      { success: false, error: errorMessage }, 
      { status: 500 }
    );
  }
}
