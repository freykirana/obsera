"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiUrl, fetchApi } from "@/lib/api";
import { useUser } from "@/app/context/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Mirrors MIN_PASSWORD_LENGTH in backend/src/services/password.service.js
const MIN_LENGTH = 12;

type Field = "current" | "next" | "confirm";
type FieldErrors = Partial<Record<Field, string>>;

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  error?: string;
  hint?: string;
  disabled: boolean;
}

function PasswordField({ id, label, value, onChange, autoComplete, error, hint, disabled }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className="pr-10 font-mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { user, login } = useUser();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setFieldErrors({});
    setFormError(null);
  };

  const handleOpenChange = (value: boolean) => {
    if (isSaving) return;
    if (!value) reset();
    onOpenChange(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const errors: FieldErrors = {};
    if (!current) errors.current = "Enter your current password.";
    if (next.length < MIN_LENGTH) errors.next = `Use at least ${MIN_LENGTH} characters.`;
    else if (next === current) errors.next = "Choose a password different from the current one.";
    if (!errors.next && confirm !== next) errors.confirm = "Passwords don't match.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setIsSaving(true);
    try {
      const res = await fetchApi(apiUrl("/api/auth/change-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        if (json.message === "Current password is incorrect.") setFieldErrors({ current: json.message });
        else setFormError(json.message || "Could not change the password. Please try again.");
        return;
      }

      // Other sessions are now signed out; keep this one with the fresh token
      if (user) login(json.data.token, user);
      toast.success("Password changed. Other sessions were signed out.");
      reset();
      onOpenChange(false);
    } catch {
      setFormError("Could not reach the server. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle className="text-foreground">Change password</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Other signed-in sessions for this account will be signed out.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <PasswordField
              id="current-password"
              label="Current password"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
              error={fieldErrors.current}
              disabled={isSaving}
            />
            <PasswordField
              id="new-password"
              label="New password"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              error={fieldErrors.next}
              hint={`At least ${MIN_LENGTH} characters.`}
              disabled={isSaving}
            />
            <PasswordField
              id="confirm-password"
              label="Confirm new password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              error={fieldErrors.confirm}
              disabled={isSaving}
            />
            {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} aria-busy={isSaving} className="gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {isSaving ? "Saving..." : "Change password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
