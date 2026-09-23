import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNodeList } from "@/contexts/NodeListContext";
import { useRPC2Call } from "@/contexts/RPC2Context";
import type { TerminalClient } from "./terminalTypes";

// The workbench uses the panel's live presence, never a saved node list or
// last-report timestamp, to decide which nodes may open new connections.
export function useOnlineTerminalClients() {
  const { nodeList, isLoading, error: nodeError, refresh: refreshNodes } = useNodeList()!;
  const { call } = useRPC2Call();
  const [online, setOnline] = useState<Set<string> | null>(null);
  const [statusError, setStatusError] = useState(false);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | null = null;
    const refresh = async () => {
      if (stopped || document.hidden || controller) return;
      const request = new AbortController();
      controller = request;
      try {
        const statuses = await call<undefined, Record<string, { online?: boolean }>>(
          "common:getNodesLatestStatus", undefined, { signal: request.signal, timeout: 8000 },
        );
        if (stopped || request.signal.aborted) return;
        const next = new Set(Object.entries(statuses).filter(([, value]) => value?.online === true).map(([uuid]) => uuid));
        setOnline(previous => previous && previous.size === next.size && [...next].every(uuid => previous.has(uuid)) ? previous : next);
        setStatusError(false);
      } catch {
        if (stopped || request.signal.aborted) return;
        // Do not offer connections based on stale online state after a failed read.
        setOnline(new Set());
        setStatusError(true);
      } finally {
        if (controller === request) controller = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        controller?.abort();
        controller = null;
      } else {
        // Hide the old list until the first fresh response after returning.
        setOnline(null);
        void refresh();
      }
    };
    refreshRef.current = () => { void refresh(); };
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      refreshRef.current = () => {};
    };
  }, [call]);

  const clients = useMemo<TerminalClient[]>(() =>
    !nodeError && !statusError && online ? (nodeList ?? []).filter(node => online.has(node.uuid)) : [],
  [nodeList, online, nodeError, statusError]);
  const refreshClients = useCallback(() => { void refreshNodes(); refreshRef.current(); }, [refreshNodes]);
  return { clients, clientsLoading: isLoading || online === null, clientsError: Boolean(nodeError) || statusError, refreshClients };
}
