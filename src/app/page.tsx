'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, ArrowRight, Loader2, BarChart3, MessageCircle, Lightbulb, Download } from 'lucide-react';

// Example video for quick testing
const EXAMPLE_VIDEO_URL = 'https://youtu.be/HNJmWKndUA4?list=PLkmvmF0zhgT_8FirlLcTQI01ayjYB-46_';

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { data: session, status } = useSession();

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);

    // Check if user is authenticated
    if (!session) {
      // Store the URL in sessionStorage to retrieve after auth
      sessionStorage.setItem('pendingAnalysisUrl', url);

      // Trigger Google OAuth sign-in
      await signIn('google', {
        callbackUrl: `/dashboard?url=${encodeURIComponent(url)}`,
      });
    } else {
      // User is already authenticated, proceed to dashboard
      router.push(`/dashboard?url=${encodeURIComponent(url)}`);
    }
  };

  const handleTryExample = () => {
    setUrl(EXAMPLE_VIDEO_URL);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-8 py-12">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <img src="/Logo.png" alt="CommentSense Logo" className="w-24 h-auto" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            CommentSense
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Turn messy YouTube comments into actionable insights in seconds.
          </p>
        </div>

        <Card className="border-slate-200 dark:border-slate-800 shadow-lg">
          <CardHeader>
            <CardTitle>Analyze Video</CardTitle>
            <CardDescription>
              Paste a YouTube video URL to get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAnalyze} className="space-y-4">
              <div className="space-y-2">
                <Input
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="h-12"
                />
                <button
                  type="button"
                  onClick={handleTryExample}
                  className="text-sm text-primary hover:underline"
                >
                  Try with an example video
                </button>
              </div>
              <Button
                type="submit"
                className="w-full h-12 text-lg"
                disabled={loading || !url}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    Start Analysis
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
              <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                We'll fetch comments, analyze them with AI, and show you a dashboard.<br />
                No changes are made to your YouTube video.
              </p>
            </form>
          </CardContent>
        </Card>

        {/* What You'll Get Preview */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4 text-center">
            What you'll get
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-full">
                <BarChart3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Total Comments</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-full">
                <MessageCircle className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Questions</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-full">
                <Lightbulb className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Feedback</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-full">
                <Download className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Export Excel</p>
            </div>
          </div>
          <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-4">
            AI-powered insights · Full comment list · Sortable & filterable
          </p>
        </div>

        <div className="text-center text-sm text-slate-500 dark:text-slate-500">
          <p>Extract Questions • Identify Feedback • Save Time</p>
        </div>
      </div>
    </main>
  );
}
