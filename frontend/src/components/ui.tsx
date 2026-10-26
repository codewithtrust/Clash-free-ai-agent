import { LoaderCircle, X } from "lucide-react";
import {
  useEffect,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { classNames } from "../lib/utils";

type ButtonVariant = "primary" | "dark" | "secondary" | "ghost" | "danger" | "lime";
type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-ink-900 text-white shadow-[0_8px_20px_rgba(13,20,17,.16)] hover:bg-ink-800 active:bg-ink-950 disabled:bg-ink-300 disabled:shadow-none",
  dark: "bg-ink-900 text-white hover:bg-ink-800",
  lime: "bg-lime-400 text-ink-950 shadow-[0_8px_22px_rgba(199,240,106,.28)] hover:bg-lime-300",
  secondary:
    "border border-ink-200 bg-white text-ink-800 hover:border-ink-300 hover:bg-ink-50",
  ghost: "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
  danger: "bg-coral-500 text-white hover:bg-coral-600",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 rounded-lg px-3 text-[12px]",
  md: "h-10 rounded-xl px-4 text-[13px]",
  lg: "h-12 rounded-2xl px-5 text-[14px]",
  icon: "h-9 w-9 rounded-xl",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={classNames(
        "inline-flex items-center justify-center gap-2 font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

type BadgeTone = "neutral" | "success" | "danger" | "warning" | "info" | "lime" | "dark";

const badgeTone: Record<BadgeTone, string> = {
  neutral: "border-ink-200/70 bg-ink-50 text-ink-600",
  success: "border-teal-100 bg-teal-50 text-teal-600",
  danger: "border-coral-100 bg-coral-50 text-coral-600",
  warning: "border-amber-100 bg-amber-50 text-amber-600",
  info: "border-[#DCE6F7] bg-[#EFF4FC] text-[#3D6196]",
  lime: "border-[#D6ED9C] bg-[#F2FADB] text-[#4B6C1C]",
  dark: "border-ink-800 bg-ink-900 text-lime-300",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  dot = false,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]",
        badgeTone[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={classNames("surface", className)} {...props}>
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle size={18} className={classNames("animate-spin text-ink-400", className)} />;
}

export function Confidence({ value }: { value: number }) {
  const percentage = Math.round(value * 100);
  const tone = percentage >= 85 ? "bg-teal-500" : percentage >= 65 ? "bg-amber-500" : "bg-coral-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-100">
        <div className={classNames("h-full rounded-full", tone)} style={{ width: `${percentage}%` }} />
      </div>
      <span className="font-mono text-[10px] text-ink-500">{percentage}%</span>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 animate-fade-in bg-ink-950/45 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={classNames(
          "relative flex max-h-[92vh] w-full animate-fade-up flex-col overflow-hidden rounded-[26px] border border-white/60 bg-white shadow-lift",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-display text-[19px] font-bold tracking-[-0.02em] text-ink-950">{title}</h2>
            {description && <p className="mt-1 text-[12px] leading-5 text-ink-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-ink-400 transition hover:bg-ink-50 hover:text-ink-800"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="border-t border-ink-100 bg-ink-50/50 px-5 py-3.5 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-50 text-ink-400">
        {icon}
      </div>
      <h3 className="font-display text-[15px] font-bold text-ink-900">{title}</h3>
      <p className="mt-1.5 max-w-xs text-[12px] leading-5 text-ink-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
      {children}
    </kbd>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
  description,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h2 className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink-950">{title}</h2>
        {description && <p className="mt-1 text-[12px] text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-8 lg:px-10">
      <div className="skeleton h-4 w-40" />
      <div className="skeleton mt-5 h-11 w-2/3 max-w-xl" />
      <div className="skeleton mt-3 h-4 w-1/2 max-w-md" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton h-32" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="skeleton h-80 xl:col-span-2" />
        <div className="skeleton h-80" />
      </div>
    </div>
  );
}
