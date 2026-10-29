import { toast } from "sonner";

import { errorMessage } from "@/lib/api/errors";

/**
 * Shows an error toast. `id` deduplicates: a failing 60s poll updates one toast
 * instead of stacking a new one every minute.
 */
export function notifyError(error: unknown, id?: string, title?: string): void {
  const message = errorMessage(error);
  if (title) {
    toast.error(title, { id, description: message });
  } else {
    toast.error(message, { id });
  }
}
