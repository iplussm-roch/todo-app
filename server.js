require("dotenv").config();

const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET가 .env에 설정되어 있지 않습니다.");
}

// PostgreSQL 연결
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
    })
  : new Pool({
      user: process.env.PGUSER,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      password: process.env.PGPASSWORD,
      port: Number(process.env.PGPORT),
    });

app.set("trust proxy", 1);
app.use(express.json());

app.use(session({
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}));

app.use(express.static(path.join(__dirname, "public")));

// DB 연결 확인
pool.query("SELECT NOW()")
  .then(() => {
    console.log("PostgreSQL 연결 성공");
  })
  .catch((error) => {
    console.error("PostgreSQL 연결 실패:", error.message);
  });

async function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      message: "로그인이 필요합니다."
    });
  }

  try {
    const result = await pool.query(
      "SELECT id, email FROM users WHERE id = $1",
      [req.session.userId]
    );

    if (result.rows.length === 0) {
      req.session.destroy(() => {});

      return res.status(401).json({
        message: "로그인이 필요합니다."
      });
    }

    req.authUser = result.rows[0];
    next();
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "사용자 확인 실패"
    });
  }
}

function validatePassword(password) {
  if (!password) {
    return "비밀번호를 입력해주세요.";
  }

  if (password.length < 8) {
    return "비밀번호는 8자 이상이어야 합니다.";
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    return "비밀번호가 너무 깁니다.";
  }

  return null;
}

function validateCredentials(email, password) {
  if (!email || !password) {
    return "이메일과 비밀번호를 입력해주세요.";
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return "올바른 이메일 형식을 입력해주세요.";
  }

  return validatePassword(password);
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

// 회원가입
app.post("/api/auth/register", async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    const validationError = validateCredentials(email, password);

    if (validationError) {
      return res.status(400).json({
        message: validationError
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, passwordHash]
    );

    const user = result.rows[0];

    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.email = user.email;

    res.status(201).json({
      user
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "이미 가입된 이메일입니다."
      });
    }

    console.error(error);

    res.status(500).json({
      message: "회원가입 실패"
    });
  }
});

// 로그인
app.post("/api/auth/login", async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({
        message: "이메일과 비밀번호를 입력해주세요."
      });
    }

    const result = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "이메일 또는 비밀번호가 올바르지 않습니다."
      });
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({
        message: "이메일 또는 비밀번호가 올바르지 않습니다."
      });
    }

    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.email = user.email;

    res.json({
      user: {
        id: user.id,
        email: user.email
      }
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "로그인 실패"
    });
  }
});

// 현재 로그인 사용자 확인
app.get("/api/auth/me", async (req, res) => {
  if (!req.session.userId) {
    return res.json({
      user: null
    });
  }

  try {
    const result = await pool.query(
      "SELECT id, email FROM users WHERE id = $1",
      [req.session.userId]
    );

    if (result.rows.length === 0) {
      req.session.destroy(() => {});

      return res.json({
        user: null
      });
    }

    res.json({
      user: result.rows[0]
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "사용자 확인 실패"
    });
  }
});

// 로그아웃
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error(error);

      return res.status(500).json({
        message: "로그아웃 실패"
      });
    }

    res.clearCookie("connect.sid");
    res.json({
      message: "로그아웃되었습니다."
    });
  });
});

// 비밀번호 변경
app.patch("/api/account/password", requireAuth, async (req, res) => {
  try {
    const currentPassword = req.body.currentPassword;
    const newPassword = req.body.newPassword;

    if (!currentPassword) {
      return res.status(400).json({
        message: "현재 비밀번호를 입력해주세요."
      });
    }

    const passwordValidationError = validatePassword(newPassword);

    if (passwordValidationError) {
      return res.status(400).json({
        message: passwordValidationError
      });
    }

    const result = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.authUser.id]
    );

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      result.rows[0].password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "현재 비밀번호가 올바르지 않습니다."
      });
    }

    const samePassword = await bcrypt.compare(
      newPassword,
      result.rows[0].password_hash
    );

    if (samePassword) {
      return res.status(400).json({
        message: "새 비밀번호는 현재 비밀번호와 다르게 설정해주세요."
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [newPasswordHash, req.authUser.id]
    );

    await pool.query(
      "DELETE FROM user_sessions WHERE sid <> $1 AND sess->>'userId' = $2",
      [req.sessionID, String(req.authUser.id)]
    );

    res.json({
      message: "비밀번호가 변경되었습니다."
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "비밀번호 변경 실패"
    });
  }
});

// 회원 탈퇴
app.delete("/api/account", requireAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    const password = req.body.password;

    if (!password) {
      return res.status(400).json({
        message: "비밀번호를 입력해주세요."
      });
    }

    const result = await client.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.authUser.id]
    );

    const passwordMatches = await bcrypt.compare(
      password,
      result.rows[0].password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "비밀번호가 올바르지 않습니다."
      });
    }

    await client.query("BEGIN");

    await client.query(
      "DELETE FROM user_sessions WHERE sess->>'userId' = $1",
      [String(req.authUser.id)]
    );

    await client.query(
      "DELETE FROM users WHERE id = $1",
      [req.authUser.id]
    );

    await client.query("COMMIT");

    try {
      await destroySession(req);
    } catch (sessionError) {
      console.error("세션 정리 실패:", sessionError.message);
    }

    res.clearCookie("connect.sid");

    res.json({
      message: "회원 탈퇴가 완료되었습니다."
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    res.status(500).json({
      message: "회원 탈퇴 실패"
    });
  } finally {
    client.release();
  }
});

// 할 일 전체 조회
app.get("/api/todos", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, text, completed FROM todos WHERE user_id = $1 ORDER BY id ASC",
      [req.authUser.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "데이터 조회 실패"
    });
  }
});

// 할 일 추가
app.post("/api/todos", requireAuth, async (req, res) => {
  try {
    const text = req.body.text?.trim();

    if (!text) {
      return res.status(400).json({
        message: "할 일을 입력해주세요."
      });
    }

    const result = await pool.query(
      "INSERT INTO todos (text, user_id) VALUES ($1, $2) RETURNING id, text, completed",
      [text, req.authUser.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "데이터 저장 실패"
    });
  }
});

// 완료 상태 변경
app.patch("/api/todos/:id/completed", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { completed } = req.body;

    if (typeof completed !== "boolean") {
      return res.status(400).json({
        message: "completed 값이 올바르지 않습니다."
      });
    }

    const result = await pool.query(
      "UPDATE todos SET completed = $1 WHERE id = $2 AND user_id = $3 RETURNING id, text, completed",
      [completed, id, req.authUser.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "할 일을 찾을 수 없습니다."
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "완료 상태 변경 실패"
    });
  }
});

// 할 일 내용 수정
app.patch("/api/todos/:id/text", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const text = req.body.text?.trim();

    if (!text) {
      return res.status(400).json({
        message: "수정할 내용을 입력해주세요."
      });
    }

    const result = await pool.query(
      "UPDATE todos SET text = $1 WHERE id = $2 AND user_id = $3 RETURNING id, text, completed",
      [text, id, req.authUser.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "할 일을 찾을 수 없습니다."
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "할 일 수정 실패"
    });
  }
});

// 할 일 삭제
app.delete("/api/todos/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const result = await pool.query(
      "DELETE FROM todos WHERE id = $1 AND user_id = $2 RETURNING id, text, completed",
      [id, req.authUser.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "할 일을 찾을 수 없습니다."
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "데이터 삭제 실패"
    });
  }
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
