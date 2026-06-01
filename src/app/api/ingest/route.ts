// @ts-nocheck
import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { google } from '@ai-sdk/google';
import { embedMany } from 'ai';

const urlsToScrape = [
  'https://www.imdb.com/list/ls023470650/',
  'https://www.imdb.com/list/ls002987241/'
];

// Helper to chunk text
function chunkText(text: string, size = 1000) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

// Scrape IMDb utility
async function scrapeText(url: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    }
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  
  $('script, style, nav, footer, header').remove();
  
  let text = '';
  const listItems = $('.lister-item, .ipc-metadata-list-summary-item');
  if (listItems.length > 0) {
    listItems.each((i, el) => {
      text += $(el).text().replace(/\s+/g, ' ').trim() + '\n\n';
    });
  } else {
    text = $('body').text().replace(/\s+/g, ' ').trim();
  }
  return text;
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    // Basic security token check for production environment
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && process.env.INGEST_SECRET && authHeader !== `Bearer ${process.env.INGEST_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Starting automated data ingestion pipeline...');
    const allChunks: any[] = [];

    // 1. Scraping Step
    for (const url of urlsToScrape) {
      try {
        const text = await scrapeText(url);
        const chunks = chunkText(text, 1000);
        for (const chunk of chunks) {
          if (chunk.length > 50) {
            allChunks.push({
              id: `${Buffer.from(url).toString('base64').slice(0, 15)}-${Math.random().toString(36).substring(2, 7)}`,
              url,
              text: chunk,
              words: Array.from(new Set(chunk.toLowerCase().match(/\w+/g) || []))
            });
          }
        }
      } catch (err: any) {
        console.error(`Error scraping ${url}:`, err.message);
      }
    }

    const hasGemini = !!process.env.GEMINI_API_KEY;
    const hasPinecone = !!process.env.PINECONE_API_KEY && !!process.env.PINECONE_ENVIRONMENT && !!process.env.PINECONE_INDEX;

    let vectorDbStatus = 'Skipped (Keys not configured)';
    let localFileStatus = 'Saved successfully';

    // 2. Vector DB Ingestion (Pinecone Serverless + Google text-embedding-004)
    if (hasGemini && hasPinecone) {
      console.log('Pinecone & Gemini configured. Running Cloud Vector Ingestion...');
      const pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY!
      });
      const index = pinecone.Index(process.env.PINECONE_INDEX!);

      // Extract texts to embed
      const textsToEmbed = allChunks.map(c => c.text);
      
      // Generate high-dimensional vector embeddings
      const { embeddings } = await embedMany({
        model: google.embedding('text-embedding-004'),
        values: textsToEmbed,
      });

      // Format for Pinecone upsert
      const vectors = allChunks.map((chunk, idx) => ({
        id: chunk.id,
        values: embeddings[idx],
        metadata: {
          url: chunk.url,
          text: chunk.text
        }
      }));

      // Upsert vectors in batches of 100
      const batchSize = 100;
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        await index.upsert(batch);
      }
      vectorDbStatus = `Upserted ${vectors.length} vectors to Pinecone Index "${process.env.PINECONE_INDEX}"`;
    }

    // 3. Local JSON Fallback / Backup (Ensures robust offline-first and safe local development)
    const dataDir = path.join(process.cwd(), 'src');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(path.join(dataDir, 'rag-data.json'), JSON.stringify(allChunks, null, 2));

    return NextResponse.json({
      success: true,
      message: 'Ingestion pipeline executed successfully',
      chunksIndexed: allChunks.length,
      pipelineExecution: {
        scraping: 'Completed (Cheerio)',
        localIndex: localFileStatus,
        cloudVectorDB: vectorDbStatus
      }
    });

  } catch (error: any) {
    console.error('Ingestion pipeline crashed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
