import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { RecursiveCharacterTextSplitter } from '@/lib/splitter';

interface ScrapedChunk {
  id: string;
  url: string;
  text: string;
  words: string[];
}

const urlsToScrape = [
  'https://www.imdb.com/list/ls023470650/',
  'https://www.imdb.com/list/ls002987241/',
];

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

function isBlockedPage(text: string): boolean {
  const normalizedText = text.toLowerCase();
  return (
    normalizedText.includes('javascript is disabled') ||
    normalizedText.includes("verify that you're not a robot") ||
    normalizedText.includes('verify that you are not a robot')
  );
}

function toWords(text: string): string[] {
  return Array.from(new Set(text.toLowerCase().match(/\w+/g) || []));
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,text/csv,text/plain,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  return res.text();
}

async function scrapeImdbList(url: string): Promise<string> {
  const html = await fetchText(url);
  const $ = cheerio.load(html);

  $('script, style, nav, footer, header').remove();

  const listItems = $('.lister-item, .ipc-metadata-list-summary-item');
  const text = listItems.length > 0
    ? listItems
      .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean)
      .join('\n\n')
    : $('body').text().replace(/\s+/g, ' ').trim();

  if (!text || isBlockedPage(text)) {
    throw new Error('IMDb returned a bot/JavaScript verification page instead of list content');
  }

  return text;
}

export async function POST(): Promise<Response> {
  const startedAt = performance.now();
  const allChunks: ScrapedChunk[] = [];
  const failures: Array<{ url: string; error: string }> = [];

  for (const url of urlsToScrape) {
    try {
      const text = await scrapeImdbList(url);
      const chunks = splitter.splitText(text);

      for (const chunk of chunks) {
        const cleanText = chunk.trim();
        if (cleanText.length <= 50) continue;

        allChunks.push({
          id: `${Buffer.from(url).toString('base64url').slice(0, 15)}-${allChunks.length + 1}`,
          url,
          text: cleanText,
          words: toWords(cleanText),
        });
      }
    } catch (error: unknown) {
      failures.push({
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const outputPath = path.join(process.cwd(), 'src', 'rag-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(allChunks, null, 2));

  return NextResponse.json({
    success: allChunks.length > 0,
    mode: 'local-rag-no-api-keys',
    sources: urlsToScrape,
    chunksIndexed: allChunks.length,
    failures,
    outputPath,
    totalDurationMs: Number((performance.now() - startedAt).toFixed(2)),
  });
}
