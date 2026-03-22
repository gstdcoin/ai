/**
 * Toast notification system using Sonner
 * Provides a centralized way to show notifications
 */

import { toast as sonnerToast, type ExternalToast } from 'sonner';

type ToastOptions = { id?: string | number; description?: string };

export const toast = {
  success: (message: string, opts?: string | ToastOptions) => {
    const options: ExternalToast = typeof opts === 'string'
      ? { description: opts, duration: 4000 }
      : { description: opts?.description, id: opts?.id, duration: 4000 };
    sonnerToast.success(message, options);
  },

  error: (message: string, opts?: string | ToastOptions) => {
    const options: ExternalToast = typeof opts === 'string'
      ? { description: opts, duration: 5000 }
      : { description: opts?.description, id: opts?.id, duration: 5000 };
    sonnerToast.error(message, options);
  },

  warning: (message: string, opts?: string | ToastOptions) => {
    const options: ExternalToast = typeof opts === 'string'
      ? { description: opts, duration: 4000 }
      : { description: opts?.description, id: opts?.id, duration: 4000 };
    sonnerToast.warning(message, options);
  },

  info: (message: string, opts?: string | ToastOptions) => {
    const options: ExternalToast = typeof opts === 'string'
      ? { description: opts, duration: 3000 }
      : { description: opts?.description, id: opts?.id, duration: 3000 };
    sonnerToast.info(message, options);
  },

  loading: (message: string, opts?: ToastOptions) => {
    return sonnerToast.loading(message, { id: opts?.id });
  },

  dismiss: (id?: string | number) => {
    sonnerToast.dismiss(id);
  },

  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    }
  ) => {
    return sonnerToast.promise(promise, messages);
  },
};

