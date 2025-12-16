'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
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
}

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
    const eventSourceRef = useRef<EventSource | null>(null);
    const [activeFilter, setActiveFilter] = useState<'all' | 'question' | 'feedback' | 'general'>('all');

    useEffect(() => {
        // Redirect to home if not authenticated
        if (status === 'unauthenticated') {
            router.push('/');
            return;
        }

        if (!url || status === 'loading') return;

        const fetchData = async () => {
            try {
                setLoading(true);
                setFetchProgress(0);

                // Use EventSource for streaming progress
                const eventSource = new EventSource(`/api/analyze-stream?url=${encodeURIComponent(url)}&useAI=${useAI}`);
                eventSourceRef.current = eventSource;

                eventSource.onmessage = (event) => {
                    const progress = JSON.parse(event.data);

                    if (progress.type === 'progress') {
                        setFetchProgress(progress.fetched);
                        if (progress.total) {
                            setTotalComments(progress.total);
                        }
                        if (progress.status) {
                            setFetchStatus(progress.status);
                        }
                    } else if (progress.type === 'status') {
                        if (progress.status) {
                            setFetchStatus(progress.status);
                        }
                    } else if (progress.type === 'ai-processing') {
                        setAiProcessing(true);
                        setAiMessage(progress.message);
                        if (progress.status) {
                            setFetchStatus(progress.status);
                        }
                    } else if (progress.type === 'ai-progress') {
                        setAiProgress(progress.progress);
                        setAiMessage(progress.message);
                    } else if (progress.type === 'complete') {
                        setData(progress);
                        setLoading(false);
                        setAiProcessing(false);
                        eventSource.close();
                        eventSourceRef.current = null;
                    } else if (progress.type === 'error') {
                        setError(progress.error || 'Failed to fetch comments');
                        setLoading(false);
                        setAiProcessing(false);
                        eventSource.close();
                        eventSourceRef.current = null;
                    }
                };

                eventSource.onerror = () => {
                    setError('Connection error. Please try again.');
                    setLoading(false);
                    eventSource.close();
                    eventSourceRef.current = null;
                };

            } catch (err) {
                setError('Failed to fetch comments. Please check the URL and try again.');
                console.error(err);
                setLoading(false);
            }
        };

        fetchData();

        // Cleanup function to close EventSource on unmount
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        };
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
        // Close the EventSource connection
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        // Navigate back to home
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
                            {aiProcessing ? (
                                <div className="flex items-baseline justify-center gap-2 text-4xl font-bold tracking-tight text-foreground/80">
                                    <span>{aiProgress > 0 ? Math.floor((aiProgress / 100) * totalComments).toLocaleString() : '...'}</span>
                                    <span className="text-2xl text-muted-foreground font-normal">/ {totalComments > 0 ? totalComments.toLocaleString() : '...'}</span>
                                </div>
                            ) : (
                                <div className="flex items-baseline justify-center gap-2 text-4xl font-bold tracking-tight text-foreground/80">
                                    <span>{fetchProgress.toLocaleString()}</span>
                                    <span className="text-2xl text-muted-foreground font-normal">/ {totalComments > 0 ? totalComments.toLocaleString() : '...'}</span>
                                </div>
                            )}
                        </div>

                        {/* Percentage with Status */}
                        <p className="text-sm text-muted-foreground">
                            {currentProgress.toFixed(1)}% | {fetchStatus}
                        </p>
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
                        className="hidden md:flex items-center gap-2"
                        variant="outline"
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
                className="md:hidden fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all hover:scale-110 active:scale-95"
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
