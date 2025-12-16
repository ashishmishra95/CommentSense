import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      return session;
    },
    async redirect({ url, baseUrl }) {
      // If the url is a relative path, prepend baseUrl
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // If the url is from the same origin, allow it
      else if (new URL(url).origin === baseUrl) return url;
      // Otherwise, redirect to base URL
      return baseUrl;
    },
  },
  pages: {
    signIn: '/',
  },
  trustHost: true,
})

