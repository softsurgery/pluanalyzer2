"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Building2, KeyRound, Loader2 } from "lucide-react";
import { loginUser } from "@/api/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function LoginPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("planner@pluanalyzer.fr");
  const [password, setPassword] = useState("PluPlanner2026!");

  const loginMutation = useMutation({
    mutationFn: () => loginUser({ email, password }),
    onSuccess: () => {
      queryClient.clear();
      router.refresh();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  return (
    <Card className="mx-auto mt-12 max-w-md rounded-2xl">
      <CardHeader className="flex-row items-center gap-3 space-y-0 pb-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Building2 className="h-6 w-6" />
        </div>
        <div>
          <CardTitle className="text-xl">Connexion PLU Analyzer</CardTitle>
          <CardDescription className="text-xs">
            Authentification sécurisée via Payload CMS
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-email" className="uppercase tracking-wide">
              Email
            </Label>
            <Input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password" className="uppercase tracking-wide">
              Mot de passe
            </Label>
            <Input
              id="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

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

      <CardFooter>
        <div className="w-full rounded-xl bg-muted p-3 text-xs text-muted-foreground">
          <div className="font-semibold text-foreground">
            Comptes de démonstration (seed) :
          </div>
          <div className="mt-1 space-y-0.5 font-mono text-[11px]">
            <div>Urbaniste : planner@pluanalyzer.fr / PluPlanner2026!</div>
            <div>Admin : admin@pluanalyzer.fr / PluAdmin2026!</div>
            <div>Viewer : viewer@pluanalyzer.fr / PluViewer2026!</div>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
