
document.addEventListener("DOMContentLoaded", () => {

  // ========================================
  // GENERAL WEBSITE FUNCTIONALITY
  // ========================================

  const yearElement = document.getElementById("year");

  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }

  // Mobile navigation
  const menuToggle = document.querySelector(".menu-toggle");
  const navLinks = document.querySelector(".nav-links");

  if (menuToggle && navLinks) {

    menuToggle.addEventListener("click", () => {

      const isOpen = navLinks.classList.toggle("active");

      menuToggle.setAttribute(
        "aria-expanded",
        String(isOpen)
      );

      menuToggle.textContent = isOpen ? "✕" : "☰";

    });

    navLinks.querySelectorAll("a").forEach(link => {

      link.addEventListener("click", () => {

        navLinks.classList.remove("active");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.textContent = "☰";

      });

    });

  }

  // ========================================
  // TERM CARD ELEMENTS
  // ========================================

  const tableBody = document.getElementById("termcard-body");
  const table = document.querySelector(".termcard-table");

  const weekSelect = document.getElementById("week-select");
  const prevWeek = document.getElementById("prev-week");
  const nextWeek = document.getElementById("next-week");
  const toggleTerm = document.getElementById("toggle-term");

  const eventDialog = document.getElementById("event-dialog");
  const closeEvent = document.getElementById("close-event");

  const eventTitle = document.getElementById("event-title");
  const eventWeek = document.getElementById("event-week");
  const eventDay = document.getElementById("event-day");
  const eventTime = document.getElementById("event-time");
  const eventLocation = document.getElementById("event-location");

  // Stop if this page has no term card
  if (!tableBody || !table) return;

  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ];

  // Events will be loaded from events.json
  let events = [];

  let currentWeek = 0;
  let fullTermView = false;

  // ========================================
  // LOAD EVENTS FROM JSON
  // ========================================

  async function loadEvents() {

    try {

      const response = await fetch("events.json", {
        cache: "no-cache"
      });

      if (!response.ok) {
        throw new Error(
          `Failed to load events: ${response.status}`
        );
      }

      const data = await response.json();

      if (!Array.isArray(data.events)) {
        throw new Error("Invalid events.json format");
      }

      events = data.events;

      // Update term heading
      const termHeading = document.querySelector(
        ".termcard-title h2"
      );

      if (termHeading && data.term && data.year) {
        termHeading.textContent =
          `${data.term} ${data.year}`;
      }

      // Update recurring events
      const recurringInfo = document.querySelector(
        ".termcard-info"
      );

      if (recurringInfo) {

        recurringInfo.replaceChildren();

        if (
          Array.isArray(data.recurringEvents) &&
          data.recurringEvents.length > 0
        ) {

          const heading = document.createElement("strong");
          heading.textContent = "Recurring Events";

          recurringInfo.appendChild(heading);

          data.recurringEvents.forEach(event => {

            const paragraph = document.createElement("p");

            const details = [
              event.day,
              event.time,
              event.location
            ].filter(Boolean);

            paragraph.textContent =
              `${event.title}: ${details.join(" | ")}`;

            recurringInfo.appendChild(paragraph);

          });

        } else {
          recurringInfo.hidden = true;
        }

      }

      renderTermCard();

    } catch (error) {

      console.error("Error loading term card:", error);

      tableBody.replaceChildren();

      const row = document.createElement("tr");
      const cell = document.createElement("td");

      cell.colSpan = 8;
      cell.textContent =
        "Unable to load the term card. Please try again later.";

      cell.style.textAlign = "center";
      cell.style.padding = "30px";

      row.appendChild(cell);
      tableBody.appendChild(row);

      if (prevWeek) prevWeek.disabled = true;
      if (nextWeek) nextWeek.disabled = true;
      if (weekSelect) weekSelect.disabled = true;
      if (toggleTerm) toggleTerm.disabled = true;

    }

  }

  // ========================================
  // CREATE EVENT BUTTON
  // ========================================

  function createEventButton(event) {

    const button = document.createElement("button");

    button.type = "button";
    button.className = "term-event";

    const title = document.createElement("span");
    title.className = "term-event-title";
    title.textContent = event.title;

    const time = document.createElement("span");
    time.className = "term-event-time";

    const details = [
      event.time,
      event.location
    ].filter(Boolean);

    time.textContent = details.join(" | ");

    button.appendChild(title);

    if (details.length > 0) {
      button.appendChild(time);
    }

    button.addEventListener("click", () => {
      showEvent(event);
    });

    return button;

  }

  // ========================================
  // CREATE WEEK ROW
  // ========================================

  function createWeekRow(weekNumber) {

    const row = document.createElement("tr");

    const weekCell = document.createElement("th");
    weekCell.scope = "row";
    weekCell.textContent = weekNumber;

    row.appendChild(weekCell);

    for (let day = 0; day < 7; day++) {

      const cell = document.createElement("td");

      const dayEvents = events
        .filter(event =>
          event.week === weekNumber &&
          event.day === day
        )
        .sort((a, b) => {

          const aTime = a.time || "99:99";
          const bTime = b.time || "99:99";

          return aTime.localeCompare(bTime);

        });

      dayEvents.forEach(event => {
        cell.appendChild(createEventButton(event));
      });

      row.appendChild(cell);

    }

    return row;

  }

  // ========================================
  // RENDER TERM CARD
  // ========================================

  function renderTermCard() {

    tableBody.replaceChildren();

    if (fullTermView) {

      for (let week = 0; week <= 8; week++) {
        tableBody.appendChild(createWeekRow(week));
      }

      table.classList.add("full-term");

      toggleTerm.textContent = "View Single Week";
      toggleTerm.setAttribute("aria-pressed", "true");

    } else {

      tableBody.appendChild(createWeekRow(currentWeek));

      table.classList.remove("full-term");

      toggleTerm.textContent = "View Full Term";
      toggleTerm.setAttribute("aria-pressed", "false");

    }

    weekSelect.value = String(currentWeek);

    prevWeek.disabled = fullTermView || currentWeek === 0;
    nextWeek.disabled = fullTermView || currentWeek === 8;
    weekSelect.disabled = fullTermView;

  }

  // ========================================
  // WEEK NAVIGATION
  // ========================================

  prevWeek.addEventListener("click", () => {

    if (currentWeek > 0) {
      currentWeek--;
      renderTermCard();
    }

  });

  nextWeek.addEventListener("click", () => {

    if (currentWeek < 8) {
      currentWeek++;
      renderTermCard();
    }

  });

  weekSelect.addEventListener("change", () => {

    currentWeek = Number(weekSelect.value);
    renderTermCard();

  });

  toggleTerm.addEventListener("click", () => {

    fullTermView = !fullTermView;
    renderTermCard();

  });

  // ========================================
  // EVENT DETAILS POPUP
  // ========================================

  function showEvent(event) {

    if (!eventDialog) return;

    eventTitle.textContent = event.title;
    eventWeek.textContent = `Week ${event.week}`;

    eventDay.textContent = days[event.day];
    eventTime.textContent = event.time || "Not specified";
    eventLocation.textContent =
      event.location || "Not specified";

    if (!eventDialog.open) {
      eventDialog.showModal();
    }

  }

  if (closeEvent && eventDialog) {

    closeEvent.addEventListener("click", () => {
      eventDialog.close();
    });

    eventDialog.addEventListener("click", event => {

      if (event.target === eventDialog) {
        eventDialog.close();
      }

    });

  }

  // ========================================
  // INITIALISE TERM CARD
  // ========================================

  loadEvents();

});
