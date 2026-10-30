"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useUser } from "@/app/context/UserContext";
import { Logo } from "@/components/brand/logo";
import { apiUrl } from "@/lib/api";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = { email?: string; password?: string; code?: string };

/**
 * Two-step sign-in. Step 2 (TOTP) is prepared for when the backend supports it:
 * TODO: POST /api/auth/login answers { requires_2fa: true, challenge_token } for accounts with
 * 2FA enabled, and POST /api/auth/2fa/verify { challenge_token, code } returns { token }.
 * Preview the step without a backend via /login?preview=2fa.
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user, isLoading: authLoading } = useUser();

  const [step, setStep] = useState<"credentials" | "totp">(searchParams.get("preview") === "2fa" ? "totp" : "credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.push("/");
    }
  }, [authLoading, user, router]);

  if (!authLoading && user) {
    return null;
  }

  const completeSignIn = async (token: string) => {
    const meRes = await fetch(apiUrl("/api/auth/me"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meJson = await meRes.json();
    if (!meJson.ok) throw new Error("We signed you in but could not load your profile. Please try again.");
    login(token, meJson.data);
    toast.success(`Welcome back, ${meJson.data.display_name}!`);
    router.push("/");
  };

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = "Enter your email address.";
    else if (!EMAIL_PATTERN.test(email.trim())) errors.email = "Enter a valid email address, like admin@obsera.local.";
    if (!password) errors.password = "Enter your password.";
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setIsLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const json = await res.json();

      if (!json.ok) {
        setFormError(
          res.status === 403
            ? "This account is disabled. Ask an administrator to re-enable it."
            : res.status === 401
              ? "Incorrect email or password."
              : json.message || "Sign-in failed. Please try again."
        );
        return;
      }

      if (json.data?.requires_2fa) {
        setChallengeToken(json.data.challenge_token ?? null);
        setStep("totp");
        return;
      }

      await completeSignIn(json.data.token);
    } catch (error) {
      console.error("Login failed:", error);
      setFormError(error instanceof Error && error.message.startsWith("We signed you in")
        ? error.message
        : "Can't reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!/^\d{6}$/.test(code)) {
      setFieldErrors({ code: "Enter the 6-digit code from your authenticator app." });
      return;
    }
    setFieldErrors({});

    setIsLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/2fa/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge_token: challengeToken, code }),
      });
      if (res.status === 404) {
        setFormError("Two-factor sign-in is not available on this server yet.");
        return;
      }
      const json = await res.json();
      if (!json.ok) {
        setFormError(json.message || "That code didn't work. Codes change every 30 seconds; try the current one.");
        return;
      }
      await completeSignIn(json.data.token);
    } catch {
      setFormError("Can't reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const backToCredentials = () => {
    setStep("credentials");
    setCode("");
    setChallengeToken(null);
    setFieldErrors({});
    setFormError(null);
  };

  // Inline under the submit button, where the eye lands after pressing it
  const formAlert = formError && (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 px-3 py-2.5 text-sm text-foreground">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
      <span>{formError}</span>
    </div>
  );

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-[380px] gap-0 overflow-hidden py-0">
        {/* Brand block, centered; the form below stays left-aligned */}
        <div className="flex flex-col items-center px-6 pt-8 text-center">
          <Logo variant="default" size={68} />
          {/* pl offsets the trailing letter-spacing so the word sits on the true center */}
          <h1 className="mt-3 pl-[0.2em] text-xl font-semibold uppercase tracking-[0.2em] text-foreground">Obsera</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">SSH honeypot administration console</p>
        </div>

        <div className="px-6 pb-6 pt-6">
          {step === "credentials" ? (
            <form onSubmit={handleCredentials} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@obsera.com"
                  className="h-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? "email-error" : undefined}
                />
                {fieldErrors.email && <p id="email-error" className="text-xs text-destructive">{fieldErrors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="h-10 pr-10 font-mono"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
                {fieldErrors.password && <p id="password-error" className="text-xs text-destructive">{fieldErrors.password}</p>}
              </div>

              <Button type="submit" size="lg" className="mt-2 w-full" disabled={isLoading} aria-busy={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
              {formAlert}
            </form>
          ) : (
            <form onSubmit={handleTotp} className="space-y-4" noValidate>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden />
                <span>Two-factor authentication is on for this account. Enter the code from your authenticator app.</span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="totp">Authentication code</Label>
                <Input
                  id="totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  className="h-10 font-mono text-base tracking-[0.4em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={isLoading}
                  aria-invalid={!!fieldErrors.code}
                  aria-describedby={fieldErrors.code ? "totp-error" : "totp-help"}
                />
                {fieldErrors.code ? (
                  <p id="totp-error" className="text-xs text-destructive">{fieldErrors.code}</p>
                ) : (
                  <p id="totp-help" className="text-xs text-muted-foreground">6 digits from Google Authenticator, Authy or a similar app.</p>
                )}
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={isLoading} aria-busy={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Verifying…
                  </>
                ) : (
                  "Verify and sign in"
                )}
              </Button>
              {formAlert}
              <Button type="button" variant="ghost" className="w-full gap-1.5" onClick={backToCredentials} disabled={isLoading}>
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Use a different account
              </Button>
            </form>
          )}
        </div>

        {/* px-4 leaves room for the 47-character mono line at 12px on one line inside 380px */}
        <div className="border-t border-border bg-muted px-4 py-3">
          <p className="text-center font-mono text-xs text-muted-foreground">Authorized access only. All activity is logged.</p>
        </div>
      </Card>
    </main>
  );
}

// useSearchParams (2FA preview) requires a Suspense boundary for static prerendering
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
