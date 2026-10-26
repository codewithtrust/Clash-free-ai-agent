import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { api } from "../lib/api";
import type { AppData } from "../types";
import { classNames } from "../lib/utils";

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface AppContextValue {
  data: AppData | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: (silent?: boolean) => Promise<void>;
  toast: (message: string, tone?: ToastTone) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const toneIcon = {
  success: CheckCircle2,
  error: CircleAlert,
  info: Info,
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const refresh = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    try {
      const next = await api.all();
      setData(next);
      setError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not reach the ClashFree agent.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = (toastId.current += 1);
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const dismiss = (id: number) => setToasts((current) => current.filter((item) => item.id !== id));

  const value = useMemo(
    () => ({ data, loading, refreshing, error, refresh, toast }),
    [data, loading, refreshing, error, refresh, toast],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2">
        {toasts.map((item) => {
          const Icon = toneIcon[item.tone];
          return (
            <div
              key={item.id}
              className={classNames(
                "pointer-events-auto flex animate-slide-in items-start gap-3 rounded-2xl border p-3.5 shadow-lift backdrop-blur",
                item.tone === "success" && "border-teal-100 bg-white text-ink-900",
                item.tone === "error" && "border-coral-100 bg-white text-ink-900",
                item.tone === "info" && "border-ink-100 bg-white text-ink-900",
              )}
              role="status"
            >
              <span
                className={classNames(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                  item.tone === "success" && "bg-teal-50 text-teal-600",
                  item.tone === "error" && "bg-coral-50 text-coral-600",
                  item.tone === "info" && "bg-ink-50 text-ink-600",
                )}
              >
                <Icon size={15} strokeWidth={2.2} />
              </span>
              <p className="flex-1 text-[13px] font-medium leading-5">{item.message}</p>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded-md p-0.5 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
