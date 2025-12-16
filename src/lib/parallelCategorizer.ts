import { categorizeCommentWithAI } from './bytez-ai';

/**
 * Configuration for parallel categorization
 */
export interface ParallelCategorizerConfig {
    /** Number of comments per batch (default: 100) */
    batchSize?: number;
    /** Maximum number of batches to process in parallel (default: 5) */
    maxParallelBatches?: number;
    /** Initial delay between batch groups in ms (default: 200) */
    initialDelayMs?: number;
    /** Maximum retry attempts per batch (default: 3) */
    maxRetries?: number;
    /** Progress callback: (progress%, processed, total) => void */
    onProgress?: (progress: number, processed: number, total: number) => void;
}

/**
 * Result from categorizing comments
 */
export interface CategorizationResult {
    categories: Array<'question' | 'feedback' | 'general'>;
    stats: {
        totalProcessed: number;
        totalTime: number;
        averageTimePerComment: number;
        batchesProcessed: number;
        failedComments: number;
    };
}

/**
 * Dynamic rate limiter that adjusts delays based on API performance
 */
class DynamicRateLimiter {
    private delayMs: number;
    private readonly minDelay: number = 100;
    private readonly maxDelay: number = 2000;
    private recentResponseTimes: number[] = [];
    private readonly maxSamples: number = 10;

    constructor(initialDelay: number = 200) {
        this.delayMs = initialDelay;
    }

    /**
     * Record an API response time and adjust delay accordingly
     */
    recordResponseTime(timeMs: number) {
        this.recentResponseTimes.push(timeMs);
        if (this.recentResponseTimes.length > this.maxSamples) {
            this.recentResponseTimes.shift();
        }

        // Calculate average response time
        const avgResponseTime = this.recentResponseTimes.reduce((a, b) => a + b, 0) / this.recentResponseTimes.length;

        // Adjust delay based on response time
        // If responses are fast (<500ms), reduce delay
        // If responses are slow (>1000ms), increase delay
        if (avgResponseTime < 500) {
            this.delayMs = Math.max(this.minDelay, this.delayMs * 0.9);
        } else if (avgResponseTime > 1000) {
            this.delayMs = Math.min(this.maxDelay, this.delayMs * 1.2);
        }
    }

    /**
     * Get current delay and apply it
     */
    async wait(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    getCurrentDelay(): number {
        return this.delayMs;
    }
}

/**
 * Process a single batch with retry logic
 */
async function processBatchWithRetry(
    comments: string[],
    maxRetries: number = 3
): Promise<Array<'question' | 'feedback' | 'general'>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const results = await Promise.all(
                comments.map(comment => categorizeCommentWithAI(comment))
            );
            return results;
        } catch (error) {
            lastError = error as Error;
            console.warn(`Batch processing attempt ${attempt + 1} failed:`, error);

            // Exponential backoff: wait longer between retries
            if (attempt < maxRetries - 1) {
                const backoffDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
        }
    }

    // If all retries failed, throw the last error
    throw lastError || new Error('Batch processing failed');
}

/**
 * Categorize comments in parallel with aggressive optimization
 * 
 * This function processes comments much faster than sequential processing by:
 * 1. Processing multiple batches in parallel (up to maxParallelBatches)
 * 2. Using larger batch sizes (default 100 comments per batch)
 * 3. Dynamically adjusting delays based on API response times
 * 4. Implementing retry logic with exponential backoff
 * 
 * Expected performance for 20k comments: 2-3 minutes (vs 8-10 minutes sequential)
 */
