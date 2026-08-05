// NVIDIA DeepSeek v3.1 AI Service
import OpenAI from 'openai';

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';

// meta/llama-3.3-70b-instruct accepts requests on this account but never returns -- a completion
// capped at 20 tokens produced zero bytes after 45s, repeatedly, while /v1/models answered in half
// a second. That is what surfaced in the UI as "Summary unavailable": every AI call sat until it
// hit a timeout. llama-3.1-8b-instruct answers the same prompts in under a second and is more than
// adequate for three-way classification and short bullet summaries.
// Override with NVIDIA_MODEL_ID if a different model is preferred.
const MODEL_ID = process.env.NVIDIA_MODEL_ID || "meta/llama-3.1-8b-instruct";

// Initialize OpenAI client with NVIDIA base URL.
// timeout/maxRetries are set explicitly: the SDK defaults to a 10 minute timeout with 2 retries,
// which is far longer than the route's 300s maxDuration -- a single slow request would otherwise
// keep the function alive until the platform kills it, and the client sees nothing at all.
const openai = new OpenAI({
    apiKey: NVIDIA_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1',
    timeout: 30000, // per-request override supplied by each caller
    maxRetries: 0, // retries are handled in runDeepSeekModel so backoff stays bounded
});

/**
 * Check if API key is configured
 */
function isConfigured(): boolean {
    return NVIDIA_API_KEY !== '';
}

/**
 * Cheap check that the model endpoint is actually answering.
 *
 * When the provider stops responding, every categorization batch and every summary has to burn its
 * own timeout before giving up -- minutes of waiting to arrive at results we could have produced
 * immediately. One tiny request up front lets the caller skip the AI path outright instead.
 *
 * Note this deliberately calls chat/completions rather than a lighter endpoint: /v1/models kept
 * answering in under a second while inference hung indefinitely, so only inference proves inference.
 */
// Deliberately generous. A false negative here disables AI for the whole run, which is a worse
// outcome than waiting: the failure this guards against is a service that hangs for 45s+, so a
// slow first token still needs to pass. 8s was tight enough to fail intermittently on a healthy
// service and skip AI on runs that would have succeeded.
export async function isAiResponsive(timeoutMs: number = 20000): Promise<boolean> {
    if (!isConfigured()) return false;

    try {
        await openai.chat.completions.create({
            model: MODEL_ID,
            messages: [{ role: 'user', content: 'ok' }],
            max_tokens: 1,
            stream: false,
        }, { timeout: timeoutMs });
        return true;
    } catch (error: any) {
        const status = error?.status ?? error?.response?.status;
        // A rate limit means the service is up and we are merely being throttled; the retry and
        // backoff in runDeepSeekModel can handle that. Anything else means don't bother.
        if (status === 429) return true;
        console.warn(`AI health check failed (status=${status ?? 'none'}):`, error?.message ?? error);
        return false;
    }
}

/**
 * Helper to make requests to NVIDIA DeepSeek API
 */
async function runDeepSeekModel(
    messages: { role: string; content: string }[],
    // Classifying a batch of comments takes materially longer than summarising one block of text,
    // so callers set their own ceiling instead of sharing a single client-wide timeout.
    timeoutMs: number = 30000
): Promise<string> {
    if (!isConfigured()) {
        throw new Error("NVIDIA API key not configured");
    }

    // Retry rate limits with backoff. Summaries are generated three at a time, which is enough
    // concurrency to trip NVIDIA's limiter and fail all three together.
    const MAX_ATTEMPTS = 3;
    let lastError: any;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
            const completion = await openai.chat.completions.create({
                model: MODEL_ID,
                messages: messages as any,
                temperature: 0.2,
                top_p: 0.7,
                max_tokens: 1024,
                stream: false // Non-streaming for simplicity in categorization/summarization
            }, { timeout: timeoutMs });

            return completion.choices[0]?.message?.content || '';
        } catch (error: any) {
            lastError = error;
            const status = error?.status ?? error?.response?.status;
            const retryable = status === 429 || (status >= 500 && status < 600);

            if (!retryable || attempt === MAX_ATTEMPTS - 1) break;

            // Honour Retry-After when the provider sends it; otherwise back off exponentially.
            // The previous 1s/2s waits were shorter than the rate-limit window, so every retry
            // came straight back as another 429.
            const retryAfterHeader = error?.headers?.['retry-after'];
            const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
            const backoffMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0
                ? Math.min(retryAfterMs, 30000)
                : 3000 * Math.pow(2, attempt); // 3s, 6s

            console.warn(
                `NVIDIA request failed (status=${status}), retrying in ${backoffMs}ms ` +
                `(attempt ${attempt + 1}/${MAX_ATTEMPTS})`
            );
            await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
    }

    console.error("NVIDIA request failed:", lastError?.message ?? lastError);
    throw lastError;
}

