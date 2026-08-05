'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import axios from 'axios';
import { Loader2, Download, ArrowLeft, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { CommentList } from '@/components/dashboard/CommentList';
import { InsightsSection } from '@/components/dashboard/InsightsSection';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Summaries {
    overall?: string;
    questionsSummary?: string;
    feedbackSummary?: string;
    generalSummary?: string;
}

interface DashboardData {
    videoId: string;
    stats: {
        total: number;
        questions: number;
        feedback: number;
        general: number;
    };
    comments: any[];
    summaries?: Summaries;
    /** True when the video has more comments than a single run analyzes. */
    sampled?: boolean;
    /** YouTube's own comment count, which includes replies. */
    availableTotal?: number;
    /** False when categories came from the rule-based classifier rather than the model. */
    usedAI?: boolean;
}

/**
 * Safety ceiling on comments fetched, not a target.
 *
 * Every comment is fetched and classified; this exists only so a pathological video cannot run
 * indefinitely. Fetching is ~1500 comments/sec and classification ~82/sec, so this bounds a run at
 * roughly 40 minutes.
 */
const FETCH_LIMIT = 200000;

/** Comments sent per categorize request. Must match the route's CHUNK_SIZE (one model call). */
const CATEGORIZE_CHUNK = 50;

/**
 * Categorize requests kept in flight.
 *
 * Throughput measured against the provider: 8 concurrent gave ~43 comments/sec, 24 gave ~82, and
 * 32 started returning 429s with stragglers dragging wall-clock back down. 16 sits inside the
 * useful range with headroom, since each request is one model call.
 */
const CATEGORIZE_CONCURRENCY = 16;

export default function DashboardPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
            <DashboardContent />
        </Suspense>
    );
}

function DashboardContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const url = searchParams.get('url');
    const { data: session, status } = useSession();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');
    const [fetchProgress, setFetchProgress] = useState(0);
    const [totalComments, setTotalComments] = useState(0);
    const [fetchStatus, setFetchStatus] = useState('Fetching comments');
    const [useAI, setUseAI] = useState(true); // Enable AI by default
    const [aiProcessing, setAiProcessing] = useState(false);
    const [aiProgress, setAiProgress] = useState(0);
    const [aiMessage, setAiMessage] = useState('');
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [activeFilter, setActiveFilter] = useState<'all' | 'question' | 'feedback' | 'general'>('all');

    // Some networks buffer streaming responses, holding every progress event until the request
    // finishes. When that happens the counters legitimately have nothing to show, and a frozen
    // "0 / ..." reads as a hang. Elapsed time proves the request is still alive.
    useEffect(() => {
        if (!loading) return;
        setElapsedSeconds(0);
        const started = Date.now();
        const timer = setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - started) / 1000));
        }, 1000);
        return () => clearInterval(timer);
    }, [loading]);

    useEffect(() => {
        // Redirect to home if not authenticated
        if (status === 'unauthenticated') {
            router.push('/');
            return;
        }

        if (!url || status === 'loading') return;

        // Abandoned when the user navigates away mid-run, so a cancelled analysis stops issuing
        // requests instead of running to completion in the background.
        const abort = new AbortController();

        const fetchData = async () => {
            try {
                setLoading(true);
                setFetchProgress(0);
                setTotalComments(0);
                setAiProcessing(false);
                setAiProgress(0);

                // 1. Fetch comments one page at a time.
                //
                // The counter updates after every page because each page is its own request. The
                // streaming endpoint reported the same numbers, but a network that buffers
                // responses holds them all until the request ends, so the count sat at zero for
                // the entire run. Short requests cannot be buffered into uselessness.
                const collected: any[] = [];
                let pageToken: string | undefined = undefined;
                let availableTotal = 0;

                setFetchStatus('Fetching comments');

                do {
                    const params = new URLSearchParams({ url });
                    if (pageToken) params.set('pageToken', pageToken);
                    if (collected.length === 0) params.set('includeTotal', 'true');

                    const res = await fetch(`/api/comments?${params}`, { signal: abort.signal });
                    if (!res.ok) {
                        const body = await res.json().catch(() => ({}));
                        throw new Error(body.error || 'Failed to fetch comments');
                    }

                    const page = await res.json();
                    collected.push(...page.comments);

                    if (page.availableTotal) {
                        // The video's own comment count, shown as-is. It counts replies while this
                        // fetches top-level threads, so the run finishes below it -- the loading
                        // screen says so rather than pretending the target was the cap.
                        availableTotal = page.availableTotal;
                        setTotalComments(availableTotal);
                    }
                    setFetchProgress(collected.length);

                    pageToken = page.nextPageToken ?? undefined;
                } while (pageToken && collected.length < FETCH_LIMIT);

                const comments = collected.slice(0, FETCH_LIMIT);
                // Categorization works through what was actually fetched, so the counter switches
                // to that as its target for the next phase.
                setTotalComments(comments.length);
                setFetchProgress(0);

                // 2. Categorize in chunks, reporting progress across them.
                setAiProcessing(true);
                setFetchStatus('Categorizing comments');

                // Every comment goes through the model. Results are written back by index rather
                // than appended, because chunks finish out of order when run concurrently.
                const categories: Array<'question' | 'feedback' | 'general'> = new Array(comments.length);
                let usedAI = false;
                let done = 0;
                // Once a chunk comes back without AI, stop asking for it on the rest. Otherwise an
                // unresponsive provider costs its timeout on every remaining chunk.
                let aiStillWorking = useAI;

                const chunkStarts: number[] = [];
                for (let i = 0; i < comments.length; i += CATEGORIZE_CHUNK) chunkStarts.push(i);

                const runChunk = async (start: number) => {
                    const chunk = comments.slice(start, start + CATEGORIZE_CHUNK);
                    const res = await fetch('/api/categorize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            texts: chunk.map(c => c.textOriginal),
                            useAI: aiStillWorking,
                        }),
                        signal: abort.signal,
                    });
                    if (!res.ok) throw new Error('Failed to categorize comments');

                    const result = await res.json();
                    result.categories.forEach((category: any, offset: number) => {
                        categories[start + offset] = category;
                    });

                    if (result.usedAI) {
                        usedAI = true;
                    } else if (aiStillWorking) {
                        console.warn('AI categorization unavailable; continuing with rule-based');
                        aiStillWorking = false;
                    }

                    done += chunk.length;
                    setAiProgress(Math.round((done / comments.length) * 100));
                    setFetchProgress(done);
                    setAiMessage(
                        `Categorizing ${done.toLocaleString()}/${comments.length.toLocaleString()} comments`
                    );
                };

                // Fixed pool of workers pulling from a shared queue, so a slow chunk holds up only
                // itself rather than a whole batch of them.
                let nextChunk = 0;
                await Promise.all(
                    Array.from({ length: Math.min(CATEGORIZE_CONCURRENCY, chunkStarts.length) }, async () => {
                        while (nextChunk < chunkStarts.length) {
                            const index = nextChunk++;
                            await runChunk(chunkStarts[index]);
                        }
                    })
                );

                const categorizedComments = comments.map((comment, i) => ({
                    ...comment,
                    category: categories[i] ?? 'general',
                }));

                const stats = {
                    total: categorizedComments.length,
                    questions: categorizedComments.filter(c => c.category === 'question').length,
                    feedback: categorizedComments.filter(c => c.category === 'feedback').length,
                    general: categorizedComments.filter(c => c.category === 'general').length,
                };

                // 3. Summarize. Failure here still leaves categorized comments worth showing.
                setFetchStatus('Generating summaries');
                setAiMessage('Generating AI summaries...');

                let summaries = undefined;
                if (useAI && !usedAI) {
                    // Categorization already proved the model is not answering. Skip the request
                    // and say so, rather than spending another timeout to reach the same place.
                    const unavailable = 'Summary unavailable (AI service not responding)';
                    summaries = {
                        questionsSummary: unavailable,
                        feedbackSummary: unavailable,
                        generalSummary: unavailable,
                    };
                } else if (useAI) {
                    const byCategory = (category: string) => categorizedComments
                        .filter(c => c.category === category)
                        .map(c => c.textOriginal);

                    try {
                        const res = await fetch('/api/summarize', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                questions: byCategory('question'),
                                feedback: byCategory('feedback'),
                                general: byCategory('general'),
                            }),
                            signal: abort.signal,
                        });
                        if (res.ok) summaries = (await res.json()).summaries;
                    } catch (err) {
                        if (abort.signal.aborted) return;
                        console.error('Summary request failed:', err);
                    }
                }

                setData({
                    videoId: comments[0]?.id ? url : url,
                    stats,
                    comments: categorizedComments,
                    summaries,
                    sampled: availableTotal > comments.length,
                    availableTotal,
                    usedAI,
                });
                setLoading(false);
                setAiProcessing(false);
            } catch (err) {
                // Navigating away aborts in-flight requests; that is not an error worth showing.
                if (abort.signal.aborted) return;

                console.error(err);
                setError(err instanceof Error ? err.message : 'Failed to fetch comments. Please check the URL and try again.');
                setLoading(false);
                setAiProcessing(false);
            }
        };

        fetchData();

        return () => abort.abort();
    }, [url, status, router, useAI]);

    const handleExport = () => {
        if (!data) return;

        try {
            setExporting(true);
            const wb = XLSX.utils.book_new();

            // Helper to format comments for Excel
            const formatComments = (comments: any[]) => {
                return comments.map(c => ({
                    Author: c.authorDisplayName,
                    Comment: c.textDisplay,
                    Date: new Date(c.publishedAt).toLocaleDateString(),
                    Likes: c.likeCount,
                    Category: c.category
                }));
            };

            // 1. Questions Sheet
            const questions = data.comments.filter(c => c.category === 'question');
            const wsQuestions = XLSX.utils.json_to_sheet(formatComments(questions));
            XLSX.utils.book_append_sheet(wb, wsQuestions, "Questions");

            // 2. Feedback Sheet
            const feedback = data.comments.filter(c => c.category === 'feedback');
            const wsFeedback = XLSX.utils.json_to_sheet(formatComments(feedback));
            XLSX.utils.book_append_sheet(wb, wsFeedback, "Feedback");

            // 3. General Sheet
            const general = data.comments.filter(c => c.category === 'general');
            const wsGeneral = XLSX.utils.json_to_sheet(formatComments(general));
            XLSX.utils.book_append_sheet(wb, wsGeneral, "General");

            // 4. All Comments Sheet (Optional, but good for reference)
            const wsAll = XLSX.utils.json_to_sheet(formatComments(data.comments));
            XLSX.utils.book_append_sheet(wb, wsAll, "All Comments");

            // Generate file
            XLSX.writeFile(wb, `commentsense-${data.videoId}.xlsx`);

            toast.success("Export successful!", {
                description: "Your Excel file has been downloaded."
            });
        } catch (err) {
            console.error("Export failed:", err);
            toast.error("Export failed", {
                description: "Something went wrong while generating the Excel file."
            });
        } finally {
            setExporting(false);
        }
    };

    const handleCancel = () => {
        // Navigating away unmounts this component, and the effect cleanup aborts every in-flight
        // request, so there is nothing to tear down here.
        router.push('/');
    };

    const handleFilterChange = (filter: 'all' | 'question' | 'feedback' | 'general') => {
        setActiveFilter(filter);
    };

    if (!url) {
        return <div className="p-8 text-center">No URL provided</div>;
    }

    if (loading) {
        const progressPercentage = totalComments > 0
            ? Math.min((fetchProgress / totalComments) * 100, 100)
            : 0;

        // Use AI progress if AI is processing, otherwise fetch progress
        const currentProgress = aiProcessing ? aiProgress : progressPercentage;
        const currentMessage = aiProcessing ? aiMessage : fetchStatus;

        // Whether any real progress has reached us yet. Networks that buffer streaming responses
        // deliver nothing until the request completes, so this stays false for the whole run.
        const hasProgress = fetchProgress > 0 || totalComments > 0 || aiProgress > 0;

        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background">
                <div className="flex flex-col items-center space-y-8 max-w-md w-full px-4">
                    {/* Spinner */}
                    <div className="relative">
                        <Loader2 className="h-16 w-16 animate-spin text-primary" strokeWidth={1.5} />
                    </div>

                    {/* Text Content */}
                    <div className="text-center space-y-2">
                        <h3 className="text-xl font-semibold tracking-tight">
                            {aiProcessing ? 'AI is categorizing your comments' : currentMessage}
                        </h3>

                        {/* Counter Display */}
                        <div className="flex flex-col items-center justify-center gap-1">
                            {!hasProgress ? (
                                // No progress event has arrived yet. Showing "0 / ..." at "0.0%"
                                // here makes a healthy request look stalled, so show elapsed time.
                                <div className="text-2xl font-semibold tracking-tight text-foreground/70">
                                    {elapsedSeconds}s elapsed
                                </div>
                            ) : (
                                // Both phases report a real count against a real target, so the
                                // display is the same for each. Deriving the number from a rounded
                                // percentage, as this used to, made it drift from the true count.
                                <div className="flex items-baseline justify-center gap-2 text-4xl font-bold tracking-tight text-foreground/80">
                                    <span>{fetchProgress.toLocaleString()}</span>
                                    <span className="text-2xl text-muted-foreground font-normal">/ {totalComments > 0 ? totalComments.toLocaleString() : '...'}</span>
                                </div>
                            )}
                        </div>

                        {/* Percentage with Status */}
                        <p className="text-sm text-muted-foreground">
                            {hasProgress
                                ? `${currentProgress.toFixed(1)}% | ${fetchStatus}`
                                : 'This can take a minute on large videos'}
                        </p>

                        {/* The fetch total comes from YouTube and counts replies, while this
                            fetches top-level comments only -- so the run ends below the target.
                            Saying that up front stops it reading as an incomplete run. */}
                        {!aiProcessing && hasProgress && (
                            <p className="text-xs text-muted-foreground/70 pt-1">
                                Total includes replies; this analyzes top-level comments
                            </p>
                        )}
                    </div>

                    {/* Progress Bar */}
                    <div className="w-64 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 to-blue-500 transition-all duration-300 ease-out"
                            style={{ width: `${currentProgress}%` }}
                        />
                    </div>

                    {/* Cancel Button */}
                    <Button
                        variant="outline"
                        onClick={handleCancel}
                        className="mt-4"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Cancel & Go Back
                    </Button>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
                <p className="text-red-500 font-medium">{error}</p>
                <Link href="/">
                    <Button variant="outline">Try Again</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-4 md:py-8 px-4 space-y-4 md:space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 md:space-x-4">
                    <Link href="/">
                        <Button variant="ghost" size="icon" className="h-8 w-8 md:h-10 md:w-10">
                            <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
                        </Button>
                    </Link>
                    <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
                </div>
                <div className="flex items-center space-x-4">
                    {/* Desktop Export Button */}
                    <Button
                        onClick={handleExport}
                        disabled={exporting}
                        className="hidden md:flex items-center gap-2 bg-black text-white hover:bg-black/90"
                    >
                        {exporting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4" />
                        )}
                        Export Excel
                    </Button>

                    {/* Profile - Always on the right */}
                    {session?.user && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="relative h-10 w-10 md:h-12 md:w-12 rounded-full p-0 hover:bg-transparent">
                                    <div className="relative h-9 w-9 md:h-11 md:w-11 rounded-full p-[2px] bg-gradient-to-br from-red-500 via-yellow-500 via-green-500 to-blue-500">
                                        <Avatar className="h-full w-full border-2 border-background">
                                            <AvatarImage
                                                src={session.user.image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${session.user.email}`}
                                                alt={session.user.name || "User"}
                                            />
                                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold">
                                                {session.user.name?.charAt(0).toUpperCase() || session.user.email?.charAt(0).toUpperCase() || 'U'}
                                            </AvatarFallback>
                                        </Avatar>
                                    </div>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56" align="end" forceMount>
                                <DropdownMenuLabel className="font-normal">
                                    <div className="flex flex-col space-y-1">
                                        <p className="text-sm font-medium leading-none">{session.user.name || 'User'}</p>
                                        <p className="text-xs leading-none text-muted-foreground">
                                            {session.user.email}
                                        </p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })} className="cursor-pointer">
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>Log out</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>

            {/* Mobile Floating Action Button for Export - Only visible on mobile */}
            <button
                onClick={handleExport}
                disabled={exporting}
                className="md:hidden fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-black text-white shadow-lg hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                aria-label="Export Excel"
            >
                {exporting ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                    <Download className="h-6 w-6" />
                )}
            </button>

            {data && (
                <>
                    <StatsCards stats={data.stats} />
                    <InsightsSection summaries={data.summaries} />
                    <CommentList comments={data.comments} externalFilter={activeFilter} />
                </>
            )}
        </div>
    );
}
