// ─── User ────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  nickname: string;
  plan: "free" | "basic" | "pro" | "premium" | "admin";
  email_verified: boolean;
  role: string;
  avatar_url: string | null;
  bio: string | null;
  social_links: Record<string, string> | null;
  telegram_chat_id: string | null;
  created_at: string;
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

// ─── Exchange Key ────────────────────────────────────────────────────────────
export interface ExchangeKey {
  id: string;
  exchange: string;
  label: string;
  is_valid: boolean;
  last_verified_at: string | null;
  created_at: string;
}

// ─── Strategy ────────────────────────────────────────────────────────────────
export interface StrategyCondition {
  indicator: string;
  params: Record<string, number>;
  output_key?: string;
  operator: string;
  value: number | { indicator: string; params: Record<string, number>; output_key?: string };
}

export interface StrategyAction {
  type: "market_buy" | "limit_buy" | "market_sell" | "limit_sell";
  amount_type: "percent" | "fixed";
  amount: number;
}

export interface StrategySafety {
  stop_loss: number;
  take_profit: number;
  max_position: number;
}

export interface StrategyConfig {
  conditions: StrategyCondition[];
  conditions_logic: "AND" | "OR";
  action: StrategyAction;
  safety: StrategySafety;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  pair: string;
  timeframe: string;
  config_json: StrategyConfig;
  is_public: boolean;
  backtest_result: BacktestResult | null;
  copy_count: number;
  user_nickname?: string;
  created_at: string;
  updated_at: string;
}

// ─── Indicator ───────────────────────────────────────────────────────────────
export interface IndicatorDef {
  name: string;
  category: "trend" | "momentum" | "volatility" | "volume" | "price";
  params: string[];
  multi_output: boolean;
}

// ─── Backtest ────────────────────────────────────────────────────────────────
export interface BacktestResult {
  total_return_pct: number;
  benchmark_return_pct: number;
  total_trades: number;
  win_trades: number;
  lose_trades: number;
  win_rate: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  profit_factor: number;
  avg_profit_pct: number;
  avg_loss_pct: number;
  avg_holding_bars: number;
  equity_curve: { time: string; equity: number; price: number }[];
  trades: BacktestTrade[];
  start_date: string;
  end_date: string;
  total_bars: number;
}

export interface BacktestTrade {
  entry_time: string;
  exit_time: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  profit: number;
  profit_pct: number;
  holding_bars: number;
  reason: string;
}

// ─── Bot ─────────────────────────────────────────────────────────────────────
export interface Bot {
  id: string;
  name: string;
  strategy_id: string | null;
  strategy_name: string | null;
  status: "idle" | "running" | "paused" | "error" | "stopped";
  pair: string | null;
  max_investment: number;
  total_profit: number;
  total_trades: number;
  win_trades: number;
  win_rate: number;
  error_message: string | null;
  started_at: string | null;
  created_at: string;
}

// ─── Trade ───────────────────────────────────────────────────────────────────
export interface Trade {
  id: string;
  side: "buy" | "sell";
  pair: string;
  price: number;
  quantity: number;
  total_krw: number;
  fee: number;
  profit: number | null;
  profit_pct: number | null;
  trigger_reason: string | null;
  executed_at: string;
}

// ─── Community ───────────────────────────────────────────────────────────────
export interface Author {
  id: string;
  nickname: string;
  plan: string;
  level?: number;
  level_name?: string;
  avatar_url?: string | null;
  bio?: string | null;
}

