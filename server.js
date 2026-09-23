require("dotenv").config();

const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);

const app = express();
const PORT = 3000;

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET가 .env에 설정되어 있지 않습니다.");
}

// PostgreSQL 연결
const pool = new Pool({
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

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      message: "로그인이 필요합니다."
    });
  }

  next();
}

function validateCredentials(email, password) {
  if (!email || !password) {
    return "이메일과 비밀번호를 입력해주세요.";
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return "올바른 이메일 형식을 입력해주세요.";
  }

  if (password.length < 8) {
    return "비밀번호는 8자 이상이어야 합니다.";
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    return "비밀번호가 너무 깁니다.";
  }

  return null;
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
app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({
      user: null
    });
  }

  res.json({
    user: {
      id: req.session.userId,
      email: req.session.email
    }
  });
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

// 할 일 전체 조회
app.get("/api/todos", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, text, completed FROM todos WHERE user_id = $1 ORDER BY id ASC",
      [req.session.userId]
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
      [text, req.session.userId]
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
      [completed, id, req.session.userId]
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
      [text, id, req.session.userId]
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
      [id, req.session.userId]
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
