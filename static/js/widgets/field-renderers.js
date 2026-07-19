/** Field widgets for grid cells. */

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function isoToDatetimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function datetimeLocalToIso(local) {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? local : d.toISOString();
}

export function formatFieldDisplay(value, fdef = {}) {
  if (value === null || value === undefined || value === "") return "—";
  switch (fdef.type) {
    case "currency": {
      const num = Number(value);
      if (Number.isNaN(num)) return String(value);
      const currency = fdef.editor?.currency || "USD";
      try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(num);
      } catch {
        return `$${num.toFixed(2)}`;
      }
    }
    case "percent": {
      const num = Number(value);
      return Number.isNaN(num) ? String(value) : `${num}%`;
    }
    case "rating": {
      const max = fdef.validation?.max ?? 5;
      return `${value} / ${max}`;
    }
    case "datetime": {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleString();
    }
    case "date":
      return String(value);
    case "boolean":
      return value ? "Yes" : "No";
    default:
      return Array.isArray(value) ? value.join(", ") : String(value);
  }
}

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

export function renderEnumSelect(value, options, onChange) {
  const select = document.createElement("select");
  select.className = "cell-input";
  (options || []).forEach((opt) => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    o.selected = value === opt;
    select.appendChild(o);
  });
  select.addEventListener("change", () => onChange(select.value));
  return select;
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

export function renderDateInput(value, onChange) {
  const input = document.createElement("input");
  input.type = "date";
  input.className = "cell-input";
  input.value = value ? String(value).slice(0, 10) : "";
  input.addEventListener("change", () => onChange(input.value));
  return input;
}

export function renderDatetimeInput(value, onChange) {
  const input = document.createElement("input");
  input.type = "datetime-local";
  input.className = "cell-input";
  input.value = isoToDatetimeLocal(value);
  input.addEventListener("change", () => onChange(datetimeLocalToIso(input.value)));
  return input;
}

export function renderNumberInput(value, onChange, { step = "any", min, max } = {}) {
  const input = document.createElement("input");
  input.type = "number";
  input.className = "cell-input";
  input.step = step;
  if (min != null) input.min = String(min);
  if (max != null) input.max = String(max);
  input.value = value ?? "";
  const emit = () => {
    const raw = input.value;
    onChange(raw === "" ? null : Number(raw));
  };
  input.addEventListener("change", emit);
  input.addEventListener("blur", emit);
  return input;
}

export function renderCurrencyInput(value, onChange, fdef = {}) {
  const wrap = document.createElement("div");
  wrap.className = "cell-input-affix";
  const prefix = document.createElement("span");
  prefix.className = "cell-input-prefix muted";
  prefix.textContent = fdef.editor?.currency === "EUR" ? "€" : "$";
  const input = renderNumberInput(value, onChange, { step: "0.01" });
  wrap.append(prefix, input);
  return wrap;
}

export function renderPercentInput(value, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "cell-input-affix";
  const input = renderNumberInput(value, onChange, { step: "0.1", min: 0, max: 100 });
  const suffix = document.createElement("span");
  suffix.className = "cell-input-suffix muted";
  suffix.textContent = "%";
  wrap.append(input, suffix);
  return wrap;
}

export function renderRatingInput(value, onChange, fdef = {}) {
  const min = fdef.validation?.min ?? 1;
  const max = fdef.validation?.max ?? 5;
  const select = document.createElement("select");
  select.className = "cell-input";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "—";
  select.appendChild(empty);
  for (let n = min; n <= max; n += 1) {
    const o = document.createElement("option");
    o.value = String(n);
    o.textContent = `${n} / ${max}`;
    o.selected = Number(value) === n;
    select.appendChild(o);
  }
  select.addEventListener("change", () => {
    onChange(select.value === "" ? null : Number(select.value));
  });
  return select;
}
