import { NextResponse } from 'next/server';
import { fetchCommentsWithProgress, extractVideoId } from '@/lib/youtube';
import { categorizeComments } from '@/lib/classifier';
import { categorizeCommentWithAI, summarizeComments, generateCategorySummaries, CATEGORIZE_BATCH_SIZE, isAiResponsive } from '@/lib/bytez-ai';

export const maxDuration = 300; // Allow up to 5 minutes for AI processing
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const videoUrl = searchParams.get('url');
    const useAI = searchParams.get('useAI') === 'true';

    if (!videoUrl) {
        return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
    }

    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
        return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        // NOTE: start() must return synchronously. If it returns a promise, the platform waits
        // for that promise to settle before treating the stream as started -- which means the
        // whole analysis runs to completion before a single byte reaches the client, and the
        // progress counters never move. The work is kicked off without awaiting it here.
        start(controller) {
            void (async () => {
            try {
                // A comment line of filler, to satisfy proxies that hold a response until enough
                // bytes have accumulated. SSE ignores lines beginning with ':', so this is inert
                // to the client. Note this does not defeat a proxy that buffers the entire body
                // regardless of size -- see /api/stream-test for how to tell the two apart.
                controller.enqueue(encoder.encode(`:${' '.repeat(2048)}\n\n`));

                // Immediately send an initial ping to flush HTTP headers to the client
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'status',
                    status: 'Connecting to YouTube...'
                })}\n\n`));

                let allComments: any[] = [];
                let totalComments = 0;

                // First, get the total comment count from video statistics
                try {
                    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
                    const videoResponse = await fetch(
                        `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${YOUTUBE_API_KEY}`,
                        { signal: AbortSignal.timeout(5000) }
                    );
                    const videoData = await videoResponse.json();
                    if (videoData.items && videoData.items[0]) {
                        totalComments = parseInt(videoData.items[0].statistics.commentCount || '0');
                    }
                } catch (err) {
                    console.error('Error fetching video stats:', err);
                }

                // Cap how many comments a single run will fetch.
                // The YouTube API returns ~100 comments per request at roughly 300/sec, so an
                // unbounded fetch on a popular video runs past `maxDuration` and the function is
                // killed before it can emit a 'complete' event. Capping keeps every run well
                // inside the limit; videos with more comments are analyzed as a sample.
                const FETCH_LIMIT = 5000;

                // Progress is reported against the capped target, not the video's full comment
                // count, otherwise the bar sits at 0.0% for the entire run.
                const progressTarget = totalComments > 0
                    ? Math.min(totalComments, FETCH_LIMIT)
                    : FETCH_LIMIT;

                // Fetch comments with progress updates
                allComments = await fetchCommentsWithProgress(videoId, FETCH_LIMIT, (progress) => {
                    const data = `data: ${JSON.stringify({
                        type: progress.type,
                        fetched: Math.min(progress.fetched, progressTarget),
                        total: progressTarget,
                        status: 'Fetching comments'
                    })}\n\n`;
                    controller.enqueue(encoder.encode(data));
                });

                // Send filtering status
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'status',
                    status: 'Filtering spam comments'
                })}\n\n`));

                // Add a small delay so users can see the filtering message
                await new Promise(resolve => setTimeout(resolve, 1500));

                let categorizedComments;
                let summaries = undefined;

                // Probe the AI service before committing to the AI path. Without this, an
                // unresponsive provider costs the categorization budget plus the summary budget
                // -- minutes of spinner -- to reach the same rule-based answer we can produce now.
                let aiAvailable = false;
                if (useAI && allComments.length > 0) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        type: 'status',
                        status: 'Checking AI service'
                    })}\n\n`));

                    aiAvailable = await isAiResponsive();

                    if (!aiAvailable) {
                        console.warn('AI service unresponsive, using rule-based categorization');
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                            type: 'ai-processing',
                            message: 'AI service is not responding — categorizing without it...',
                            status: 'Categorizing comments'
                        })}\n\n`));
                    }
                }

                if (useAI && aiAvailable && allComments.length > 0) {
                    // Aggressive Speed Optimization Strategy
                    // Goal: < 10s for 100k comments, < 20s for 200k+

                    // Thresholds
                    const SPEED_THRESHOLD = 1000; // Start sampling if > 1k comments

                    let commentsToProcess = allComments;
                    let isSampled = false;
                    let sampleSize = 0;

                    if (allComments.length > SPEED_THRESHOLD) {
                        isSampled = true;

                        // Dynamic sample size based on total volume to balance speed vs representation
                        // For 100k comments, we want to stay under 10s total time
                        if (allComments.length > 200000) {
                            sampleSize = 3000; // Cap at 3k for massive videos (prev 5k)
                        } else if (allComments.length > 50000) {
                            sampleSize = 1500; // 1.5k is enough for representative stats (prev 3k)
                        } else {
                            sampleSize = 1000; // 1k is plenty for < 50k videos (prev 2k)
                        }

                        // Intelligent sampling strategy:
                        // 1. Top Liked (30%) - Most valuable signal
                        // 2. Most Recent (30%) - Current sentiment
                        // 3. Random (40%) - Representative spread

                        const topCount = Math.floor(sampleSize * 0.3);
                        const recentCount = Math.floor(sampleSize * 0.3);
                        const randomCount = sampleSize - topCount - recentCount;

                        // 1. Top Liked
                        const sortedByLikes = [...allComments].sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
                        const topLiked = sortedByLikes.slice(0, topCount);

                        // 2. Most Recent
                        const sortedByDate = [...allComments].sort((a, b) =>
                            new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
                        );
                        const mostRecent = sortedByDate.slice(0, recentCount);

                        // 3. Random from remaining
                        const idsToExclude = new Set([...topLiked, ...mostRecent].map(c => c.id));
                        const remainingPool = allComments.filter(c => !idsToExclude.has(c.id));
                        const randomSample = remainingPool
                            .sort(() => Math.random() - 0.5)
                            .slice(0, randomCount);

                        // Combine
                        commentsToProcess = [...topLiked, ...mostRecent, ...randomSample];

                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                            type: 'ai-processing',
                            message: `Speed Mode: Analyzing ${commentsToProcess.length.toLocaleString()} representative comments from ${allComments.length.toLocaleString()}...`,
                            status: 'Preparing categorization'
                        })}\n\n`));
                    }

                    // Send AI processing status
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        type: 'ai-processing',
                        message: isSampled
                            ? 'AI is categorizing sampled comments with parallel processing...'
                            : 'AI is categorizing comments with parallel processing...',
                        status: 'Categorizing comments'
                    })}\n\n`));

                    // Use parallel AI categorization for much faster processing
                    console.log('Using parallel AI categorization...');

                    const { parallelCategorizeComments } = await import('@/lib/parallelCategorizer');

                    // Hard budget for the AI phase. Every AI call is one request per comment, so if
                    // the provider is slow or rate limiting, categorization can outlast the
                    // function's own time limit -- which kills the request before any result is
                    // sent and leaves the client waiting forever. If the budget is blown we fall
                    // back to rule-based categorization, which always returns.
                    const AI_BUDGET_MS = 120000;
                    const budgetExpired = Symbol('ai-budget-expired');
                    let budgetTimer: ReturnType<typeof setTimeout> | undefined;

                    const result = await Promise.race([
                        parallelCategorizeComments(
                            commentsToProcess.map(c => c.textOriginal),
                            {
                                // Each batch is now a single AI request covering every comment in
                                // it, so these two numbers bound requests-in-flight at 5 rather
                                // than the 50 that used to trip the provider's rate limiter.
                                batchSize: CATEGORIZE_BATCH_SIZE,
                                maxParallelBatches: 5,
                                initialDelayMs: 100,
                                maxRetries: 1,
                                onProgress: (progress, processed, total) => {
                                    // Send progress update to client
                                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                        type: 'ai-progress',
                                        progress,
                                        message: `Categorizing: ${processed}/${total} comments (${progress}%)`
                                    })}\n\n`));
                                }
                            }
                        ),
                        new Promise<typeof budgetExpired>(resolve => {
                            budgetTimer = setTimeout(() => resolve(budgetExpired), AI_BUDGET_MS);
                        }),
                    ]).finally(() => {
                        if (budgetTimer) clearTimeout(budgetTimer);
                    });

                    let processedWithCategories;
                    // Set when the AI provider proved unusable for this request, so we can skip
                    // the summary calls instead of waiting out a second timeout against a service
                    // that has already failed.
                    let aiUnavailable = false;

                    if (result === budgetExpired) {
                        aiUnavailable = true;
                        console.warn(`AI categorization exceeded ${AI_BUDGET_MS}ms, using rule-based results`);
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                            type: 'ai-processing',
                            message: 'AI is taking too long — finishing with fast categorization...',
                            status: 'Categorizing comments'
                        })}\n\n`));

                        const { categorizeComments: ruleCategorize } = await import('@/lib/classifier');
                        processedWithCategories = ruleCategorize(commentsToProcess);
                    } else {
                        // Map categories back to processed comments
                        processedWithCategories = commentsToProcess.map((comment, index) => ({
                            ...comment,
                            category: result.categories[index],
                        }));

                        console.log(`Categorization stats:`, result.stats);
                    }

                    if (isSampled) {
                        // For sampled processing, use rule-based categorization for remaining comments
                        // This is much faster than AI and still reasonably accurate
                        const { categorizeComments } = await import('@/lib/classifier');

                        // Create a Set of processed comment IDs for quick lookup
                        const processedIds = new Set(processedWithCategories.map(c => c.id));

                        // Get unprocessed comments
                        const unprocessedComments = allComments.filter(c => !processedIds.has(c.id));

                        // Use fast rule-based categorization for remaining
                        const ruleCategorized = categorizeComments(unprocessedComments);

                        // Combine AI-categorized (sampled) with rule-categorized (remaining)
                        categorizedComments = [...processedWithCategories, ...ruleCategorized];

                        console.log(`Hybrid categorization: ${processedWithCategories.length} AI-categorized, ${ruleCategorized.length} rule-based`);
                    } else {
                        categorizedComments = processedWithCategories;
                    }

                    // Generate summaries
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        type: 'ai-processing',
                        message: 'Generating AI summaries...',
                        status: 'Generating summaries'
                    })}\n\n`));

                    const allCommentTexts = allComments.map(c => c.textOriginal);
                    const questionTexts = categorizedComments
                        .filter(c => c.category === 'question')
                        .map(c => c.textOriginal);
                    const feedbackTexts = categorizedComments
                        .filter(c => c.category === 'feedback')
                        .map(c => c.textOriginal);
                    const generalTexts = categorizedComments
                        .filter(c => c.category === 'general')
                        .map(c => c.textOriginal);

                    // Generate category-specific summaries, bounded so a stalled provider can
                    // never cost us the whole result -- the comments are already categorized at
                    // this point and are worth delivering even without summaries.
                    const SUMMARY_BUDGET_MS = 60000;
                    let summaryTimer: ReturnType<typeof setTimeout> | undefined;

                    const categorySummaries = aiUnavailable
                        ? null
                        : await Promise.race([
                            generateCategorySummaries(questionTexts, feedbackTexts, generalTexts),
                            new Promise<null>(resolve => {
                                summaryTimer = setTimeout(() => resolve(null), SUMMARY_BUDGET_MS);
                            }),
                        ]).finally(() => {
                            if (summaryTimer) clearTimeout(summaryTimer);
                        });

                    if (!categorySummaries) {
                        console.warn(
                            aiUnavailable
                                ? 'Skipping summaries: AI provider already failed during categorization'
                                : `Summary generation exceeded ${SUMMARY_BUDGET_MS}ms, skipping`
                        );
                    }

                    summaries = {
                        overall: undefined,
                        ...(categorySummaries ?? {
                            questionsSummary: 'Summary unavailable (AI service not responding)',
                            feedbackSummary: 'Summary unavailable (AI service not responding)',
                            generalSummary: 'Summary unavailable (AI service not responding)',
                        }),
                    };
                } else {
                    // Use rule-based categorization (fallback)
                    categorizedComments = categorizeComments(allComments);

                    // If AI was asked for but the service is down, say so. Leaving summaries
                    // undefined would hide the Insights panel entirely, which looks like the
                    // feature is missing rather than temporarily unavailable.
                    if (useAI && !aiAvailable && allComments.length > 0) {
                        const unavailable = 'Summary unavailable (AI service not responding)';
                        summaries = {
                            overall: undefined,
                            questionsSummary: unavailable,
                            feedbackSummary: unavailable,
                            generalSummary: unavailable,
                        };
                    }
                }

                const stats = {
                    total: categorizedComments.length,
                    questions: categorizedComments.filter(c => c.category === 'question').length,
                    feedback: categorizedComments.filter(c => c.category === 'feedback').length,
                    general: categorizedComments.filter(c => c.category === 'general').length,
                };

                // Send final result
                const finalData = `data: ${JSON.stringify({
                    type: 'complete',
                    videoId,
                    stats,
                    comments: categorizedComments,
                    summaries,
                    // Only true when we actually hit the cap. Comparing against the video's
                    // commentCount would misreport, since that figure counts replies while we
                    // fetch top-level threads only.
                    sampled: allComments.length >= FETCH_LIMIT,
                    availableTotal: totalComments,
                })}\n\n`;
                controller.enqueue(encoder.encode(finalData));
                controller.close();
            } catch (error) {
                console.error('API Error:', error);
                const errorData = `data: ${JSON.stringify({
                    type: 'error',
                    error: error instanceof Error ? error.message : 'Failed to analyze comments'
                })}\n\n`;
                controller.enqueue(encoder.encode(errorData));
                controller.close();
            }
            })();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
