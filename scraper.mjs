import * as cheerio from 'cheerio';
import fs from 'fs';

const urlsToScrape = [
  'https://www.imdb.com/list/ls023470650/',
  'https://www.imdb.com/list/ls002987241/'
];

function isBlockedPage(text) {
  const normalizedText = text.toLowerCase();
  return (
    normalizedText.includes('javascript is disabled') ||
    normalizedText.includes("verify that you're not a robot") ||
    normalizedText.includes('verify that you are not a robot')
  );
}

async function scrapeText(url) {
  console.log(`Fetching ${url}...`);
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
  // IMDb list items extraction
  const listItems = $('.lister-item, .ipc-metadata-list-summary-item');
  if (listItems.length > 0) {
    listItems.each((i, el) => {
      text += $(el).text().replace(/\s+/g, ' ').trim() + '\n\n';
    });
  } else {
    // fallback
    text = $('body').text().replace(/\s+/g, ' ').trim();
  }

  if (isBlockedPage(text)) {
    throw new Error('IMDb returned a bot/JavaScript verification page instead of list content');
  }
  
  return text;
}

function chunkText(text, size = 1500) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

async function run() {
  const allChunks = [];
  for (const url of urlsToScrape) {
    const text = await scrapeText(url);
    const chunks = chunkText(text, 1500);
    for (const chunk of chunks) {
      if (chunk.length > 50) {
        const words = Array.from(new Set(chunk.toLowerCase().match(/\w+/g) || []));
        allChunks.push({ url, text: chunk, words });
      }
    }
  }

  const outputPath = 'src/rag-data.json';
  fs.writeFileSync(outputPath, JSON.stringify(allChunks));
  console.log(`Saved successfully ${allChunks.length} chunks to ${outputPath}`);
}

run().catch(console.error);