export interface Post {
  id: string;
  author: Author;
  category: "strategy" | "profit" | "question" | "free";
  title: string;
  content: string;
  strategy_id: string | null;
  strategy_name: string | null;
  verified_profit: Record<string, unknown> | null;
  like_count: number;
  comment_count: number;
  view_count: number;
  is_liked: boolean;
  is_bookmarked: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface PostListItem {
  id: string;
  author: Author;
  category: string;
  title: string;
  excerpt?: string;
  thumbnail_url?: string;
  like_count: number;
  comment_count: number;
  view_count: number;
  has_strategy: boolean;
  verified_profit_pct: number | null;
  is_pinned: boolean;
  created_at: string;
}

export interface Comment {
  id: string;
  author: Author;
  content: string;
  like_count: number;
  is_liked: boolean;
  parent_id: string | null;
  created_at: string;
}

// ─── User Profile ────────────────────────────────────────────────────────────
export interface BadgeInfo {
  type: string;
  label: string;
}

export interface UserProfile {
  id: string;
  nickname: string;
  plan: string;
  level: number;
  level_name: string;
  total_points: number;
  next_level_name: string | null;
  next_threshold: number | null;
  post_count: number;
  total_likes_received: number;
  total_comments: number;
  shared_strategies_count: number;
  total_copy_count: number;
  badges: BadgeInfo[];
  follower_count: number;
  following_count: number;
  is_following: boolean;
  recent_posts: PostListItem[];
  joined_at: string;
}

// ─── Notification ───────────────────────────────────────────────────────────
export interface Notification {
  id: string;
  type: string;
  message: string;
  actor_nickname: string | null;
  target_type: string | null;
  target_id: string | null;
  is_read: boolean;
  created_at: string;
}

// ─── Search ─────────────────────────────────────────────────────────────────
export interface UserSearchResult {
  id: string;
  nickname: string;
  plan: string;
  post_count: number;
  joined_at: string;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export interface DashboardOverview {
  bots: { total: number; active: number; paused: number; error: number };
  performance: { total_profit: number; total_trades: number; win_rate: number };
  recent_trades: { id: string; side: string; pair: string; price: number; profit: number | null; executed_at: string }[];
  plan: string;
}

export interface TopTrader {
  rank: number;
  user_id: string;
  nickname: string;
  plan: string;
  total_profit: number;
  trade_count: number;
  win_rate: number;
  is_following?: boolean;
}

export interface HotStrategy {
  rank: number;
  strategy_id: string;
  post_id: string;
  name: string;
  pair: string;
  timeframe: string;
  copy_count: number;
  return_pct: number | null;
  author: string;
  author_id: string;
}

export interface FeedItem {
  type: "profit" | "strategy" | "question" | "post";
  message: string;
  title: string;
  post_id: string;
  nickname: string;
  like_count: number;
  comment_count: number;
  created_at: string;
}

export interface StrategyRankingItem {
  post_id: string;
  title: string;
  author: string;
  author_id: string;
  verified_profit: Record<string, unknown> | null;
  like_count: number;
  comment_count: number;
  copy_count: number;
  ranking_score: number;
  author_total_bot_profit: number | null;
}

export interface TrendingPost {
  id: string;
  author: Author;
  category: string;
  title: string;
  like_count: number;
  comment_count: number;
  view_count: number;
  has_strategy: boolean;
  verified_profit_pct: number | null;
  engagement_score: number;
  created_at: string;
}

export interface PlatformStats {
  total_users: number;
  total_strategies: number;
  active_bots: number;
  total_trades: number;
}

// ─── Market ────────────────────────────────────────────────────────────────
export interface MarketQuote {
  market: string;
  symbol: string;
  trade_price: number;
  signed_change_rate_pct: number;
  change: string;
  acc_trade_volume_24h: number;
  timestamp: number | null;
}

// ─── External Feeds ────────────────────────────────────────────────────────
export interface ExternalFeedItem {
  source: string;
  title: string;
  title_ko: string;
  summary?: string;
  summary_ko?: string;
  url: string;
  published_at: string;
  published_ts?: number | null;
}

// ─── AI Strategy ────────────────────────────────────────────────────────────
export interface AIStrategyBacktest {
  total_return_pct: number;
  win_rate: number;
  total_trades: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  profit_factor: number;
}

export interface AIStrategyResult {
  name: string;
  description: string;
  config_json: StrategyConfig;
  backtest: AIStrategyBacktest;
}

export interface AIGenerateResponse {
  pair: string;
  timeframe: string;
  style: string;
  provider?: string;
  strategies: AIStrategyResult[];
  total_generated: number;
  profitable_count: number;
}

// ─── Points & Level ─────────────────────────────────────────────────────────
export interface UserPointsInfo {
  total_points: number;
  level: number;
  level_name: string;
  next_level: number | null;
  next_level_name: string | null;
  points_needed: number;
  next_threshold: number | null;
  login_streak: number;
  last_login_date: string | null;
}

export interface PointLogItem {
  id: string;
  action: string;
  points: number;
  description: string;
  created_at: string;
}

export interface PointLeaderboardItem {
  rank: number;
  user_id: string;
  nickname: string;
  total_points: number;
  level: number;
  level_name: string;
}

// ─── Onboarding ─────────────────────────────────────────────────────────────
export interface OnboardingStatus {
  steps: {
    first_strategy: boolean;
    first_backtest: boolean;
    first_post: boolean;
    first_follow: boolean;
    api_key_added: boolean;
  };
  completed: number;
  total: number;
}

// ─── Referral ───────────────────────────────────────────────────────────────
export interface ReferralInfo {
  code: string;
  link: string;
}

export interface ReferralStats {
  total_referrals: number;
  rewarded: number;
  code: string;
}

// ─── Marketplace ────────────────────────────────────────────────────────────
export interface MarketplaceStrategy {
  id: string;
  name: string;
  description: string;
  pair: string;
  timeframe: string;
  is_public: boolean;
  copy_count: number;
  author_nickname: string;
  author_id: string;
  backtest_summary: {
    total_return_pct: number | null;
    win_rate: number | null;
    total_trades: number | null;
    max_drawdown_pct: number | null;
  } | null;
  created_at: string;
}

export interface MarketplaceResponse {
  items: MarketplaceStrategy[];
  total: number;
  page: number;
  size: number;
}

// ─── Competition ────────────────────────────────────────────────────────────
export interface Competition {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  status: "upcoming" | "active" | "ended";
  prize_description: string;
  max_participants: number;
  participant_count: number;
  created_at: string;
}

export interface CompetitionLeaderboardItem {
  rank: number;
  user_id: string;
  nickname: string;
  profit_krw: number;
  trade_count: number;
  joined_at: string;
}

// ─── Follow Feed ────────────────────────────────────────────────────────────
export interface FollowFeedItem {
  type: "new_post" | "strategy_shared" | "profit_verified";
  post_id: string;
  title: string;
  category: string;
  author: Author;
  like_count: number;
  comment_count: number;
  verified_profit_pct: number | null;
  created_at: string;
}

// ─── Community Board ────────────────────────────────────────────────────────
export interface CommunityBoard {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  icon_url: string | null;
  coin_pair: string | null;
  coin_symbol: string | null;
  member_count: number;
  post_count: number;
  is_joined: boolean;
}

// ─── Reaction ──────────────────────────────────────────────────────────────
export interface ReactionCount {
  emoji: string;
  count: number;
  reacted: boolean;
}

// ─── DM ────────────────────────────────────────────────────────────────────
export interface Conversation {
  id: string;
  other_user: {
    id: string;
    nickname: string;
    avatar_url: string | null;
  };
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at?: string;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

// ─── Notification Preferences ──────────────────────────────────────────────
export interface NotificationPreferences {
  email_on_like: boolean;
  email_on_comment: boolean;
  email_on_follow: boolean;
  email_on_dm: boolean;
  email_weekly_digest: boolean;
}

// ─── Moderation ────────────────────────────────────────────────────────────
export interface ModerationQueueItem {
  id: string;
  reporter: string;
  target_type: string;
  target_id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
}

export interface ModerationActionItem {
  id: string;
  moderator: string;
  action_type: string;
  target_type: string;
  target_id: string;
  reason: string;
  created_at: string;
}

// ─── Attendance ──────────────────────────────────────────────────────────────
export interface AttendanceStatus {
  streak: number;
  checked_today: boolean;
  total_this_month: number;
  checked_dates: string[];
}

export interface AttendanceCheckInResult {
  points: number;
  streak: number;
  bonus: number;
  checked_dates: string[];
}

// ─── Daily Quest ─────────────────────────────────────────────────────────────
export interface DailyQuest {
  id: string;
  title: string;
  description: string;
  target: number;
  current: number;
  points: number;
  claimed: boolean;
}

// ─── Level Info ──────────────────────────────────────────────────────────────
export interface LevelInfo {
  level: number;
  color: string;
  perks: string[];
  points_current: number;
  points_next: number | null;
  progress: number;
}

// ─── Post Series ─────────────────────────────────────────────────────────────
export interface PostSeriesItem {
  id: string;
  title: string;
  description: string;
  cover_image_url: string | null;
  post_count: number;
  subscriber_count: number;
  is_complete: boolean;
  author: { id: string; nickname: string; level: number };
}

export interface SeriesDetail {
  id: string;
  title: string;
  description: string;
  cover_image_url: string | null;
  post_count: number;
  subscriber_count: number;
  is_complete: boolean;
  is_subscribed: boolean;
  author: { id: string; nickname: string; level: number };
  posts: PostListItem[];
}

// ─── Public Profile ──────────────────────────────────────────────────────────
export interface PublicProfile {
  nickname: string;
  avatar_url: string | null;
  bio: string | null;
  social_links: Record<string, string> | null;
  level: number;
  level_name: string;
  level_color: string;
  badges: Array<{ type: string; label: string; awarded_at: string }>;
  recent_posts: PostListItem[];
  stats: { post_count: number; follower_count: number; following_count: number; total_likes: number };
  join_date: string;
  is_following: boolean;
}

// ─── Admin ───────────────────────────────────────────────────────────────────
export interface AdminOverview {
  counts: {
    users_total: number;
    users_7d: number;
    posts_total: number;
    comments_total: number;
    strategies_total: number;
    bots_total: number;
    active_bots: number;
    trades_total: number;
    trades_7d: number;
  };
  recent_users: Array<{
    id: string;
    email: string;
    nickname: string;
    plan: string;
    created_at: string;
  }>;
  recent_posts: Array<{
    id: string;
    title: string;
    category: string;
    author: string;
    created_at: string;
  }>;
}
