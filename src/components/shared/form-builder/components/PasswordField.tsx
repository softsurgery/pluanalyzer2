import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PasswordFieldProps extends React.ComponentProps<"input"> {
  className?: string;
}

export const PasswordField = ({
  className,
  placeholder,
  ...props
}: PasswordFieldProps) => {
  const [showPassword, setShowPassword] = React.useState(false);
  const togglePasswordVisibility = () => setShowPassword(!showPassword);
  return (
    <div className="grid gap-2 text-start">
      <div className="relative">
        <Input
          type={showPassword ? "text" : "password"}
          placeholder={placeholder ?? "Mot de passe"}
          className="pe-10"
          autoComplete="new-password"
          {...props}
        />
        <Button
          type="button"
          onClick={togglePasswordVisibility}
          variant={"link"}
          className="absolute inset-y-0 end-0 flex items-center pe-3"
          aria-label={
            showPassword
              ? "Masquer le mot de passe"
              : "Afficher le mot de passe"
          }
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </Button>
      </div>
    </div>
  );
};
