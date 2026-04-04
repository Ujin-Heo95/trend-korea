-- 025: User profiles for community features (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY,                    -- matches Supabase auth.users.id
  nickname VARCHAR(30) NOT NULL,
  avatar_url TEXT,
  karma INTEGER NOT NULL DEFAULT 0,
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_nickname
  ON user_profiles (LOWER(nickname));
