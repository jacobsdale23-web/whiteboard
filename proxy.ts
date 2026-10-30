import { auth } from "@/lib/auth/server";

export default auth.middleware({ loginUrl: "/sign-in" });

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sign-up|forgot-password|api/cron|oq-practice|pwa-icon|manifest.webmanifest).*)"],
};
