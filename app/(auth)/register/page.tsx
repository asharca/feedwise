"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Rss } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, code }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error ?? "Registration failed");
      } else {
        router.push("/login");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8 landscape:items-start">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2.5" aria-label="Feedwise">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary">
              <Rss className="size-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Feedwise</span>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">Create account</h1>
            <p className="text-sm text-muted-foreground mt-1">Start reading your feeds</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
              autoComplete="name"
              className="rounded-md h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              aria-describedby={error ? "register-error" : undefined}
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
              autoComplete="new-password"
              aria-describedby={error ? "register-error" : undefined}
              className="rounded-md h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              aria-describedby={error ? "register-error" : undefined}
              className="rounded-md h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="code">Registration Code</Label>
            <Input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter code"
              required
              className="rounded-md h-10"
            />
          </div>
          {error && (
            <p id="register-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full rounded-md h-10" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-primary font-medium hover:underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
