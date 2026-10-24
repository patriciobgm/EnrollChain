import { ArrowLeft } from "lucide-react";
import { Link, type LinkProps } from "react-router-dom";
import { Button, type ButtonProps } from "./ui/Button";

export function BackLink({ children, className, ...props }: LinkProps) {
  return (
    <Button asChild variant="outline" className={className}>
      <Link {...props}>
        <ArrowLeft aria-hidden="true" />
        {children}
      </Link>
    </Button>
  );
}

export function BackButton({
  children,
  ...props
}: Omit<ButtonProps, "asChild" | "variant">) {
  return (
    <Button {...props} variant="outline">
      <ArrowLeft aria-hidden="true" />
      {children}
    </Button>
  );
}
