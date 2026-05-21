import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ToastType = "success" | "error" | "info";

type Toast = {
  id: number;
  message: string;
  type: ToastType;
  /** true once the exit animation has started */
  exiting: boolean;
};

type ToastContextValue = {
  showToast: (message: string, type: ToastType) => void;
};

/* ------------------------------------------------------------------ */
/*  Icons (inline SVG)                                                 */
/* ------------------------------------------------------------------ */

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5 shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5 shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5 shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Style helpers                                                      */
/* ------------------------------------------------------------------ */

const STYLE_MAP: Record<
  ToastType,
  { container: string; icon: ReactNode }
> = {
  success: {
    container:
      "border-emerald-200 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60",
    icon: <CheckIcon />,
  },
  error: {
    container:
      "border-rose-200 bg-rose-50 text-rose-800 ring-1 ring-rose-200/60",
    icon: <XIcon />,
  },
  info: {
    container:
      "border-sky-200 bg-sky-50 text-sky-800 ring-1 ring-sky-200/60",
    icon: <InfoIcon />,
  },
};

const AUTO_DISMISS_MS = 3000;
const EXIT_ANIMATION_MS = 300;

/* ------------------------------------------------------------------ */
/*  Keyframes (injected once)                                          */
/* ------------------------------------------------------------------ */

const KEYFRAMES = `
@keyframes toast-slide-in {
  from { opacity: 0; transform: translateX(100%); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes toast-slide-out {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(100%); }
}
`;

/* ------------------------------------------------------------------ */
/*  Single toast item                                                  */
/* ------------------------------------------------------------------ */

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const style = STYLE_MAP[toast.type];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`pointer-events-auto flex w-80 items-start gap-3 rounded-xl border p-4 shadow-lg ${style.container}`}
      style={{
        animation: toast.exiting
          ? `toast-slide-out ${EXIT_ANIMATION_MS}ms ease-in forwards`
          : `toast-slide-in ${EXIT_ANIMATION_MS}ms ease-out`,
      }}
    >
      <span className="mt-0.5">{style.icon}</span>
      <p className="flex-1 text-sm font-medium leading-snug">{toast.message}</p>
      <button
        type="button"
        aria-label="Close notification"
        className="rounded-lg p-0.5 opacity-60 transition-opacity hover:opacity-100"
        onClick={() => onDismiss(toast.id)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  /** Begin the exit animation, then remove after the animation completes. */
  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_ANIMATION_MS);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, type, exiting: false }]);

      // auto-dismiss
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  /** Keep a stable context value across renders. */
  const ctxRef = useRef<ToastContextValue>({ showToast });
  ctxRef.current.showToast = showToast;

  return (
    <ToastContext.Provider value={ctxRef.current}>
      {children}
      {createPortal(
        <>
          {/* inject keyframes once */}
          <style>{KEYFRAMES}</style>
          <div
            aria-label="Notifications"
            className="pointer-events-none fixed inset-0 z-[9999] flex flex-col items-end gap-3 p-4"
          >
            {toasts.map((t) => (
              <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
            ))}
          </div>
        </>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