export async function parallelCategorizeComments(
    comments: string[],
    config: ParallelCategorizerConfig = {}
): Promise<CategorizationResult> {
    const {
        batchSize = 100,
        maxParallelBatches = 5,
        initialDelayMs = 200,
        maxRetries = 3,
        onProgress
    } = config;

    const startTime = Date.now();
    const totalComments = comments.length;
    const categories: Array<'question' | 'feedback' | 'general'> = new Array(totalComments);
    const rateLimiter = new DynamicRateLimiter(initialDelayMs);

    let processedCount = 0;
    let failedCount = 0;
    let batchesProcessed = 0;

    // Split comments into batches
    const batches: string[][] = [];
    for (let i = 0; i < totalComments; i += batchSize) {
        batches.push(comments.slice(i, Math.min(i + batchSize, totalComments)));
    }

    console.log(`Starting parallel categorization: ${totalComments} comments in ${batches.length} batches`);
    console.log(`Config: batchSize=${batchSize}, maxParallelBatches=${maxParallelBatches}`);

    // Process batches in parallel groups
    for (let i = 0; i < batches.length; i += maxParallelBatches) {
        const batchGroup = batches.slice(i, Math.min(i + maxParallelBatches, batches.length));
        const batchStartIndices = batchGroup.map((_, idx) => (i + idx) * batchSize);

        console.log(`Processing batch group ${Math.floor(i / maxParallelBatches) + 1}: ${batchGroup.length} batches in parallel`);

        const batchStartTime = Date.now();

        // Process all batches in this group in parallel
        // Process all batches in this group in parallel
        // tailored wrapper to report progress as each batch finishes
        const batchPromises = batchGroup.map(async (batch, idx) => {
            try {
                const result = await processBatchWithRetry(batch, maxRetries);

                // Success: store categories immediately
                const startIndex = batchStartIndices[idx];
                result.forEach((category, commentIdx) => {
                    categories[startIndex + commentIdx] = category;
                });

                processedCount += batch.length;
            } catch (error) {
                // Failure: use fallback immediately
                console.error(`Batch ${i + idx} failed after retries:`, error);
                const startIndex = batchStartIndices[idx];
                batch.forEach((comment, commentIdx) => {
                    categories[startIndex + commentIdx] = fallbackCategorize(comment);
                    failedCount++;
                });
                processedCount += batch.length;
            }

            // Report progress immediately after THIS batch finishes
            const progress = Math.round((processedCount / totalComments) * 100);
            if (onProgress) {
                onProgress(progress, processedCount, totalComments);
            }
            console.log(`Progress: ${processedCount}/${totalComments} (${progress}%)`);
        });

        await Promise.all(batchPromises);

        const batchEndTime = Date.now();
        const batchDuration = batchEndTime - batchStartTime;
        rateLimiter.recordResponseTime(batchDuration);

        // Apply dynamic delay before next batch group (except for the last group)
        if (i + maxParallelBatches < batches.length) {
            await rateLimiter.wait();
        }
    }

    const totalTime = Date.now() - startTime;
    const averageTimePerComment = totalTime / totalComments;

    console.log(`Categorization complete: ${totalComments} comments in ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`Average: ${averageTimePerComment.toFixed(2)}ms per comment`);
    console.log(`Failed comments (using fallback): ${failedCount}`);

    return {
        categories,
        stats: {
            totalProcessed: processedCount,
            totalTime,
            averageTimePerComment,
            batchesProcessed,
            failedComments: failedCount
        }
    };
}

/**
 * Simple rule-based fallback categorization
 */
function fallbackCategorize(text: string): 'question' | 'feedback' | 'general' {
    const lowerText = text.toLowerCase();

    if (
        text.trim().endsWith('?') ||
        lowerText.startsWith('how') ||
        lowerText.startsWith('what') ||
        lowerText.startsWith('why') ||
        lowerText.startsWith('when') ||
        lowerText.startsWith('where') ||
        lowerText.startsWith('who')
    ) {
        return 'question';
    }

    if (
        lowerText.includes('suggestion') ||
        lowerText.includes('should') ||
        lowerText.includes('recommend') ||
        lowerText.includes('love') ||
        lowerText.includes('hate') ||
        lowerText.includes('great') ||
        lowerText.includes('awesome')
    ) {
        return 'feedback';
    }

    return 'general';
}
