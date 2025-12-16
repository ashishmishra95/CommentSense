import { YouTubeComment } from './youtube';

export type CommentCategory = 'question' | 'feedback' | 'general';

export interface CategorizedComment extends YouTubeComment {
    category: CommentCategory;
}

export function categorizeComment(text: string): CommentCategory {
    const lowerText = text.toLowerCase();

    // Questions
    if (
        text.trim().endsWith('?') ||
        lowerText.startsWith('how') ||
        lowerText.startsWith('what') ||
        lowerText.startsWith('why') ||
        lowerText.startsWith('when') ||
        lowerText.startsWith('where') ||
        lowerText.startsWith('who') ||
        lowerText.includes('can you') ||
        lowerText.includes('could you') ||
        lowerText.includes('please explain')
    ) {
        return 'question';
    }

    // Feedback / Suggestions
    if (
        lowerText.includes('suggestion') ||
        lowerText.includes('suggest') ||
        lowerText.includes('should') ||
        lowerText.includes('recommend') ||
        lowerText.includes('love') ||
        lowerText.includes('hate') ||
        lowerText.includes('like') ||
        lowerText.includes('dislike') ||
        lowerText.includes('great video') ||
        lowerText.includes('awesome') ||
        lowerText.includes('bad') ||
        lowerText.includes('improve') ||
        lowerText.includes('fix')
    ) {
        return 'feedback';
    }

    // General
    return 'general';
}

export function categorizeComments(comments: YouTubeComment[]): CategorizedComment[] {
    return comments.map((comment) => ({
        ...comment,
        category: categorizeComment(comment.textOriginal),
    }));
}
