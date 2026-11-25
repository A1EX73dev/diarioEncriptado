import type { ReactNode } from "react";

export function AuthCard({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="font-serif text-3xl text-text">{title}</h1>
      {intro && <div className="mt-3 text-text-muted">{intro}</div>}
      <div className="mt-8 rounded-lg border border-border bg-surface p-6 sm:p-8">{children}</div>
      {footer && <div className="mt-6 text-sm text-text-muted">{footer}</div>}
    </div>
  );
}
