import { useCallback } from "react";

declare global {
  interface Window {
    shopify?: {
      toast: {
        show: (message: string, options?: { duration?: number; isError?: boolean }) => void;
      };
    };
  }
}

export function useToast() {
  const show = useCallback((message: string, isError = false) => {
    if (typeof window !== "undefined" && window.shopify?.toast) {
      window.shopify.toast.show(message, { isError });
    }
  }, []);

  return { show };
}
