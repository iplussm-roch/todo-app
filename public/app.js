const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const loginButton = document.getElementById("loginButton");
const registerButton = document.getElementById("registerButton");
const logoutButton = document.getElementById("logoutButton");
const changePasswordButton = document.getElementById("changePasswordButton");
const deleteAccountButton = document.getElementById("deleteAccountButton");
const authMessage = document.getElementById("authMessage");
const authSection = document.getElementById("authSection");
const todoSection = document.getElementById("todoSection");
const userEmail = document.getElementById("userEmail");

const todoInput = document.getElementById("todoInput");
const addButton = document.getElementById("addButton");
const todoList = document.getElementById("todoList");

function showAuthMessage(message) {
  authMessage.textContent = message;
}

function showLoggedOut() {
  authSection.classList.remove("hidden");
  todoSection.classList.add("hidden");
  userEmail.textContent = "";
  todoList.innerHTML = "";
}

function showLoggedIn(user) {
  authSection.classList.add("hidden");
  todoSection.classList.remove("hidden");
  userEmail.textContent = user.email;
  showAuthMessage("");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "요청 처리 중 오류가 발생했습니다.");
  }

  return data;
}

async function checkAuth() {
  const data = await requestJson("/api/auth/me");

  if (!data.user) {
    showLoggedOut();
    return;
  }

  showLoggedIn(data.user);
  await loadTodos();
}

async function register() {
  try {
    const data = await requestJson("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: emailInput.value.trim(),
        password: passwordInput.value
      })
    });

    passwordInput.value = "";
    showLoggedIn(data.user);
    await loadTodos();
  } catch (error) {
    showAuthMessage(error.message);
  }
}

async function login() {
  try {
    const data = await requestJson("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: emailInput.value.trim(),
        password: passwordInput.value
      })
    });

    passwordInput.value = "";
    showLoggedIn(data.user);
    await loadTodos();
  } catch (error) {
    showAuthMessage(error.message);
  }
}

async function logout() {
  try {
    await requestJson("/api/auth/logout", {
      method: "POST"
    });

    showLoggedOut();
  } catch (error) {
    alert(error.message);
  }
}

async function changePassword() {
  const currentPassword = prompt("현재 비밀번호를 입력하세요.");

  if (currentPassword === null) {
    return;
  }

  const newPassword = prompt("새 비밀번호를 입력하세요. (8자 이상)");

  if (newPassword === null) {
    return;
  }

  const confirmPassword = prompt("새 비밀번호를 한 번 더 입력하세요.");

  if (confirmPassword === null) {
    return;
  }

  if (newPassword !== confirmPassword) {
    alert("새 비밀번호가 서로 일치하지 않습니다.");
    return;
  }

  try {
    const data = await requestJson("/api/account/password", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    });

    alert(data.message);
  } catch (error) {
    alert(error.message);
  }
}

async function deleteAccount() {
  const confirmed = confirm(
    "정말 회원 탈퇴하시겠습니까?\n내 Todo 데이터도 함께 삭제되며 되돌릴 수 없습니다."
  );

  if (!confirmed) {
    return;
  }

  const password = prompt("회원 탈퇴를 위해 현재 비밀번호를 입력하세요.");

  if (password === null) {
    return;
  }

  try {
    const data = await requestJson("/api/account", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        password
      })
    });

    alert(data.message);
    emailInput.value = "";
    passwordInput.value = "";
    showLoggedOut();
  } catch (error) {
    alert(error.message);
  }
}

async function loadTodos() {
  try {
    const todos = await requestJson("/api/todos");
    renderTodos(todos);
  } catch (error) {
    if (error.message === "로그인이 필요합니다.") {
      showLoggedOut();
      return;
    }

    alert(error.message);
  }
}

function renderTodos(todos) {
  todoList.innerHTML = "";

  todos.forEach((todo) => {
    const li = document.createElement("li");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;

    const textSpan = document.createElement("span");
    textSpan.textContent = todo.text;

    if (todo.completed) {
      textSpan.classList.add("completed");
    }

    checkbox.addEventListener("change", async () => {
      try {
        await requestJson(`/api/todos/${todo.id}/completed`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            completed: checkbox.checked
          })
        });

        await loadTodos();
      } catch (error) {
        alert(error.message);
      }
    });

    const editButton = document.createElement("button");
    editButton.textContent = "수정";

    editButton.addEventListener("click", async () => {
      const newText = prompt("수정할 내용을 입력하세요.", todo.text);

      if (newText === null) {
        return;
      }

      const text = newText.trim();

      if (text === "") {
        return;
      }

      try {
        await requestJson(`/api/todos/${todo.id}/text`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            text
          })
        });

        await loadTodos();
      } catch (error) {
        alert(error.message);
      }
    });

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "삭제";

    deleteButton.addEventListener("click", async () => {
      try {
        await requestJson(`/api/todos/${todo.id}`, {
          method: "DELETE"
        });

        await loadTodos();
      } catch (error) {
        alert(error.message);
      }
    });

    li.appendChild(checkbox);
    li.appendChild(textSpan);
    li.appendChild(editButton);
    li.appendChild(deleteButton);

    todoList.appendChild(li);
  });
}

async function addTodo() {
  const text = todoInput.value.trim();

  if (text === "") {
    return;
  }

  try {
    await requestJson("/api/todos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text
      })
    });

    todoInput.value = "";
    await loadTodos();
  } catch (error) {
    alert(error.message);
  }
}

loginButton.addEventListener("click", login);
registerButton.addEventListener("click", register);
logoutButton.addEventListener("click", logout);
changePasswordButton.addEventListener("click", changePassword);
deleteAccountButton.addEventListener("click", deleteAccount);
addButton.addEventListener("click", addTodo);

passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    login();
  }
});

todoInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addTodo();
  }
});

checkAuth().catch((error) => {
  console.error(error);
  showLoggedOut();
});
