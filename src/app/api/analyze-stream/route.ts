import { NextResponse } from 'next/server';
import { fetchCommentsWithProgress, extractVideoId } from '@/lib/youtube';
import { categorizeComments } from '@/lib/classifier';
import { categorizeCommentWithAI, summarizeComments, generateCategorySummaries } from '@/lib/bytez-ai';

export const maxDuration = 300; // Allow up to 5 minutes for AI processing

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
        async start(controller) {
            try {
                let allComments: any[] = [];
                let totalComments = 0;

                // First, get the total comment count from video statistics
                try {
                    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
                    const videoResponse = await fetch(
                        `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${YOUTUBE_API_KEY}`
                    );
                    const videoData = await videoResponse.json();
                    if (videoData.items && videoData.items[0]) {
                        totalComments = parseInt(videoData.items[0].statistics.commentCount || '0');
                    }
                } catch (err) {
                    console.error('Error fetching video stats:', err);
                }

                // Fetch all available comments (no artificial limit)
                // YouTube API will naturally stop when no more comments are available
                const FETCH_LIMIT = 0; // 0 = unlimited, fetch all available comments

                // Fetch comments with progress updates
                await fetchCommentsWithProgress(videoId, FETCH_LIMIT, (progress) => {
                    const data = `data: ${JSON.stringify({
                        ...progress,
                        total: totalComments,
                        status: 'Fetching comments'
                    })}\n\n`;
                    controller.enqueue(encoder.encode(data));
                    allComments = progress.comments;
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

                if (useAI && allComments.length > 0) {
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

                    const result = await parallelCategorizeComments(
                        commentsToProcess.map(c => c.textOriginal),
                        {
                            batchSize: 10, // Reduced from 50 to ensure frequent updates
                            maxParallelBatches: 5, // Reduced from 10 to avoid rate limits (50 concurrent reqs)
                            initialDelayMs: 100,
                            maxRetries: 2,
                            onProgress: (progress, processed, total) => {
                                // Send progress update to client
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                    type: 'ai-progress',
                                    progress,
                                    message: `Categorizing: ${processed}/${total} comments (${progress}%)`
                                })}\n\n`));
                            }
                        }
                    );

                    // Map categories back to processed comments
                    const processedWithCategories = commentsToProcess.map((comment, index) => ({
                        ...comment,
                        category: result.categories[index],
                    }));

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

                    console.log(`Categorization stats:`, result.stats);
                    console.log(`Total time: ${(result.stats.totalTime / 1000).toFixed(2)}s`);
                    console.log(`Average per comment: ${result.stats.averageTimePerComment.toFixed(2)}ms`);

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

                    // Generate category-specific summaries
                    const categorySummaries = await generateCategorySummaries(
                        questionTexts,
                        feedbackTexts,
                        generalTexts
                    );

                    summaries = {
                        overall: undefined,
                        ...categorySummaries,
                    };
                } else {
                    // Use rule-based categorization (fallback)
                    categorizedComments = categorizeComments(allComments);
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
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
