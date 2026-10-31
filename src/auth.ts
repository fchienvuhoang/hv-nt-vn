import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
export function allowedAdmin(email?: string | null) {
  return !!email && (process.env.ADMIN_EMAILS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
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
