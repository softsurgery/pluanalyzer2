"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Building2, KeyRound, Loader2 } from "lucide-react";
import { loginUser } from "@/api/auth";
import { FormBuilder } from "@/components/shared/form-builder";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLoginFormStructure } from "@/hooks/forms/useLoginFormStructure";
import { useAuthStore } from "@/hooks/stores/useAuthStore";
import { loginSchema, validateForm } from "@/validations";
import { cn } from "@/lib/utils";

interface LoginPanelProps {
  className?: string;
}

export function LoginPanel({ className }: LoginPanelProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const { loginFormStructure } = useLoginFormStructure({ authStore });

  const loginMutation = useMutation({
    mutationFn: () => loginUser(authStore.loginDto),
    onSuccess: () => {
      queryClient.clear();
      router.refresh();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateForm(loginSchema, authStore.loginDto);
    if (!result.success) {
      authStore.set("loginDtoErrors", result.errors);
      return;
    }
    authStore.set("loginDtoErrors", {});
    loginMutation.mutate();
  };

  return (
    <div
      className={cn(
        "flex flex-1 w-full items-center justify-center p-4",
        className,
      )}
    >
      <Card className="w-full max-w-md rounded-2xl">
        <CardHeader>
          <CardTitle className="text-xl">Connexion PLU Analyzer</CardTitle>
          <CardDescription className="text-xs">
            Authentification sécurisée via Payload CMS
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormBuilder structure={loginFormStructure} />

            {loginMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {loginMutation.error instanceof Error
                    ? loginMutation.error.message
                    : "Identifiants invalides"}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full"
            >
              {loginMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Se connecter
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
