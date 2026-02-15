"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { CommunityBoard } from "@/types";

export default function BoardsPage() {
  const [communities, setCommunities] = useState<CommunityBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    api
      .getCommunities()
      .then(setCommunities)
      .catch((err) => console.error("Failed to fetch communities:", err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return communities;
    const q = searchQuery.trim().toLowerCase();
    return communities.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.coin_symbol && c.coin_symbol.toLowerCase().includes(q))
    );
  }, [communities, searchQuery]);

  const handleJoinToggle = async (community: CommunityBoard) => {
    if (joiningId) return;
    setJoiningId(community.id);
    try {
      if (community.is_joined) {
        await api.leaveCommunity(community.slug);
      } else {
        await api.joinCommunity(community.slug);
      }
      setCommunities((prev) =>
        prev.map((c) =>
          c.id === community.id
            ? {
                ...c,
                is_joined: !c.is_joined,
                member_count: c.is_joined
                  ? c.member_count - 1
                  : c.member_count + 1,
              }
            : c
        )
      );
    } catch (err) {
      console.error("Failed to toggle join:", err);
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/community"
            className="text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold">게시판 목록</h1>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="게시판 검색..."
          className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Board Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-slate-500 dark:text-slate-400">로딩 중...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-500 dark:text-slate-400">
          <p className="text-lg mb-2">
            {searchQuery ? "검색 결과가 없습니다" : "게시판이 없습니다"}
          </p>
          {searchQuery && (
            <p className="text-sm">다른 키워드로 검색해보세요.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map((community) => (
            <div
              key={community.id}
              className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 rounded-xl shadow-sm hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md transition group flex flex-col"
            >
              <Link
                href={`/community/boards/${community.slug}`}
                className="flex-1 p-3 sm:p-4"
              >
                {/* Icon / Emoji / Coin Symbol */}
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <span className="text-lg sm:text-xl">
                      {community.icon ||
                        community.coin_pair ||
                        community.name.charAt(0)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100 group-hover:text-blue-500 transition truncate">
                      {community.name}
                    </h3>
                    {community.coin_pair && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {community.coin_pair}
                      </span>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3 min-h-[2.5em]">
                  {community.description}
                </p>

                {/* Stats */}
                <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                  <div className="flex items-center gap-1">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    <span>{community.member_count.toLocaleString()}명</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                      />
                    </svg>
                    <span>{community.post_count.toLocaleString()}개</span>
                  </div>
                </div>
              </Link>

              {/* Join Button */}
              <div className="px-3 sm:px-4 pb-3 sm:pb-4">
                <button
                  onClick={() => handleJoinToggle(community)}
                  disabled={joiningId === community.id}
                  className={`w-full py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    community.is_joined
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      : "bg-blue-500 hover:bg-blue-600 text-white"
                  }`}
                >
                  {joiningId === community.id
                    ? "처리 중..."
                    : community.is_joined
                    ? "가입됨"
                    : "가입하기"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
