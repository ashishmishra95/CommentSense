# 🔑 How to Get Your Cloudflare Account ID

## Quick Steps:

### 1. **Sign Up / Log In to Cloudflare**
   - Go to: https://dash.cloudflare.com/sign-up
   - Create a free account or log in if you already have one
   - **No credit card required!**

### 2. **Find Your Account ID**
   Once logged in, you'll see your dashboard:
   
   - Look at the **right sidebar** of the dashboard
   - You'll see a section called **"Account ID"**
   - It looks like: `1234567890abcdef1234567890abcdef`
   - Click the **copy icon** next to it

### 3. **Add to Your .env File**
   Open your `.env` file and update this line:
   ```env
   NEXT_PUBLIC_CLOUDFLARE_ACCOUNT_ID=paste-your-account-id-here
   ```

### 4. **Restart Your Dev Server**
   ```bash
   # Stop the current server (Ctrl+C)
   # Then restart:
   npm run dev
   ```

## Visual Guide:

```
┌─────────────────────────────────────────┐
│  Cloudflare Dashboard                   │
├─────────────────────────────────────────┤
│                                         │
│  Your Websites                          │
│  ┌─────────────┐                        │
│  │  Add Site   │                        │
│  └─────────────┘                        │
│                                         │
│                          ┌──────────────┤
│                          │ Account ID   │
│                          │ abc123...    │
│                          │ [Copy] 📋    │ ← Click here!
│                          └──────────────┤
└─────────────────────────────────────────┘
```

## Important Notes:

✅ **Free Forever** - Cloudflare Workers AI has a generous free tier
✅ **No Credit Card** - You don't need to add payment info
✅ **10,000 Requests/Day** - More than enough for testing
✅ **Instant Setup** - Takes less than 2 minutes

## After Adding Account ID:

Your `.env` file should look like this:
```env
# YouTube API
YOUTUBE_API_KEY=your-youtube-key

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000

# Cloudflare Worker AI Configuration
NEXT_PUBLIC_CLOUDFLARE_ACCOUNT_ID=abc123def456ghi789jkl012mno345pq  ← Your actual ID here
CLOUDFLARE_API_TOKEN=XHfEiuLoOUc9pSjdFFlBe-QAWAQSHaMIrAwa70q7
```

## Troubleshooting:

**Can't find Account ID?**
- Make sure you're logged into Cloudflare Dashboard
- It's on the right side of the main dashboard page
- If you don't see it, click on "Workers & Pages" in the left menu

**Still showing "Summary unavailable"?**
- Make sure you copied the FULL Account ID (32 characters)
- Make sure there are no extra spaces
- Restart your dev server after updating .env

**Need help?**
- Cloudflare Dashboard: https://dash.cloudflare.com
- Workers AI Docs: https://developers.cloudflare.com/workers-ai/

---

Once you add your Account ID, the AI summaries will work perfectly! 🎉
