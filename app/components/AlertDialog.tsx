"use client";

import { useCallback, useEffect } from "react";
import { createContext, useContext, useState, type ReactNode } from "react";

// Types
interface AlertOptions {
  title?: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
}

interface CheckboxOption {
  id: string;
  label: string;
  defaultChecked?: boolean;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "info" | "warning" | "danger";
  checkboxes?: CheckboxOption[];
}

interface ConfirmResult {
  confirmed: boolean;
  checkboxValues?: Record<string, boolean>;
}

interface DialogState {
  type: "alert" | "confirm";
  options: AlertOptions | ConfirmOptions;
  resolve: (value: boolean | ConfirmResult) => void;
}

interface AlertContextType {
  showAlert: (options: AlertOptions | string) => Promise<void>;
  showConfirm: (options: ConfirmOptions | string) => Promise<boolean>;
  showConfirmWithOptions: (options: ConfirmOptions) => Promise<ConfirmResult>;
}

const AlertContext = createContext<AlertContextType | null>(null);

// Hook to use alert/confirm
export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlert must be used within AlertProvider");
  }
  return context;
}

// Provider component
export function AlertProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const showAlert = useCallback((options: AlertOptions | string): Promise<void> => {
    const opts: AlertOptions = typeof options === "string" ? { message: options } : options;
    return new Promise((resolve) => {
      setDialog({
        type: "alert",
        options: opts,
        resolve: () => resolve(),
      });
    });
  }, []);

  const showConfirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const opts: ConfirmOptions = typeof options === "string" ? { message: options } : options;
    return new Promise((resolve) => {
      setDialog({
        type: "confirm",
        options: opts,
        resolve: (value) => resolve(typeof value === 'boolean' ? value : value.confirmed),
      });
    });
  }, []);

  const showConfirmWithOptions = useCallback((options: ConfirmOptions): Promise<ConfirmResult> => {
    return new Promise((resolve) => {
      setDialog({
        type: "confirm",
        options,
        resolve: (value) => resolve(typeof value === 'boolean' ? { confirmed: value } : value),
      });
    });
  }, []);

  const handleClose = useCallback((result: boolean | ConfirmResult) => {
    if (dialog) {
      dialog.resolve(result);
      setDialog(null);
    }
  }, [dialog]);

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm, showConfirmWithOptions }}>
      {children}
      {dialog && (
        <DialogModal
          dialog={dialog}
          onClose={handleClose}
        />
      )}
    </AlertContext.Provider>
  );
}

// Dialog Modal Component
function DialogModal({
  dialog,
  onClose,
}: {
  dialog: DialogState;
  onClose: (result: boolean | ConfirmResult) => void;
}) {
  const { type, options } = dialog;
  const isConfirm = type === "confirm";
  const confirmOpts = options as ConfirmOptions;
  const alertOpts = options as AlertOptions;
  
  // Initialize checkbox state from defaults
  const [checkboxValues, setCheckboxValues] = useState<Record<string, boolean>>(() => {
    if (isConfirm && confirmOpts.checkboxes) {
      return confirmOpts.checkboxes.reduce((acc, cb) => {
        acc[cb.id] = cb.defaultChecked ?? false;
        return acc;
      }, {} as Record<string, boolean>);
    }
    return {};
  });

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose(false);
      } else if (e.key === "Enter" && !isConfirm) {
        onClose(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isConfirm]);

  // Determine icon and colors based on type
  const getIcon = () => {
    if (isConfirm) {
      const confirmType = confirmOpts.type || "info";
      switch (confirmType) {
        case "danger":
          return (
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          );
        case "warning":
          return (
            <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          );
        default:
          return (
            <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          );
      }
    } else {
      const alertType = alertOpts.type || "info";
      switch (alertType) {
        case "success":
          return (
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          );
        case "error":
          return (
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          );
        case "warning":
          return (
            <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          );
        default:
          return (
            <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          );
      }
    }
  };

  const getConfirmButtonStyle = () => {
    const confirmType = confirmOpts.type || "info";
    switch (confirmType) {
      case "danger":
        return "bg-red-600 hover:bg-red-500 text-white";
      case "warning":
        return "bg-yellow-600 hover:bg-yellow-500 text-white";
      default:
        return "bg-blue-600 hover:bg-blue-500 text-white";
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 transition-opacity"
        onClick={() => onClose(false)}
      />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md transform rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl transition-all">
          <div className="p-6">
            <div className="flex flex-col items-center text-center">
              {getIcon()}
              
              {options.title && (
                <h3 className="text-lg font-semibold text-white mb-2">
                  {options.title}
                </h3>
              )}
              
              <p className="text-zinc-300">
                {options.message}
              </p>
              
              {/* Checkboxes */}
              {isConfirm && confirmOpts.checkboxes && confirmOpts.checkboxes.length > 0 && (
                <div className="mt-4 w-full space-y-2">
                  {confirmOpts.checkboxes.map((cb) => (
                    <label key={cb.id} className="flex items-center gap-2 text-left cursor-pointer hover:bg-zinc-800/50 p-2 rounded-lg transition-colors">
                      <input
                        type="checkbox"
                        checked={checkboxValues[cb.id] ?? false}
                        onChange={(e) => setCheckboxValues(prev => ({ ...prev, [cb.id]: e.target.checked }))}
                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-zinc-900"
                      />
                      <span className="text-sm text-zinc-300">{cb.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Buttons */}
          <div className={`flex gap-3 p-4 border-t border-zinc-800 ${isConfirm ? 'justify-end' : 'justify-center'}`}>
            {isConfirm ? (
              <>
                <button
                  onClick={() => onClose({ confirmed: false, checkboxValues })}
                  className="px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  {confirmOpts.cancelText || "Cancel"}
                </button>
                <button
                  onClick={() => onClose({ confirmed: true, checkboxValues })}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${getConfirmButtonStyle()}`}
                  autoFocus
                >
                  {confirmOpts.confirmText || "Confirm"}
                </button>
              </>
            ) : (
              <button
                onClick={() => onClose(true)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
                autoFocus
              >
                OK
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AlertProvider;
