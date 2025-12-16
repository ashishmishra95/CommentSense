// NVIDIA DeepSeek v3.1 AI Service
import OpenAI from 'openai';

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "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";
const MODEL_ID = "meta/llama-3.3-70b-instruct";

// Initialize OpenAI client with NVIDIA base URL
const openai = new OpenAI({
    apiKey: NVIDIA_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1',
});

/**
 * Check if API key is configured
 */
function isConfigured(): boolean {
    return NVIDIA_API_KEY !== '';
}

/**
 * Helper to make requests to NVIDIA DeepSeek API
 */
async function runDeepSeekModel(messages: { role: string; content: string }[]): Promise<string> {
    if (!isConfigured()) {
        throw new Error("NVIDIA API key not configured");
    }

    try {
        const completion = await openai.chat.completions.create({
            model: MODEL_ID,
            messages: messages as any,
            temperature: 0.2,
            top_p: 0.7,
            max_tokens: 1024,
            stream: false // Non-streaming for simplicity in categorization/summarization
        });

        return completion.choices[0]?.message?.content || '';
    } catch (error: any) {
        console.error("NVIDIA DeepSeek request failed:", error.message);
        throw error;
    }
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
    } catch (error) {
        console.error('Error summarizing with NVIDIA DeepSeek:', error);
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
    const [questionsSummary, feedbackSummary, generalSummary] = await Promise.all([
        questions.length > 0
            ? summarizeText(questions.slice(0, 20).join('\n\n'))
            : 'No questions found',
        feedback.length > 0
            ? summarizeText(feedback.slice(0, 20).join('\n\n'))
            : 'No feedback found',
        general.length > 0
            ? summarizeText(general.slice(0, 20).join('\n\n'))
            : 'No general comments found',
    ]);

    return {
        questionsSummary,
        feedbackSummary,
        generalSummary,
    };
}
