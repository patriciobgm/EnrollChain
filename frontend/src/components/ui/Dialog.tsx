import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, type ComponentProps } from "react";
import { cn } from "../../lib/cn";

function ModalBackgroundGuard() {
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const previouslyInert = root.inert;
    root.inert = true;
    return () => {
      root.inert = previouslyInert;
    };
  }, []);
  return null;
}

export function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}
export function DialogTrigger(
  props: ComponentProps<typeof DialogPrimitive.Trigger>,
) {
  return <DialogPrimitive.Trigger {...props} />;
}
export function DialogContent({
  children,
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/45 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto [scrollbar-gutter:stable] rounded-3xl border border-white/50 bg-surface p-6 shadow-dialog sm:p-8",
          className,
        )}
        {...props}
      >
        <ModalBackgroundGuard />
        {children}
        <DialogPrimitive.Close
          className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-xl text-muted hover:bg-canvas focus-visible:ring-2 focus-visible:ring-brand"
          aria-label="Close dialog"
        >
          <X size={20} aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn(
        "pr-9 font-display text-2xl font-semibold tracking-tight",
        className,
      )}
      {...props}
    />
  );
}
export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("mt-2 text-sm leading-6 text-muted", className)}
      {...props}
    />
  );
}
