// Diagnostic route: emits one chunk per second for 10 seconds.
//
// Used to tell apart "our stream is written wrong" from "this deployment buffers all responses".
// Compare time_starttransfer against time_total: a value near 0 means chunks are flushed as they
// are produced, while a value equal to time_total means the whole body was held until the end.
//
//   curl -sN -o /dev/null -w "start=%{time_starttransfer}s total=%{time_total}s\n" \
//     https://<host>/api/stream-test
//
// Safe to delete once streaming behaviour is settled.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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
