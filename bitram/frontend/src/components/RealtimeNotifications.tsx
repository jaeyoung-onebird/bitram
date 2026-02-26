"use client";
import { useEffect, useRef, useCallback, useState } from "react";
import { useAuthStore } from "@/lib/store";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";

interface NotificationEvent {
  type: string;
  message: string;
  actor_nickname?: string;
  target_type?: string;
  target_id?: string;
}

interface RealtimeNotificationsProps {
  onNewNotification?: () => void;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || (typeof window !== "undefined" ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}` : "");

export default function RealtimeNotifications({ onNewNotification }: RealtimeNotificationsProps) {
  const { user, isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;

  const connect = useCallback(() => {
    if (!user?.id || !isAuthenticated) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) return;

    const connectWithToken = async () => {
      try {
        const { access_token } = await api.getWSToken();
        const wsUrl = `${WS_URL}/ws/notifications/${user.id}?token=${encodeURIComponent(access_token)}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          reconnectAttempts.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const data: NotificationEvent = JSON.parse(event.data);
            if (data.message) {
              toast(data.message, "info");
            }
            onNewNotification?.();
          } catch (err) {
            console.error("Failed to parse WS message:", err);
          }
        };

        ws.onclose = () => {
          setConnected(false);
          wsRef.current = null;

          // Attempt reconnect with backoff
          if (reconnectAttempts.current < maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
            reconnectAttempts.current++;
            reconnectTimeoutRef.current = setTimeout(connect, delay);
          }
        };

        ws.onerror = () => {
          // Will trigger onclose
        };
      } catch (err) {
        console.error("Failed to connect WebSocket:", err);
      }
    };
    connectWithToken();
  }, [user?.id, isAuthenticated, toast, onNewNotification]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // No visual output; this is a background connector
  return null;
}
