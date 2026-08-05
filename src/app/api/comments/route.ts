import { NextResponse } from 'next/server';
import { fetchCommentsPage, fetchVideoCommentCount, extractVideoId } from '@/lib/youtube';

// One page per request, so the client can count as it goes.
//
// The streaming endpoint reports the same progress, but progress events only help if they arrive
// while the work is happening. Networks that buffer responses hold the entire body until the
// request completes, so every event lands at once at the end. Short requests avoid that entirely.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * YouTube pages fetched per request.
 *
 * Paging is strictly sequential -- each page needs the previous page's token -- so the only way to
 * speed fetching up is to remove round trips, not to parallelize. Walking several pages inside one
 * request trades counter granularity for throughput: the server reaches YouTube faster than the
 * browser reaches the server and back.
 */
const PAGES_PER_REQUEST = 5;

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
        const totalPromise = includeTotal
            ? fetchVideoCommentCount(videoId)
            : Promise.resolve(undefined);

        const comments = [];
        let token = pageToken;
        let exhausted = false;

        for (let i = 0; i < PAGES_PER_REQUEST; i++) {
            const page = await fetchCommentsPage(videoId, token);
            comments.push(...page.comments);
            token = page.nextPageToken;
            if (!token) {
                exhausted = true;
                break;
            }
        }

        return NextResponse.json({
            videoId,
            comments,
            nextPageToken: exhausted ? null : token ?? null,
            // YouTube counts replies here while we fetch top-level threads only, so this is an
            // upper bound on what the client will actually receive, not a target to hit.
            availableTotal: await totalPromise,
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
