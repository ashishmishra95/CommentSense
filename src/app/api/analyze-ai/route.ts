import { NextResponse } from 'next/server';
import { fetchComments, extractVideoId } from '@/lib/youtube';
import { categorizeCommentWithAI, summarizeComments, generateCategorySummaries } from '@/lib/bytez-ai';

export const maxDuration = 60; // Allow up to 60 seconds for AI processing

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

    try {
        // Fetch all comments
        const comments = await fetchComments(videoId, 0);

        let categorizedComments;
        let overallSummary = '';
        let categorySummaries = {
            questionsSummary: '',
            feedbackSummary: '',
            generalSummary: '',
        };

        if (useAI && comments.length > 0) {
            // Use AI for categorization
            console.log('Using AI for comment categorization...');

            // Categorize comments with AI (process in batches to avoid rate limits)
            const categories = await Promise.all(
                comments.map(async (comment) => {
                    try {
                        return await categorizeCommentWithAI(comment.textOriginal);
                    } catch (error) {
                        console.error('Error categorizing comment:', error);
                        return 'general' as const;
                    }
                })
            );

            categorizedComments = comments.map((comment, index) => ({
                ...comment,
                category: categories[index],
            }));

            // Generate summaries
            const allCommentTexts = comments.map(c => c.textOriginal);
            const questionTexts = categorizedComments
                .filter(c => c.category === 'question')
                .map(c => c.textOriginal);
            const feedbackTexts = categorizedComments
                .filter(c => c.category === 'feedback')
                .map(c => c.textOriginal);
            const generalTexts = categorizedComments
                .filter(c => c.category === 'general')
                .map(c => c.textOriginal);

            // Generate overall summary
            overallSummary = await summarizeComments(allCommentTexts);

            // Generate category-specific summaries
            categorySummaries = await generateCategorySummaries(
                questionTexts,
                feedbackTexts,
                generalTexts
            );
        } else {
            // Use rule-based categorization (fallback)
            const { categorizeComments } = await import('@/lib/classifier');
            categorizedComments = categorizeComments(comments);
        }

        const stats = {
            total: categorizedComments.length,
            questions: categorizedComments.filter(c => c.category === 'question').length,
            feedback: categorizedComments.filter(c => c.category === 'feedback').length,
            general: categorizedComments.filter(c => c.category === 'general').length,
        };

        return NextResponse.json({
            videoId,
            stats,
            comments: categorizedComments,
            summaries: useAI ? {
                overall: overallSummary,
                ...categorySummaries,
            } : undefined,
        });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({
            error: 'Failed to analyze comments',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
