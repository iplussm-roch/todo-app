require("dotenv").config();

const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = 3000;

// PostgreSQL 연결
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: Number(process.env.PGPORT),
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// DB 연결 확인
pool.query("SELECT NOW()")
  .then(() => {
    console.log("PostgreSQL 연결 성공");
  })
  .catch((error) => {
    console.error("PostgreSQL 연결 실패:", error.message);
  });

// 할 일 전체 조회
app.get("/api/todos", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, text, completed FROM todos ORDER BY id ASC"
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
app.post("/api/todos", async (req, res) => {
  try {
    const text = req.body.text?.trim();

    if (!text) {
      return res.status(400).json({
        message: "할 일을 입력해주세요."
      });
    }

    const result = await pool.query(
      "INSERT INTO todos (text) VALUES ($1) RETURNING id, text, completed",
      [text]
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
app.patch("/api/todos/:id/completed", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { completed } = req.body;

    if (typeof completed !== "boolean") {
      return res.status(400).json({
        message: "completed 값이 올바르지 않습니다."
      });
    }

    const result = await pool.query(
      "UPDATE todos SET completed = $1 WHERE id = $2 RETURNING id, text, completed",
      [completed, id]
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

// 할 일 삭제
app.delete("/api/todos/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const result = await pool.query(
      "DELETE FROM todos WHERE id = $1 RETURNING id, text, completed",
      [id]
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
