# Cloudflare Worker AI Integration

This project now includes AI-powered comment analysis using Cloudflare Worker AI with the `bart-large-cnn` model for summarization and intelligent categorization.

## Features

### 1. **AI-Powered Comment Categorization**
- Uses Cloudflare Worker AI to intelligently categorize comments into:
  - **Questions**: Comments asking for information or clarification
  - **Feedback**: Opinions, suggestions, praise, or criticism
  - **General**: Other comments that don't fit the above categories

### 2. **AI-Generated Summaries**
- **Overall Summary**: A comprehensive summary of all comments
- **Category-Specific Summaries**: Individual summaries for Questions, Feedback, and General comments
- Powered by the `bart-large-cnn` model for high-quality text summarization

### 3. **Real-time Progress Tracking**
- Live progress updates during comment fetching
- AI processing status with percentage completion
- Beautiful animated progress indicators

## Setup Instructions

### Step 1: Get Your Cloudflare Account ID

1. Sign up for a free Cloudflare account at [cloudflare.com](https://cloudflare.com)
2. Go to your Cloudflare Dashboard
3. On the right side of the dashboard, you'll see your **Account ID**
4. Copy this Account ID

### Step 2: Configure Environment Variables

Add the following to your `.env` file:

```env
# Cloudflare Worker AI Configuration
NEXT_PUBLIC_CLOUDFLARE_ACCOUNT_ID=your-account-id-here
CLOUDFLARE_API_TOKEN=XHfEiuLoOUc9pSjdFFlBe-QAWAQSHaMIrAwa70q7
```

**Important**: Replace `your-account-id-here` with your actual Cloudflare Account ID from Step 1.

### Step 3: Restart Your Development Server

After updating the `.env` file, restart your development server:

```bash
npm run dev
```

## How It Works

### Comment Categorization Flow

1. **Fetch Comments**: Comments are fetched from YouTube using the YouTube Data API
2. **AI Processing**: Each comment is sent to Cloudflare Worker AI for categorization
3. **Batch Processing**: Comments are processed in batches of 10 to avoid rate limiting
4. **Progress Updates**: Real-time updates show categorization progress
5. **Fallback**: If AI fails, the system falls back to rule-based categorization

### Summarization Flow

1. **Collect Comments**: After categorization, comments are grouped by category
2. **Generate Summaries**: The `bart-large-cnn` model creates summaries for:
   - All comments combined (overall summary)
   - Questions only
   - Feedback only
   - General comments only
3. **Display**: Summaries are displayed in beautiful cards at the top of the comment list

## API Endpoints

### `/api/analyze-stream`

Streaming endpoint for real-time comment analysis with AI support.

**Query Parameters:**
- `url` (required): YouTube video URL
- `useAI` (optional): Set to `true` to enable AI processing (default: `false`)

**Example:**
```
/api/analyze-stream?url=https://youtube.com/watch?v=VIDEO_ID&useAI=true
```

### `/api/analyze-ai`

Non-streaming endpoint for AI-powered analysis.

**Query Parameters:**
- `url` (required): YouTube video URL
- `useAI` (optional): Set to `true` to enable AI processing

## Models Used

### 1. bart-large-cnn
- **Purpose**: Text summarization
- **Provider**: Cloudflare Worker AI
- **Model**: `@cf/facebook/bart-large-cnn`
- **Use Case**: Generating concise summaries of comments

### 2. llama-2-7b-chat-int8
- **Purpose**: Comment categorization
- **Provider**: Cloudflare Worker AI
- **Model**: `@cf/meta/llama-2-7b-chat-int8`
- **Use Case**: Intelligently categorizing comments

## Performance Considerations

- **Batch Processing**: Comments are processed in batches of 10 to avoid overwhelming the API
- **Rate Limiting**: 500ms delay between batches to prevent rate limit errors
- **Fallback**: Automatic fallback to rule-based categorization if AI fails
- **Timeout**: Maximum 5 minutes (300 seconds) for AI processing

## Cost

Cloudflare Worker AI offers a generous free tier:
- **Free Tier**: 10,000 requests per day
- **Pricing**: After free tier, pay-as-you-go pricing applies

For most use cases, the free tier should be sufficient.

## Troubleshooting

### "Summary unavailable" or "Categorization failed"

1. **Check Account ID**: Ensure your Cloudflare Account ID is correct in `.env`
2. **Verify API Token**: The provided API token should work, but you can generate a new one from Cloudflare Dashboard
3. **Check Logs**: Look at the server console for detailed error messages
4. **Rate Limits**: If processing many comments, you might hit rate limits. The system will automatically fall back to rule-based categorization.

### AI Processing Takes Too Long

- Large videos with thousands of comments may take several minutes to process
- The system shows real-time progress updates
- Consider processing smaller batches or using the non-AI mode for very large videos

## Disabling AI Mode

AI mode is enabled by default. To disable it:

1. In `src/app/dashboard/page.tsx`, change:
   ```tsx
   const [useAI, setUseAI] = useState(true);
   ```
   to:
   ```tsx
   const [useAI, setUseAI] = useState(false);
   ```

Or add a toggle button in the UI to let users choose.

## Future Enhancements

- [ ] Add sentiment analysis for comments
- [ ] Implement keyword extraction
- [ ] Add language detection and translation
- [ ] Create AI-powered response suggestions
- [ ] Add trend analysis over time

## Support

For issues or questions about Cloudflare Worker AI integration, please check:
- [Cloudflare Workers AI Documentation](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare Community Forum](https://community.cloudflare.com/)
