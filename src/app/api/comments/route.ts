import { NextResponse } from 'next/server';
import { fetchCommentsPage, fetchVideoCommentCount, extractVideoId } from '@/lib/youtube';

// One page per request, so the client can count as it goes.
//
// The streaming endpoint reports the same progress, but progress events only help if they arrive
// while the work is happening. Networks that buffer responses hold the entire body until the
// request completes, so every event lands at once at the end. Short requests avoid that entirely.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const videoUrl = searchParams.get('url');
    const pageToken = searchParams.get('pageToken') || undefined;
    // Only needed on the first request; skipped afterwards to keep later pages fast.
    const includeTotal = searchParams.get('includeTotal') === 'true';

    if (!videoUrl) {
        return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
    }

    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
        return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    try {
        const [page, availableTotal] = await Promise.all([
            fetchCommentsPage(videoId, pageToken),
            includeTotal ? fetchVideoCommentCount(videoId) : Promise.resolve(undefined),
        ]);

        return NextResponse.json({
            videoId,
            comments: page.comments,
            nextPageToken: page.nextPageToken ?? null,
            // YouTube counts replies here while we fetch top-level threads only, so this is an
            // upper bound on what the client will actually receive, not a target to hit.
            availableTotal,
        }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch comments' },
            { status: 502 }
        );
    }
}
