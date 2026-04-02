"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function AuthorizeForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const clientId = searchParams.get("client_id") ?? "";
  const redirectUri = searchParams.get("redirect_uri") ?? "";
  const state = searchParams.get("state") ?? "";
  const codeChallenge = searchParams.get("code_challenge") ?? "";
  const codeChallengeMethod = searchParams.get("code_challenge_method") ?? "S256";

  // Check if user is logged in
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => {
        if (!r.ok) {
          // Not logged in — redirect to login, then back here
          const returnUrl = window.location.href;
          router.push(`/login?redirect=${encodeURIComponent(returnUrl)}`);
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        router.push("/login");
      });
  }, [router]);

  async function handleApprove() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error === "Not logged in") {
          const returnUrl = window.location.href;
          router.push(`/login?redirect=${encodeURIComponent(returnUrl)}`);
          return;
        }
        setError(data.error ?? "Authorization failed");
        setLoading(false);
        return;
      }

      const { redirect_to } = await res.json();
      window.location.href = redirect_to;
    } catch {
      setError("Authorization failed");
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-muted-foreground">Checking authentication...</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md rounded-2xl border-border/50">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Authorize MCP Access</CardTitle>
          <CardDescription>
            An application wants to access your Feedwise data via MCP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-muted p-3 text-sm space-y-1">
            <p><span className="text-muted-foreground">Client:</span> {clientId.slice(0, 8)}...</p>
            <p><span className="text-muted-foreground">Redirect:</span> {redirectUri}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            This will allow the application to read and manage your feeds and articles.
          </p>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => window.close()}
            >
              Deny
            </Button>
            <Button
              className="flex-1 rounded-xl"
              onClick={handleApprove}
              disabled={loading}
            >
              {loading ? "Authorizing..." : "Approve"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense>
      <AuthorizeForm />
    </Suspense>
  );
}
