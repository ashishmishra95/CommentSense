import { NextResponse } from 'next/server';
import { categorizeCommentsBatch, CATEGORIZE_BATCH_SIZE } from '@/lib/bytez-ai';
import { categorizeComment } from '@/lib/classifier';

// Categorize one chunk of comments per request, so the client can report real progress across
// chunks rather than waiting on a single opaque call.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Comments per AI request. Kept well inside maxDuration even when the provider is slow. */
export const CHUNK_SIZE = 200;

/**
 * Comments per rule-based request. Classification is pure CPU with no network call, so far more
 * fits in one request -- which matters because the bulk of a large video is categorized this way
 * and each round trip would otherwise be pure overhead.
 */
export const RULE_CHUNK_SIZE = 2000;

export async function POST(request: Request) {
    let body: { texts?: string[]; useAI?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const texts = body.texts;
    if (!Array.isArray(texts) || texts.length === 0) {
        return NextResponse.json({ error: 'texts must be a non-empty array' }, { status: 400 });
    }
    const limit = body.useAI === false ? RULE_CHUNK_SIZE : CHUNK_SIZE;
    if (texts.length > limit) {
        return NextResponse.json(
            { error: `texts exceeds the ${limit} per-request limit` },
            { status: 400 }
        );
    }

    // Rule-based results are returned as-is; they need no network round trip.
    const ruleBased = () => texts.map(categorizeComment);

    if (body.useAI === false) {
        return NextResponse.json({ categories: ruleBased(), usedAI: false });
    }

    try {
        // No health probe here on purpose. This route is called once per chunk, so probing would
        // add a round trip to every one of them. categorizeCommentsBatch already falls back
        // per-batch and reports whether the model answered, and the client stops asking for AI
        // once a chunk comes back without it -- so a dead provider costs one timeout, not one
        // per chunk.
        const batches: string[][] = [];
        for (let i = 0; i < texts.length; i += CATEGORIZE_BATCH_SIZE) {
            batches.push(texts.slice(i, i + CATEGORIZE_BATCH_SIZE));
        }

        const results = await Promise.all(batches.map(batch => categorizeCommentsBatch(batch)));

        return NextResponse.json({
            categories: results.flatMap(r => r.categories),
            usedAI: results.some(r => r.usedAI),
        });
    } catch (error) {
        console.error('Categorization failed, falling back to rules:', error);
        return NextResponse.json({ categories: ruleBased(), usedAI: false });
    }
}
