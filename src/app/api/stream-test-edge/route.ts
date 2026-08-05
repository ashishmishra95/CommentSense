// Diagnostic route: identical to /api/stream-test but on the Edge runtime.
//
// The Node.js version buffers on Vercel (time_starttransfer equals time_total) while streaming
// correctly in local dev, so this isolates whether the runtime is what holds the response.
// Safe to delete once streaming behaviour is settled.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            void (async () => {
                for (let i = 1; i <= 10; i++) {
                    controller.enqueue(encoder.encode(`data: {"tick":${i}}\n\n`));
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                controller.close();
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
