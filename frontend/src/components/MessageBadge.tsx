"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function MessageBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const fetchCount = async () => {
      try {
        const data = await api.getUnreadDMCount();
        if (mounted) setCount(data.count ?? 0);
      } catch {}
    };

    fetchCount();
    const id = setInterval(fetchCount, 30000);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  if (count <= 0) return null;

  return (
    <span className="min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center px-1">
      {count > 99 ? "99+" : count}
    </span>
  );
}
