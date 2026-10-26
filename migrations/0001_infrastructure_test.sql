-- Apply only after explicit approval. Leaves existing tables and rows intact.
CREATE TABLE IF NOT EXISTS infrastructure_test (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  message TEXT NOT NULL
);
