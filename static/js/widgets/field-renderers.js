/** Field widgets for grid cells. */
export function renderBulletEditor(value, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "bullet-editor";
  const bullets = Array.isArray(value) ? value : [];
  if (!bullets.length) bullets.push("");

  function emit() {
    const rows = [...wrap.querySelectorAll("input")].map((i) => i.value).filter((v) => v.trim());
    onChange(rows.length ? rows : [""]);
  }

  function render() {
    wrap.innerHTML = "";
    bullets.forEach((b, i) => {
      const row = document.createElement("div");
      row.className = "bullet-row";
      const input = document.createElement("input");
      input.type = "text";
      input.value = b;
      input.addEventListener("input", () => {
        bullets[i] = input.value;
        emit();
      });
      input.addEventListener("blur", emit);
      row.appendChild(input);
      wrap.appendChild(row);
    });
    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn-sm";
    add.textContent = "+ bullet";
    add.addEventListener("click", () => {
      bullets.push("");
      render();
    });
    wrap.appendChild(add);
  }
  render();
  return wrap;
}

export function renderBoxStack(value, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "box-stack";
  const lines = (value || "").split("\n").filter((l) => l.trim());
  if (!lines.length) lines.push("");

  function emit() {
    const text = [...wrap.querySelectorAll("textarea")]
      .map((t) => t.value.trim())
      .filter(Boolean)
      .join("\n");
    onChange(text);
  }

  function render() {
    wrap.innerHTML = "";
    lines.forEach((line, i) => {
      const ta = document.createElement("textarea");
      ta.rows = 2;
      ta.value = line;
      ta.addEventListener("input", () => {
        lines[i] = ta.value;
        emit();
      });
      ta.addEventListener("blur", emit);
      wrap.appendChild(ta);
    });
    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn-sm";
    add.textContent = "+ line";
    add.addEventListener("click", () => {
      lines.push("");
      render();
    });
    wrap.appendChild(add);
  }
  render();
  return wrap;
}

export function renderTextInput(value, onChange) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "cell-input";
  input.value = value || "";
  input.addEventListener("input", () => onChange(input.value));
  input.addEventListener("blur", () => onChange(input.value));
  return input;
}
