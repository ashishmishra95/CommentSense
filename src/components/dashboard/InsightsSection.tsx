import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Summaries {
    overall?: string;
    questionsSummary?: string;
    feedbackSummary?: string;
    generalSummary?: string;
}

interface InsightsSectionProps {
    summaries?: Summaries;
}

const SummaryContent = ({ text }: { text: string }) => {
    if (!text) return null;

    // Check if it's a quota exceeded message
    if (text.includes('quota exceeded') || text.includes('neurons')) {
        return (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md">
                <span className="text-amber-600 dark:text-amber-400 text-sm">
                    {text}
                </span>
            </div>
        );
    }

    // Function to parse bold text and clean artifacts
    const parseContent = (content: string) => {
        const parts = content.split(/(\*\*.*?\*\*|\*\*.*?\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith('**')) {
                const cleanText = part.replace(/^\*\*/, '').replace(/\*\*?$/, '');
                return <strong key={index} className="font-semibold text-slate-900 dark:text-slate-100">{cleanText}</strong>;
            }
            return part.replace(/\*/g, '');
        });
    };

    // Split by bullet markers and filter out empty or "intro" lines
    const items = text
        .split(/[*•-]\s+/)
        .map(item => item.trim())
        .filter(item => item.length > 0 && !item.toLowerCase().startsWith('here is a summary'));

    if (items.length > 0) {
        return (
            <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {items.map((item, i) => (
                    <li key={i} className="flex gap-2 items-start">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 opacity-70" />
                        <span>{parseContent(item)}</span>
                    </li>
                ))}
            </ul>
        );
    }

    return (
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {parseContent(text)}
        </p>
    );
};

export function InsightsSection({ summaries }: InsightsSectionProps) {
    if (!summaries) return null;

    const hasAnyInsights =
        (summaries.questionsSummary && summaries.questionsSummary !== 'No questions found') ||
        (summaries.feedbackSummary && summaries.feedbackSummary !== 'No feedback found') ||
        (summaries.generalSummary && summaries.generalSummary !== 'No general comments found');

    if (!hasAnyInsights) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Insights</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {summaries.questionsSummary && summaries.questionsSummary !== 'No questions found' && (
                        <div
                            className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800 h-full"
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-1.5 bg-blue-500 rounded">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <h4 className="font-semibold text-blue-900 dark:text-blue-100">Questions</h4>
                            </div>
                            <SummaryContent text={summaries.questionsSummary} />
                        </div>
                    )}

                    {summaries.feedbackSummary && summaries.feedbackSummary !== 'No feedback found' && (
                        <div
                            className="p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800 h-full"
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-1.5 bg-yellow-500 rounded">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                    </svg>
                                </div>
                                <h4 className="font-semibold text-yellow-900 dark:text-yellow-100">Feedback</h4>
                            </div>
                            <SummaryContent text={summaries.feedbackSummary} />
                        </div>
                    )}

                    {summaries.generalSummary && summaries.generalSummary !== 'No general comments found' && (
                        <div
                            className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 h-full"
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-1.5 bg-slate-500 rounded">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                                    </svg>
                                </div>
                                <h4 className="font-semibold text-slate-900 dark:text-slate-100">General</h4>
                            </div>
                            <SummaryContent text={summaries.generalSummary} />
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