/**
 * Summarize text using DeepSeek v3.1 via NVIDIA
 */
export async function summarizeText(text: string, maxLength: number = 2048): Promise<string> {
    if (!isConfigured()) {
        console.warn('NVIDIA API not configured');
        return 'AI summarization unavailable';
    }

    try {
        const content = await runDeepSeekModel([
            {
                role: 'system',
                content: 'You are a helpful assistant that summarizes YouTube comments. Provide a summary as a list of 3-5 bullet points. Start each point with a "* ". Use **bold** for the main topic, followed by a colon and the description. Example: "* **Topic**: Description". Do NOT include any introductory text. Start directly with the first bullet point.'
            },
            {
                role: 'user',
                content: `Summarize these comments:\n\n${text.slice(0, maxLength)}`
            }
        ]);

        return content || 'No summary available';
    } catch (error: any) {
        // Log the status alongside the message: a bare "Summary unavailable" gives no way to tell
        // a rate limit apart from a bad key or a timeout.
        const status = error?.status ?? error?.response?.status;
        console.error(
            `Error summarizing with NVIDIA (status=${status ?? 'none'}):`,
            error?.message ?? error
        );

        if (status === 429) return 'Summary unavailable (rate limited)';
        if (status === 401 || status === 403) return 'Summary unavailable (API key rejected)';
        return 'Summary unavailable';
    }
}

/**
 * Categorize a comment using DeepSeek v3.1 via NVIDIA
 */
export async function categorizeCommentWithAI(commentText: string): Promise<'question' | 'feedback' | 'general'> {
    if (!isConfigured()) {
        return fallbackCategorize(commentText);
    }

    try {
        const content = await runDeepSeekModel([
            {
                role: 'system',
                content: `You are a comment classifier. Categorize the comment into exactly one of these three categories:
1. "question" (asks for info/help)
2. "feedback" (opinions, praise, criticism, suggestions)
3. "general" (random statements, observations)

Reply with ONLY the category name in lowercase. Do not add punctuation or explanation.`
            },
            {
                role: 'user',
                content: `Comment: "${commentText}"`
            }
        ]);

        const category = (content || '').toLowerCase().trim();

        if (category.includes('question')) return 'question';
        if (category.includes('feedback')) return 'feedback';
        if (category.includes('general')) return 'general';

        // If it returns something weird, try to guess or fallback
        if (category.length > 20) return fallbackCategorize(commentText);

        return 'general';
    } catch (error) {
        // Fallback to rule-based if AI fails
        return fallbackCategorize(commentText);
    }
}

/**
 * Number of comments sent per AI request by categorizeCommentsBatch.
 *
 * Round-trip latency dominates here, not batch size: 50 comments come back in about the same time
 * as 20. Larger batches therefore cut total wall-clock roughly proportionally, which is what keeps
 * a sampled 1000-comment run inside its budget when running from the deployment. Verified that the
 * model returns all 50 labels with finish_reason "stop" rather than truncating.
 */
export const CATEGORIZE_BATCH_SIZE = 50;

function parseCategory(value: string): 'question' | 'feedback' | 'general' | null {
    const normalized = value.toLowerCase();
    if (normalized.includes('question')) return 'question';
    if (normalized.includes('feedback')) return 'feedback';
    if (normalized.includes('general')) return 'general';
    return null;
}

/**
 * Categorize many comments in a single AI request.
 *
 * Classifying one comment per request means a 5,000 comment video needs thousands of calls, which
 * exhausts the provider's per-minute rate limit long before the analysis finishes. Batching keeps
 * the request count proportional to CATEGORIZE_BATCH_SIZE instead of to the comment count.
 *
 * Always returns exactly `comments.length` categories: any comment the model skips or labels
 * unrecognizably falls back to the rule-based classifier, so callers can rely on index alignment.
 */
