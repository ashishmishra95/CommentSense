import { NextResponse } from 'next/server';
import { generateCategorySummaries } from '@/lib/bytez-ai';

// Summaries as their own request, so the client can show that step separately from
// categorization instead of both hiding behind one long call.
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Comments per category actually sent to the model; more adds latency without adding signal. */
const PER_CATEGORY_LIMIT = 20;

export async function POST(request: Request) {
    let body: { questions?: string[]; feedback?: string[]; general?: string[] };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const trim = (items?: string[]) => (items ?? []).slice(0, PER_CATEGORY_LIMIT);

    try {
        const summaries = await generateCategorySummaries(
            trim(body.questions),
            trim(body.feedback),
            trim(body.general)
        );
        return NextResponse.json({ summaries });
    } catch (error) {
        console.error('Summary generation failed:', error);
        // The caller already has categorized comments worth showing, so degrade rather than fail.
        const unavailable = 'Summary unavailable (AI service not responding)';
        return NextResponse.json({
            summaries: {
                questionsSummary: unavailable,
                feedbackSummary: unavailable,
                generalSummary: unavailable,
            },
        });
    }
}
