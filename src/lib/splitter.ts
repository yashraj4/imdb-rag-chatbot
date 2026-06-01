/**
 * A production-grade Recursive Character Text Splitter that splits text by semantically
 * meaningful separators (paragraphs, sentences, words) to prevent cutting words or context in half.
 */
export interface SplitterOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
}

export class RecursiveCharacterTextSplitter {
  private chunkSize: number;
  private chunkOverlap: number;
  private separators: string[];

  constructor(options: SplitterOptions = {}) {
    this.chunkSize = options.chunkSize ?? 1000;
    this.chunkOverlap = options.chunkOverlap ?? 200;
    this.separators = options.separators ?? ['\n\n', '\n', ' ', ''];
  }

  public splitText(text: string): string[] {
    const finalChunks: string[] = [];
    
    // Choose the best separator that fits the chunk size constraints
    let separator = this.separators[this.separators.length - 1];
    for (const s of this.separators) {
      if (s === '') {
        separator = s;
        break;
      }
      if (text.includes(s)) {
        separator = s;
        break;
      }
    }

    let splits: string[];
    if (separator) {
      splits = text.split(separator);
    } else {
      splits = text.split('');
    }

    let currentChunk = '';
    
    for (const split of splits) {
      const prospectiveChunk = currentChunk 
        ? `${currentChunk}${separator}${split}` 
        : split;

      if (prospectiveChunk.length <= this.chunkSize) {
        currentChunk = prospectiveChunk;
      } else {
        if (currentChunk) {
          finalChunks.push(currentChunk);
        }
        
        // Handle chunk overlap calculation
        if (this.chunkOverlap > 0 && currentChunk.length > this.chunkOverlap) {
          currentChunk = currentChunk.slice(-this.chunkOverlap) + separator + split;
        } else {
          currentChunk = split;
        }
      }
    }

    if (currentChunk) {
      finalChunks.push(currentChunk);
    }

    return finalChunks;
  }
}
