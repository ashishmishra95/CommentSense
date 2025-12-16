# CommentSense 🎯

Turn messy YouTube comments into actionable insights in seconds.

CommentSense is a powerful YouTube comment analyzer that uses AI to categorize comments into Questions, Feedback, and General Comments. Built with Next.js and integrated with Google OAuth for seamless authentication.

## ✨ Features

- 🔐 **Google OAuth Authentication** - Secure sign-in with your Google account
- 📊 **Smart Comment Categorization** - Automatically sorts comments into Questions, Feedback, and General
- 📈 **Analytics Dashboard** - Visual stats and insights about your video comments
- 💾 **CSV Export** - Download your analyzed comments for further processing
- ⚡ **Fast & Responsive** - Built with Next.js for optimal performance

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- A Google Cloud account for OAuth setup

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd commentsense
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Google OAuth

**Important:** You must configure Google OAuth before running the app. Follow the detailed guide in [GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md).

Quick summary:
1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable YouTube Data API v3
3. Create OAuth 2.0 credentials
4. Add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI
5. Copy your Client ID and Client Secret

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```env
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=http://localhost:3000
```

Generate a secure `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [https://commentsensee.vercel.app](https://commentsensee.vercel.app) in your browser.

## 🎯 How It Works

1. **Paste URL** - Enter any YouTube video URL on the home page
2. **Authenticate** - Click "Start Analysis" to sign in with Google
3. **Analyze** - The app fetches and categorizes all comments
4. **Export** - Download your insights as a CSV file

## 🔒 Authentication Flow

- When you click "Start Analysis", Google OAuth is triggered
- You'll be prompted to sign in with your Google account
- The app requests permission to access YouTube data (read-only)
- After authentication, you're redirected to the dashboard
- Your session persists across page reloads

## 📦 Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Authentication:** NextAuth.js v5
- **UI Components:** Radix UI + Tailwind CSS
- **API:** YouTube Data API v3
- **Language:** TypeScript

## 📝 License

This project is licensed under the MIT License.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
