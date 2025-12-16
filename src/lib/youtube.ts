import axios from 'axios';

const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeComment {
  id: string;
  textDisplay: string;
  textOriginal: string;
  authorDisplayName: string;
  authorProfileImageUrl: string;
  likeCount: number;
  publishedAt: string;
  updatedAt: string;
}

export async function fetchComments(videoId: string, maxResults: number = 100): Promise<YouTubeComment[]> {
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY is not defined');
  }

  const allComments: YouTubeComment[] = [];
  let nextPageToken: string | undefined = undefined;
  const perPageLimit = 100; // YouTube API max per request
  const totalLimit = maxResults; // Total comments to fetch (0 = unlimited)

  try {
    do {
      const response: any = await axios.get(`${YOUTUBE_API_URL}/commentThreads`, {
        params: {
          part: 'snippet',
          videoId: videoId,
          maxResults: perPageLimit,
          key: YOUTUBE_API_KEY,
          textFormat: 'plainText',
          pageToken: nextPageToken,
        },
      });

      const comments = response.data.items.map((item: any) => {
        const snippet = item.snippet.topLevelComment.snippet;
        return {
          id: item.id,
          textDisplay: snippet.textDisplay,
          textOriginal: snippet.textOriginal,
          authorDisplayName: snippet.authorDisplayName,
          authorProfileImageUrl: snippet.authorProfileImageUrl,
          likeCount: snippet.likeCount,
          publishedAt: snippet.publishedAt,
          updatedAt: snippet.updatedAt,
        };
      });

      allComments.push(...comments);
      nextPageToken = response.data.nextPageToken;

      // Stop if we've reached the limit (if specified)
      if (totalLimit > 0 && allComments.length >= totalLimit) {
        break;
      }

      // Add a small delay to avoid rate limiting
      if (nextPageToken) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } while (nextPageToken);

    return totalLimit > 0 ? allComments.slice(0, totalLimit) : allComments;
  } catch (error) {
    console.error('Error fetching YouTube comments:', error);
    throw new Error('Failed to fetch comments from YouTube');
  }
}

// Version with progress callback for streaming
export async function fetchCommentsWithProgress(
  videoId: string,
  maxResults: number = 0,
  onProgress: (progress: { type: string; fetched: number; comments: YouTubeComment[] }) => void
): Promise<YouTubeComment[]> {
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY is not defined');
  }

  const allComments: YouTubeComment[] = [];
  let nextPageToken: string | undefined = undefined;
  const perPageLimit = 100;
  const totalLimit = maxResults;

  try {
    do {
      const response: any = await axios.get(`${YOUTUBE_API_URL}/commentThreads`, {
        params: {
          part: 'snippet',
          videoId: videoId,
          maxResults: perPageLimit,
          key: YOUTUBE_API_KEY,
          textFormat: 'plainText',
          pageToken: nextPageToken,
        },
      });

      const comments = response.data.items.map((item: any) => {
        const snippet = item.snippet.topLevelComment.snippet;
        return {
          id: item.id,
          textDisplay: snippet.textDisplay,
          textOriginal: snippet.textOriginal,
          authorDisplayName: snippet.authorDisplayName,
          authorProfileImageUrl: snippet.authorProfileImageUrl,
          likeCount: snippet.likeCount,
          publishedAt: snippet.publishedAt,
          updatedAt: snippet.updatedAt,
        };
      });

      allComments.push(...comments);
      nextPageToken = response.data.nextPageToken;

      // Report progress
      onProgress({
        type: 'progress',
        fetched: allComments.length,
        comments: allComments,
      });

      if (totalLimit > 0 && allComments.length >= totalLimit) {
        break;
      }

      if (nextPageToken) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } while (nextPageToken);

    return totalLimit > 0 ? allComments.slice(0, totalLimit) : allComments;
  } catch (error: any) {
    console.error('Error fetching YouTube comments:', error);
    if (axios.isAxiosError(error)) {
      const apiMessage = error.response?.data?.error?.message || error.message;
      throw new Error(`YouTube API Error: ${apiMessage}`);
    }
    throw error;
  }
}

export function extractVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}
