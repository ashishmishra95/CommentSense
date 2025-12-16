import { NextResponse } from 'next/server';
import { fetchComments, extractVideoId } from '@/lib/youtube';
import { categorizeComments } from '@/lib/classifier';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const videoUrl = searchParams.get('url');

    if (!videoUrl) {
        return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
    }

    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
        return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    try {
        // Fetch all comments (0 = unlimited)
        const comments = await fetchComments(videoId, 0);
        const categorizedComments = categorizeComments(comments);

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
        });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Failed to analyze comments' }, { status: 500 });
    }
}
