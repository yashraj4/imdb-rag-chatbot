export interface SystemConfig {
  geminiApiKey: string | undefined;
  pineconeApiKey: string | undefined;
  pineconeIndex: string | undefined;
  isProduction: boolean;
}

export const config: SystemConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  pineconeApiKey: process.env.PINECONE_API_KEY,
  pineconeIndex: process.env.PINECONE_INDEX,
  isProduction: process.env.NODE_ENV === 'production',
};

/**
 * Validates environment variables and logs clear engineering warnings
 * instead of letting silent runtime errors crash the application.
 */
export function validateEnvironment(): { hasGemini: boolean; hasPinecone: boolean } {
  const hasGemini = typeof config.geminiApiKey === 'string' && config.geminiApiKey.length > 0;
  const hasPinecone = 
    typeof config.pineconeApiKey === 'string' && config.pineconeApiKey.length > 0 &&
    typeof config.pineconeIndex === 'string' && config.pineconeIndex.length > 0;

  if (config.isProduction) {
    if (!hasGemini) {
      console.warn('⚠️ ENGINE WARNING: GEMINI_API_KEY is not defined. The app will fall back to mock interface generation in production.');
    }
    if (!hasPinecone) {
      console.warn('⚠️ PIPELINE WARNING: PINECONE_API_KEY or PINECONE_INDEX is not defined. The ingestion data pipeline will fall back to local file caching.');
    }
  } else {
    // Development mode warning
    if (!hasGemini || !hasPinecone) {
      console.info('ℹ️ Developer Notice: Active cloud integration (Gemini + Pinecone) is missing in environment. Running on fully operational local fallback.');
    }
  }

  return { hasGemini, hasPinecone };
}
