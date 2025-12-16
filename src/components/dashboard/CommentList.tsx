import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, ThumbsUp } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Comment {
    id: string;
    textDisplay: string;
    authorDisplayName: string;
    publishedAt: string;
    likeCount?: number;
    category: 'question' | 'feedback' | 'general';
}

interface CommentListProps {
    comments: Comment[];
    externalFilter?: 'all' | 'question' | 'feedback' | 'general';
}

export function CommentList({ comments, externalFilter }: CommentListProps) {
    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [activeTab, setActiveTab] = useState(externalFilter || 'all');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'mostLiked'>('newest');

    // Sync external filter with internal tab state
    useEffect(() => {
        if (externalFilter) {
            setActiveTab(externalFilter);
            setCurrentPage(1);
        }
    }, [externalFilter]);

    // Filter comments by search
    const searchFilteredComments = comments.filter(c =>
        c.textDisplay.toLowerCase().includes(search.toLowerCase()) ||
        c.authorDisplayName.toLowerCase().includes(search.toLowerCase())
    );

    // Sort comments
    const sortedComments = [...searchFilteredComments].sort((a, b) => {
        switch (sortBy) {
            case 'newest':
                return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
            case 'oldest':
                return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
            case 'mostLiked':
                return (b.likeCount || 0) - (a.likeCount || 0);
            default:
                return 0;
        }
    });

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'question': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
            case 'feedback': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
            default: return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
        }
    };

    const CommentItem = ({ comment }: { comment: Comment }) => (
        <div className="p-4 border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors w-full max-w-full overflow-hidden">
            <div className="flex justify-between items-start mb-2 gap-2 w-full">
                <div className="font-semibold text-sm break-words min-w-0 flex-1">{comment.authorDisplayName}</div>
                <Badge variant="secondary" className={`shrink-0 ${getCategoryColor(comment.category)}`}>
                    {comment.category}
                </Badge>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words w-full max-w-full">{comment.textDisplay}</p>
            <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
                <span>{new Date(comment.publishedAt).toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                })}</span>
                {comment.likeCount !== undefined && comment.likeCount > 0 && (
                    <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" />
                        {comment.likeCount}
                    </span>
                )}
            </div>
        </div>
    );

    // Get comments for current tab
    const getTabComments = (tab: string) => {
        switch (tab) {
            case 'question':
                return sortedComments.filter(c => c.category === 'question');
            case 'feedback':
                return sortedComments.filter(c => c.category === 'feedback');
            case 'general':
                return sortedComments.filter(c => c.category === 'general');
            default:
                return sortedComments;
        }
    };

    const currentTabComments = getTabComments(activeTab);
    const totalPages = Math.ceil(currentTabComments.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedComments = currentTabComments.slice(startIndex, endIndex);

    // Reset to page 1 when changing tabs or search
    const handleTabChange = (value: string) => {
        setActiveTab(value as 'all' | 'question' | 'feedback' | 'general');
        setCurrentPage(1);
    };

    const handleSearchChange = (value: string) => {
        setSearch(value);
        setCurrentPage(1);
    };

    const handleItemsPerPageChange = (value: number) => {
        setItemsPerPage(value);
        setCurrentPage(1);
    };

    const handleSortChange = (value: 'newest' | 'oldest' | 'mostLiked') => {
        setSortBy(value);
        setCurrentPage(1);
    };

    const PaginationControls = () => {
        // Calculate which page numbers to show on mobile
        const getMobilePageNumbers = () => {
            const pages = [];
            if (totalPages <= 4) {
                // Show all pages if 4 or fewer
                for (let i = 1; i <= totalPages; i++) {
                    pages.push(i);
                }
            } else {
                // Always show first page
                pages.push(1);

                if (currentPage <= 2) {
                    // Near start: 1, 2, 3, ...
                    pages.push(2, 3, '...');
                } else if (currentPage >= totalPages - 1) {
                    // Near end: ..., n-2, n-1, n
                    pages.push('...', totalPages - 2, totalPages - 1);
                } else {
                    // Middle: 1, ..., current, ...
                    pages.push('...', currentPage, '...');
                }

                // Always show last page
                if (!pages.includes(totalPages)) {
                    pages.push(totalPages);
                }
            }
            return pages;
        };

        return (
            <div className="border-t bg-slate-50 dark:bg-slate-900/50">
                {/* Desktop pagination */}
                <div className="hidden sm:flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Show</span>
                        <select
                            value={itemsPerPage}
                            onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                            className="h-8 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                        <span className="text-sm text-muted-foreground">per page</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                            Showing {startIndex + 1} to {Math.min(endIndex, currentTabComments.length)} of {currentTabComments.length} comments
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Previous
                        </Button>

                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum;
                                if (totalPages <= 5) {
                                    pageNum = i + 1;
                                } else if (currentPage <= 3) {
                                    pageNum = i + 1;
                                } else if (currentPage >= totalPages - 2) {
                                    pageNum = totalPages - 4 + i;
                                } else {
                                    pageNum = currentPage - 2 + i;
                                }

                                return (
                                    <Button
                                        key={pageNum}
                                        variant={currentPage === pageNum ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setCurrentPage(pageNum)}
                                        className="w-8 h-8 p-0"
                                    >
                                        {pageNum}
                                    </Button>
                                );
                            })}
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                        >
                            Next
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>

                {/* Mobile pagination - Single row with ellipsis */}
                <div className="sm:hidden px-2 py-3">
                    <div className="flex items-center justify-center gap-1">
                        {/* Previous button - Icon only on very small screens */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="h-8 px-2 text-xs"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            <span className="hidden xs:inline ml-1">Prev</span>
                        </Button>

                        {/* Page numbers with ellipsis */}
                        {getMobilePageNumbers().map((page, idx) => {
                            if (page === '...') {
                                return (
                                    <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">
                                        •••
                                    </span>
                                );
                            }
                            return (
                                <Button
                                    key={page}
                                    variant={currentPage === page ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setCurrentPage(page as number)}
                                    className="h-8 min-w-[32px] w-8 p-0 text-xs"
                                >
                                    {page}
                                </Button>
                            );
                        })}

                        {/* Next button - Icon only on very small screens */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="h-8 px-2 text-xs"
                        >
                            <span className="hidden xs:inline mr-1">Next</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <Card className="col-span-4">
            <CardHeader>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <CardTitle>Comments</CardTitle>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <ArrowUpDown className="h-4 w-4 mr-2" />
                                    <span className="hidden sm:inline">Sort: </span>
                                    {sortBy === 'newest' ? 'Newest' : sortBy === 'oldest' ? 'Oldest' : 'Most Liked'}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleSortChange('newest')}>
                                    Newest First
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleSortChange('oldest')}>
                                    Oldest First
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleSortChange('mostLiked')}>
                                    Most Liked
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <div className="relative w-full">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search comments..."
                            className="pl-8"
                            value={search}
                            onChange={(e) => handleSearchChange(e.target.value)}
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                    <TabsList>
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="question">Questions</TabsTrigger>
                        <TabsTrigger value="feedback">Feedback</TabsTrigger>
                        <TabsTrigger value="general">General</TabsTrigger>
                    </TabsList>

                    <div className="rounded-md border mt-4">
                        <ScrollArea className="h-[600px] w-full">
                            <TabsContent value="all" className="m-0">
                                {paginatedComments.length > 0 ? (
                                    paginatedComments.map(comment => (
                                        <CommentItem key={comment.id} comment={comment} />
                                    ))
                                ) : (
                                    <div className="p-8 text-center text-muted-foreground">
                                        No comments found
                                    </div>
                                )}
                            </TabsContent>
                            <TabsContent value="question" className="m-0">
                                {paginatedComments.length > 0 ? (
                                    paginatedComments.map(comment => (
                                        <CommentItem key={comment.id} comment={comment} />
                                    ))
                                ) : (
                                    <div className="p-8 text-center text-muted-foreground">
                                        No questions found
                                    </div>
                                )}
                            </TabsContent>
                            <TabsContent value="feedback" className="m-0">
                                {paginatedComments.length > 0 ? (
                                    paginatedComments.map(comment => (
                                        <CommentItem key={comment.id} comment={comment} />
                                    ))
                                ) : (
                                    <div className="p-8 text-center text-muted-foreground">
                                        No feedback found
                                    </div>
                                )}
                            </TabsContent>
                            <TabsContent value="general" className="m-0">
                                {paginatedComments.length > 0 ? (
                                    paginatedComments.map(comment => (
                                        <CommentItem key={comment.id} comment={comment} />
                                    ))
                                ) : (
                                    <div className="p-8 text-center text-muted-foreground">
                                        No general comments found
                                    </div>
                                )}
                            </TabsContent>
                        </ScrollArea>
                        <PaginationControls />
                    </div>
                </Tabs>
            </CardContent>
        </Card >
    );
}
