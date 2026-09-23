-- 로그인 기능용 데이터베이스 구조
-- pgAdmin의 todo_db Query Tool에서 실행하세요.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE todos
ADD COLUMN IF NOT EXISTS user_id INTEGER;

ALTER TABLE todos
DROP CONSTRAINT IF EXISTS todos_user_id_fkey;

ALTER TABLE todos
ADD CONSTRAINT todos_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES users(id)
ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_todos_user_id
ON todos(user_id);

-- 기존 Todo 데이터는 삭제하지 않습니다.
-- 다만 user_id가 NULL인 기존 Todo는 로그인한 사용자 목록에는 표시되지 않습니다.
