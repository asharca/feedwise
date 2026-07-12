"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Rss } from "lucide-react";
import { signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // rememberMe: true keeps a persistent cookie (Max-Age = session.expiresIn)
      // instead of a browser-session cookie that disappears when the tab closes.
      const res = await signIn.email({ email, password, rememberMe: true });
      if (res.error) {
        setError(res.error.message ?? "Login failed");
      } else {
        const redirect = searchParams.get("redirect");
        if (redirect && redirect.startsWith("http")) {
          window.location.href = redirect;
        } else {
          router.push(redirect ?? "/reader");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2.5" aria-label="Feedwise">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
              <Rss className="size-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Feedwise</span>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to Feedwise</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              aria-describedby={error ? "login-error" : undefined}
              className="rounded-md h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              aria-describedby={error ? "login-error" : undefined}
              className="rounded-md h-10"
            />
          </div>
          {error && (
            <p id="login-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full rounded-md h-10" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link
            href="/register"
            className="text-primary font-medium hover:underline underline-offset-4"
          >
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
