-- Review and apply separately. The application never creates tables at runtime.
CREATE TABLE IF NOT EXISTS market_history_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
