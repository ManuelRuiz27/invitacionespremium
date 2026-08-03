export interface AdminUnauthorizedController {
  notify(): void;
  subscribe(listener: () => void): () => void;
}

export function createAdminUnauthorizedController(): AdminUnauthorizedController {
  let listener: (() => void) | null = null;
  return {
    notify: () => listener?.(),
    subscribe: (nextListener) => {
      listener = nextListener;
      return () => {
        if (listener === nextListener) listener = null;
      };
    }
  };
}
