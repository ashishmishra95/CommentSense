# Google OAuth Setup Guide

## Prerequisites
You need to set up Google OAuth credentials to enable authentication in CommentSense.

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **YouTube Data API v3** for your project

## Step 2: Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Configure the OAuth consent screen if prompted:
   - User Type: External
   - App name: CommentSense
   - User support email: Your email
   - Developer contact: Your email
4. For Application type, select **Web application**
5. Add authorized redirect URIs:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
   For production, also add:
   ```
   https://yourdomain.com/api/auth/callback/google
   ```
6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

## Step 3: Configure Environment Variables

Create a `.env` file in the root of your project with the following variables:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# NextAuth Configuration
# Generate a random secret using: openssl rand -base64 32
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=http://localhost:3000

# YouTube API Key (optional, for additional API calls)
YOUTUBE_API_KEY=your_youtube_api_key_here
```

## Step 4: Generate NextAuth Secret

Run this command in your terminal to generate a secure secret:

```bash
openssl rand -base64 32
```

Copy the output and use it as your `NEXTAUTH_SECRET`.

## Step 5: Run the Application

```bash
npm run dev
```

## How It Works

1. User pastes a YouTube URL on the home page
2. When clicking "Start Analysis", the Google OAuth flow is triggered
3. User signs in with their Google account
4. The app requests permission to access YouTube data
5. After successful authentication, user is redirected to the dashboard
6. Comments are fetched and analyzed

## Scopes Requested

- `openid`: Basic authentication
- `email`: User's email address
- `profile`: User's basic profile information
- `https://www.googleapis.com/auth/youtube.readonly`: Read-only access to YouTube data

## Troubleshooting

### Error 401: invalid_client
- Verify your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
- Ensure the redirect URI in Google Console matches exactly

### Redirect URI mismatch
- Check that `https://commentsensee.vercel.app/api/auth/callback/google` is added to authorized redirect URIs

### Session not persisting
- Ensure `NEXTAUTH_SECRET` is set and is a strong random string
