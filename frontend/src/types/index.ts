// ─── User ────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  nickname: string;
  plan: "free" | "basic" | "pro" | "premium";
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
  parent_id: string | null;
  created_at: string;
}

// ─── User Profile ────────────────────────────────────────────────────────────
export interface UserProfile {
  id: string;
  nickname: string;
  post_count: number;
  total_likes: number;
  total_comments: number;
  strategy_count: number;
  total_copies: number;
  recent_posts: PostListItem[];
  joined_at: string;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export interface DashboardOverview {
  bots: { total: number; active: number; paused: number; error: number };
  performance: { total_profit: number; total_trades: number; win_rate: number };
  recent_trades: { id: string; side: string; pair: string; price: number; profit: number | null; executed_at: string }[];
  plan: string;
}
