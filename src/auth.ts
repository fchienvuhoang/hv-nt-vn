import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import {allowedAdmin} from "@/lib/admin-allowlist";
export {allowedAdmin} from "@/lib/admin-allowlist";
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt", maxAge: 90 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
    signIn({ account, profile, user }) {
      return account?.provider === "google" && profile?.email_verified === true && allowedAdmin(user.email);
    },
  },
});
