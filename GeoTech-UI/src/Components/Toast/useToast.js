import { useCallback, useState } from "react";

let seq = 1;

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const push = useCallback(
    (message, type = "info") => {
      const id = seq++;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => dismiss(id), 4500);
      return id;
    },
    [dismiss]
  );
  return { toasts, push, dismiss };
}
