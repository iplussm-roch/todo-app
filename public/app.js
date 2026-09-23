const todoInput = document.getElementById("todoInput");
const addButton = document.getElementById("addButton");
const todoList = document.getElementById("todoList");

async function loadTodos() {
  const response = await fetch("/api/todos");
  const todos = await response.json();

  renderTodos(todos);
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
      await fetch(`/api/todos/${todo.id}/completed`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          completed: checkbox.checked
        })
      });

      loadTodos();
    });

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "삭제";

    deleteButton.addEventListener("click", async () => {
      await fetch(`/api/todos/${todo.id}`, {
        method: "DELETE"
      });

      loadTodos();
    });

    li.appendChild(checkbox);
    li.appendChild(textSpan);
    li.appendChild(deleteButton);

    todoList.appendChild(li);
  });
}

async function addTodo() {
  const text = todoInput.value.trim();

  if (text === "") {
    return;
  }

  const response = await fetch("/api/todos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: text
    })
  });

  if (!response.ok) {
    return;
  }

  todoInput.value = "";
  loadTodos();
}

addButton.addEventListener("click", addTodo);

loadTodos();
