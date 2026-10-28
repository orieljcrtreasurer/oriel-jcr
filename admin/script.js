
document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // ==========================================
  // GITHUB CONFIGURATION
  // ==========================================

  const CONFIG = {
    owner: "orieljcrtreasurer",
    repo: "oriel-jcr",
    branch: "main",
    file: "events.json",
    storageKey: "oriel-jcr-admin-token"
  };

  const API_URL =
    `https://api.github.com/repos/${CONFIG.owner}/` +
    `${CONFIG.repo}/contents/${CONFIG.file}`;

  const DAYS = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday"
  ];

  // ==========================================
  // STATE
  // ==========================================

  let token = "";
  let data = null;
  let fileSha = null;
  let originalJSON = "";
  let editingIndex = null;
  let dirty = false;
  let busy = false;

  const $ = id => document.getElementById(id);

  // ==========================================
  // HELPERS
  // ==========================================

  function setMessage(text, type = "") {
    const el = $("status-message");
    el.textContent = text;
    el.className = `message ${type}`;
  }

  function setLoginMessage(text, type = "") {
    const el = $("login-message");
    el.textContent = text;
    el.className = `message ${type}`;
  }

  function setBusy(value) {
    busy = value;

    ["connect-btn", "publish-btn", "reload-btn"]
      .forEach(id => {
        $(id).disabled = value;
      });
  }

  function updateSummary() {
    $("term-summary").textContent =
      `${data.term} ${data.year} · ` +
      `${data.events.length} events` +
      (dirty ? " · Unpublished changes" : "");

    $("publish-btn").disabled = busy || !dirty;
  }

  function markDirty() {
    dirty = true;
    updateSummary();
    setMessage("You have unpublished changes.");
  }

  function formatTime(time) {
    return time || "Time TBC";
  }

  function formatLocation(location) {
    return location || "Location TBC";
  }

  function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";

    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }

    return btoa(binary);
  }

  function decodeBase64(base64) {
    const binary = atob(base64.replace(/\s/g, ""));
    const bytes = Uint8Array.from(
      binary,
      char => char.charCodeAt(0)
    );

    return new TextDecoder().decode(bytes);
  }

  function apiHeaders() {
    return {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  async function githubRequest(method, body = null) {
    const options = {
      method,
      headers: apiHeaders(),
      cache: "no-store"
    };

    if (body !== null) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const response = await fetch(
      `${API_URL}?ref=${encodeURIComponent(CONFIG.branch)}`,
      options
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        `${response.status}: ` +
        (result.message || "GitHub request failed")
      );
    }

    return result;
  }

  // ==========================================
  // CONNECT TO GITHUB
  // ==========================================

  async function connect(newToken, remember = false) {
    token = newToken.trim();

    if (!token) {
      setLoginMessage("Please enter a token.", "error");
      return;
    }

    setBusy(true);
    setLoginMessage("Connecting to GitHub...");

    try {
      await loadFromGitHub();

      if (remember) {
        localStorage.setItem(CONFIG.storageKey, token);
      } else {
        localStorage.removeItem(CONFIG.storageKey);
      }

      $("token-input").value = "";
      $("login-screen").hidden = true;
      $("dashboard").hidden = false;
      $("logout-btn").hidden = false;
      $("connection-label").textContent = "Connected";

      setMessage("Connected to GitHub.", "success");
    } catch (error) {
      token = "";
      setLoginMessage(
        `Connection failed: ${error.message}`,
        "error"
      );
    } finally {
      setBusy(false);
      if (data) updateSummary();
    }
  }

  $("login-form").addEventListener("submit", event => {
    event.preventDefault();

    connect(
      $("token-input").value,
      $("remember-token").checked
    );
  });

  $("logout-btn").addEventListener("click", () => {
    if (dirty && !confirm(
      "Discard unpublished changes and disconnect?"
    )) return;

    localStorage.removeItem(CONFIG.storageKey);
    token = "";
    data = null;
    fileSha = null;
    dirty = false;
    editingIndex = null;

    $("dashboard").hidden = true;
    $("login-screen").hidden = false;
    $("logout-btn").hidden = true;
    $("connection-label").textContent = "Not connected";
    $("remember-token").checked = false;

    setLoginMessage("Disconnected.", "success");
  });

  // ==========================================
  // LOAD EVENTS.JSON
  // ==========================================

  async function loadFromGitHub() {
    const result = await githubRequest("GET");

    if (
      result.type !== "file" ||
      result.encoding !== "base64" ||
      !result.sha
    ) {
      throw new Error("Unexpected GitHub file response.");
    }

    const jsonText = decodeBase64(result.content);
    const parsed = JSON.parse(jsonText);

    if (
      !Array.isArray(parsed.events) ||
      !Array.isArray(parsed.recurringEvents)
    ) {
      throw new Error(
        "events.json needs events and recurringEvents arrays."
      );
    }

    data = parsed;
    fileSha = result.sha;
    originalJSON = JSON.stringify(parsed);
    dirty = false;
    editingIndex = null;

    renderAll();
  }

  $("reload-btn").addEventListener("click", async () => {
    if (dirty && !confirm(
      "Discard your unpublished changes and reload?"
    )) return;

    setBusy(true);

    try {
      await loadFromGitHub();
      setMessage("Reloaded from GitHub.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      setBusy(false);
      updateSummary();
    }
  });

  // ==========================================
  // RENDER ALL EDITORS
  // ==========================================

  function renderAll() {
    $("term-name").value = data.term || "";
    $("term-year").value = data.year || "";
    $("term-start").value = data.startDate || "";

    resetEventForm();
    renderEvents();
    renderRecurring();
    updateSummary();
  }

  // ==========================================
  // TERM SETTINGS
  // ==========================================

  $("term-form").addEventListener("submit", event => {
    event.preventDefault();

    const term = $("term-name").value.trim();
    const year = Number($("term-year").value);
    const startDate = $("term-start").value;

    if (!term || !startDate || !Number.isInteger(year)) {
      setMessage("Enter valid term settings.", "error");
      return;
    }

    data.term = term;
    data.year = year;
    data.startDate = startDate;

    markDirty();
    setMessage("Term settings saved locally.", "success");
  });

  // ==========================================
  // EVENTS LIST
  // ==========================================

  function renderEvents() {
    const list = $("events-list");
    list.replaceChildren();

    const weekFilter = $("filter-week").value;
    const search = $("search-events")
      .value.trim().toLowerCase();

    const filtered = data.events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => {
        const matchesWeek =
          weekFilter === "all" ||
          event.week === Number(weekFilter);

        const matchesSearch =
          [event.title, event.location]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(search);

        return matchesWeek && matchesSearch;
      })
      .sort((a, b) =>
        a.event.week - b.event.week ||
        a.event.day - b.event.day ||
        (a.event.time || "99:99")
          .localeCompare(b.event.time || "99:99")
      );

    if (!filtered.length) {
      const empty = document.createElement("p");
      empty.textContent = "No events found.";
      list.appendChild(empty);
      return;
    }

    filtered.forEach(({ event, index }) => {
      const item = document.createElement("div");
      item.className = "event-item";

      const info = document.createElement("div");

      const name = document.createElement("strong");
      name.textContent = event.title;

      const details = document.createElement("small");
      details.textContent =
        `Week ${event.week} · ${DAYS[event.day]} · ` +
        `${formatTime(event.time)} · ` +
        formatLocation(event.location);

      info.append(name, details);

      const button = document.createElement("button");
      button.className = "secondary";
      button.textContent = "Edit";

      button.addEventListener("click", () => {
        editEvent(index);
      });

      item.append(info, button);
      list.appendChild(item);
    });
  }

  $("filter-week").addEventListener(
    "change", renderEvents
  );

  $("search-events").addEventListener(
    "input", renderEvents
  );

  // ==========================================
  // EVENT EDITOR
  // ==========================================

  function resetEventForm() {
    editingIndex = null;

    $("event-form").reset();
    $("event-form-heading").textContent = "Add Event";
    $("delete-event").hidden = true;
  }

  function editEvent(index) {
    const event = data.events[index];

    editingIndex = index;

    $("event-name").value = event.title;
    $("event-week").value = event.week;
    $("event-day").value = event.day;
    $("event-time").value = event.time || "";
    $("event-location").value = event.location || "";

    $("event-form-heading").textContent = "Edit Event";
    $("delete-event").hidden = false;

    $("event-form").scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  $("add-event-btn").addEventListener("click", () => {
    resetEventForm();
    $("event-name").focus();
  });

  $("cancel-edit").addEventListener(
    "click", resetEventForm
  );

  $("event-form").addEventListener("submit", event => {
    event.preventDefault();

    const title = $("event-name").value.trim();
    const week = Number($("event-week").value);
    const day = Number($("event-day").value);
    const time = $("event-time").value || null;
    const location =
      $("event-location").value.trim() || null;

    if (
      !title ||
      !Number.isInteger(week) ||
      week < 0 || week > 8 ||
      !Number.isInteger(day) ||
      day < 0 || day > 6
    ) {
      setMessage("Please enter valid event details.", "error");
      return;
    }

    const newEvent = {
      ...(editingIndex !== null
        ? data.events[editingIndex]
        : {}),
      week,
      day,
      title,
      time,
      location
    };

    if (editingIndex === null) {
      data.events.push(newEvent);
    } else {
      data.events[editingIndex] = newEvent;
    }

    resetEventForm();
    renderEvents();
    markDirty();

    setMessage("Event saved locally.", "success");
  });

  $("delete-event").addEventListener("click", () => {
    if (editingIndex === null) return;

    const event = data.events[editingIndex];

    if (!confirm(`Delete "${event.title}"?`)) return;

    data.events.splice(editingIndex, 1);

    resetEventForm();
    renderEvents();
    markDirty();

    setMessage("Event deleted locally.", "success");
  });

  // ==========================================
  // RECURRING EVENTS
  // ==========================================

  function renderRecurring() {
    const list = $("recurring-list");
    list.replaceChildren();

    data.recurringEvents.forEach((event, index) => {
      const row = document.createElement("div");
      row.className = "recurring-item";

      function field(labelText, value, type = "text") {
        const label = document.createElement("label");
        label.textContent = labelText;

        const input = document.createElement("input");
        input.type = type;
        input.value = value || "";

        label.appendChild(input);
        return { label, input };
      }

      const title = field("Name", event.title);
      const time = field("Time", event.time, "time");
      const location = field("Location", event.location);

      const dayLabel = document.createElement("label");
      dayLabel.textContent = "Day";

      const daySelect = document.createElement("select");

      DAYS.forEach(day => {
        const option = document.createElement("option");
        option.value = day;
        option.textContent = day;
        daySelect.appendChild(option);
      });

      daySelect.value = event.day || "Sunday";
      dayLabel.appendChild(daySelect);

      function update() {
        event.title = title.input.value.trim();
        event.day = daySelect.value;
        event.time = time.input.value || null;
        event.location = location.input.value.trim() || null;

        markDirty();
      }

      [title.input, time.input, location.input]
        .forEach(input => {
          input.addEventListener("input", update);
        });

      daySelect.addEventListener("change", update);

      const remove = document.createElement("button");
      remove.className = "danger";
      remove.textContent = "Delete";

      remove.addEventListener("click", () => {
        if (!confirm("Delete this recurring event?")) return;

        data.recurringEvents.splice(index, 1);
        renderRecurring();
        markDirty();
      });

      row.append(
        title.label,
        dayLabel,
        time.label,
        location.label,
        remove
      );

      list.appendChild(row);
    });
  }

  $("add-recurring").addEventListener("click", () => {
    data.recurringEvents.push({
      title: "New recurring event",
      day: "Sunday",
      time: null,
      location: null
    });

    renderRecurring();
    markDirty();
  });

  // ==========================================
  // PUBLISH TO GITHUB
  // ==========================================

  $("publish-btn").addEventListener("click", async () => {
    if (!dirty || busy) return;

    if (!confirm(
      "Publish all saved changes to the live term card?"
    )) return;

    setBusy(true);
    setMessage("Checking GitHub for newer changes...");

    try {
      // Check that another admin hasn't updated the file
      const latest = await githubRequest("GET");

      if (latest.sha !== fileSha) {
        throw new Error(
          "events.json has changed on GitHub since you " +
          "loaded it. Reload the latest version before " +
          "publishing. Your local changes have not been sent."
        );
      }

      if (!data.term || !data.startDate) {
        throw new Error("Complete the term settings first.");
      }

      for (const event of data.events) {
        if (
          !event.title ||
          !Number.isInteger(event.week) ||
          event.week < 0 || event.week > 8 ||
          !Number.isInteger(event.day) ||
          event.day < 0 || event.day > 6
        ) {
          throw new Error(
            "An event has invalid details. Fix it before publishing."
          );
        }
      }

      for (const event of data.recurringEvents) {
        if (!event.title || !DAYS.includes(event.day)) {
          throw new Error(
            "A recurring event has invalid details."
          );
        }
      }

      const jsonText = JSON.stringify(data, null, 2) + "\n";

      const result = await githubRequest("PUT", {
        message:
          `Update ${data.term} ${data.year} JCR term card`,
        content: encodeBase64(jsonText),
        sha: fileSha,
        branch: CONFIG.branch
      });

      fileSha = result.content.sha;
      originalJSON = JSON.stringify(data);
      dirty = false;

      setMessage(
        "Published successfully! GitHub Pages will " +
        "update after deployment.",
        "success"
      );

    } catch (error) {
      setMessage(
        `Publishing failed: ${error.message}`,
        "error"
      );
    } finally {
      setBusy(false);
      updateSummary();
    }
  });

  // ==========================================
  // UNSAVED CHANGES WARNING
  // ==========================================

  window.addEventListener("beforeunload", event => {
    if (!dirty) return;

    event.preventDefault();
    event.returnValue = "";
  });

  // ==========================================
  // RESTORE SAVED TOKEN
  // ==========================================

  const savedToken = localStorage.getItem(
    CONFIG.storageKey
  );

  if (savedToken) {
    $("remember-token").checked = true;
    connect(savedToken, true);
  }
});
