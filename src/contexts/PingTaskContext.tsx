import React from "react";
import { fetchJSON } from "@/lib/fetchJSON";

export interface PingTask {
  clients?: string[];
  default_on?: boolean;
  id?: number;
  interval?: number;
  target?: string;
  type?: string;
  [property: string]: any;
}

interface Response {
  data: PingTask[];
  message: string;
  status: string;
  [property: string]: any;
}

interface PingTaskContextType {
  pingTasks: PingTask[] | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

const PingTaskContext = React.createContext<PingTaskContextType | undefined>(
  undefined
);

export const PingTaskProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [pingTasks, setPingTasks] = React.useState<PingTask[] | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const request = React.useRef<AbortController | null>(null);

  const refresh = React.useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setIsLoading(true);
    setError(null);
    return fetchJSON<Response>("/api/admin/ping", 12000, controller.signal)
      .then((resp: Response) => {
        if (controller.signal.aborted) return;
        if (resp && Array.isArray(resp.data)) {
          setPingTasks(resp.data);
        } else {
          setPingTasks([]);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err.message || "An error occurred while fetching ping tasks");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
  }, []);

  React.useEffect(() => {
    void refresh();
    return () => request.current?.abort();
  }, [refresh]);

  const value = React.useMemo(() => ({ pingTasks, isLoading, error, refresh }), [pingTasks, isLoading, error, refresh]);

  return (
    <PingTaskContext.Provider value={value}>
      {children}
    </PingTaskContext.Provider>
  );
};

export const usePingTask = () => {
  const context = React.useContext(PingTaskContext);
  if (!context) {
    throw new Error("usePingTask must be used within a PingTaskProvider");
  }
  return context;
};