export async function categorizeCommentsBatch(
    comments: string[]
): Promise<Array<'question' | 'feedback' | 'general'>> {
    if (comments.length === 0) return [];
    if (!isConfigured()) return comments.map(fallbackCategorize);

    // Keep each comment on a single line so the numbered list stays parseable, and truncate so a
    // few very long comments cannot push the batch past the model's context window.
    const numbered = comments
        .map((text, i) => `${i + 1}. ${text.replace(/\s+/g, ' ').slice(0, 300)}`)
        .join('\n');

    try {
        const content = await runDeepSeekModel([
            {
                role: 'system',
                content: `You are a comment classifier. Categorize EACH numbered comment into exactly one of:
1. "question" (asks for info/help)
2. "feedback" (opinions, praise, criticism, suggestions)
3. "general" (random statements, observations)

Reply with one line per comment in the form "<number>: <category>", using the same numbers you were given. Output nothing else.`
            },
            {
                role: 'user',
                content: numbered
            }
        ], 60000);

        // Map "<number>: <category>" lines back onto their original index. The model occasionally
        // reorders or omits lines, so match on the number rather than on line position.
        const parsed = new Map<number, 'question' | 'feedback' | 'general'>();
        for (const line of (content || '').split('\n')) {
            const match = line.match(/^\s*(\d+)\s*[:.)-]\s*(.+)$/);
            if (!match) continue;
            const category = parseCategory(match[2]);
            if (category) parsed.set(Number(match[1]), category);
        }

        return comments.map((text, i) => parsed.get(i + 1) ?? fallbackCategorize(text));
    } catch (error) {
        // Rate limit or transport failure: rule-based results beat losing the batch entirely.
        return comments.map(fallbackCategorize);
    }
}

/**
 * Fallback categorization using simple rules
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

/**
 * Batch categorize comments with AI
 */
export async function batchCategorizeComments(
    comments: string[],
    batchSize: number = 5,
    delayMs: number = 1000
): Promise<Array<'question' | 'feedback' | 'general'>> {
    const results: Array<'question' | 'feedback' | 'general'> = [];

    for (let i = 0; i < comments.length; i += batchSize) {
        const batch = comments.slice(i, i + batchSize);
        // Run in parallel for the batch
        const batchResults = await Promise.all(
            batch.map(comment => categorizeCommentWithAI(comment))
        );
        results.push(...batchResults);

        // Add small delay between batches
        if (i + batchSize < comments.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    return results;
}

/**
 * Generate a comprehensive summary of all comments
 */
export async function summarizeComments(comments: string[]): Promise<string> {
    if (comments.length === 0) {
        return 'No comments to summarize';
    }

    // Combine comments into a single text (limit to avoid token limits)
    const combinedText = comments
        .slice(0, 50) // Take first 50 comments
        .join('\n\n')
        .slice(0, 3000); // Limit to 3000 characters

    return await summarizeText(combinedText);
}

/**
 * Generate category-specific summaries
 */
export async function generateCategorySummaries(
    questions: string[],
    feedback: string[],
    general: string[]
): Promise<{
    questionsSummary: string;
    feedbackSummary: string;
    generalSummary: string;
    [key: string]: string;
}> {
    const summarizeCategory = async (items: string[], emptyMessage: string) => {
        if (items.length === 0) return emptyMessage;
        return summarizeText(items.slice(0, 20).join('\n\n'));
    };

    // Three concurrent requests. These ran sequentially while categorization issued one request
    // per comment and the rate limiter was easy to trip; batching dropped a whole run to a couple
    // of dozen requests, so three at once is no longer a risk. Sequentially they took ~27s
    // locally and longer from the deployment, which was enough to blow the caller's budget and
    // lose all three summaries; concurrently they cost about as much as the slowest one.
    const [questionsSummary, feedbackSummary, generalSummary] = await Promise.all([
        summarizeCategory(questions, 'No questions found'),
        summarizeCategory(feedback, 'No feedback found'),
        summarizeCategory(general, 'No general comments found'),
    ]);

    return {
        questionsSummary,
        feedbackSummary,
        generalSummary,
    };
}
