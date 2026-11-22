/**
 * TV Show Explorer
 * Fetches show data from the TVMaze API, models it, and logs it to the console.
 */

const API_BASE = "https://api.tvmaze.com";
const WATCHLIST_KEY = "tvShowExplorerWatchlist";
const MIN_YEAR = 1950;

/* ---------- Data model ---------- */

class Show {
  constructor({ id, name, genres, rating, premiered, status, network, summary, imageUrl, siteUrl, cast = [] }) {
    this.id = id;
    this.name = name;
    this.genres = genres;
    this.rating = rating;
    this.premiered = premiered;
    this.status = status;
    this.network = network;
    this.summary = summary;
    this.imageUrl = imageUrl;
    this.siteUrl = siteUrl;
    this.cast = cast;
  }

  static fromApi(raw) {
    const embeddedCast = raw._embedded?.cast ?? [];
    return new Show({
      id: raw.id,
      name: raw.name ?? "Untitled",
      genres: Array.isArray(raw.genres) ? raw.genres : [],
      rating: typeof raw.rating?.average === "number" ? raw.rating.average : null,
      premiered: raw.premiered ? Number(raw.premiered.slice(0, 4)) : null,
      status: raw.status ?? "Unknown",
      network: raw.network?.name ?? raw.webChannel?.name ?? "Unknown",
      summary: stripHtml(raw.summary),
      imageUrl: raw.image?.medium ?? null,
      siteUrl: raw.url ?? null,
      cast: embeddedCast.slice(0, 8).map((c) => ({
        person: c.person?.name ?? "Unknown",
        character: c.character?.name ?? "Unknown",
      })),
    });
  }

  get genreText() {
    return this.genres.length > 0 ? this.genres.join(", ") : "No genres listed";
  }
  get ratingText() {
    return this.rating === null ? "No rating" : `Rating ${this.rating.toFixed(1)}`;
  }
  get yearText() {
    return this.premiered === null ? "Year unknown" : String(this.premiered);
  }
}

function stripHtml(html) {
  return html ? html.replace(/<[^>]*>/g, "").trim() : "No summary available.";
}

/* ---------- API ---------- */

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function searchShows(term) {
  const raw = await fetchJson(`${API_BASE}/search/shows?q=${encodeURIComponent(term)}`);
  return raw.map((item) => Show.fromApi(item.show));
}

async function fetchShowDetails(id) {
  const raw = await fetchJson(`${API_BASE}/shows/${id}?embed=cast`);
  return Show.fromApi(raw);
}

/* ---------- Validation ---------- */

const KEYWORD_PATTERN = /^[\p{L}\p{N} '&:.,!\-]+$/u;

function validateKeyword(value) {
  const text = value.trim();
  if (text === "") return "Enter a show name to search.";
  if (text.length < 2) return "Show name must be at least 2 characters.";
  if (text.length > 50) return "Show name must be 50 characters or fewer.";
  if (!KEYWORD_PATTERN.test(text)) return "Use only letters, numbers, spaces, and basic punctuation.";
  return "";
}

function validateRating(value) {
  const text = value.trim();
  if (text === "") return ""; // optional
  if (!/^\d+(\.\d+)?$/.test(text)) return "Enter a number such as 7 or 7.5.";
  const number = Number(text);
  if (number < 0 || number > 10) return "Rating must be between 0 and 10.";
  return "";
}

function validateYear(value) {
  const text = value.trim();
  if (text === "") return ""; // optional
  if (!/^\d{4}$/.test(text)) return "Enter a 4-digit year such as 2005.";
  const year = Number(text);
  const maxYear = new Date().getFullYear() + 1;
  if (year < MIN_YEAR || year > maxYear) return `Year must be between ${MIN_YEAR} and ${maxYear}.`;
  return "";
}

const FIELDS = [
  { inputId: "search-input", errorId: "search-error", validate: validateKeyword },
  { inputId: "rating-input", errorId: "rating-error", validate: validateRating },
  { inputId: "year-input", errorId: "year-error", validate: validateYear },
];

/** Show or clear the inline error for one field. Returns true if valid. */
function checkField(field) {
  const input = document.getElementById(field.inputId);
  const errorEl = document.getElementById(field.errorId);
  const message = field.validate(input.value);
  errorEl.textContent = message;
  if (message) {
    input.setAttribute("aria-invalid", "true");
  } else {
    input.removeAttribute("aria-invalid");
  }
  return message === "";
}

/* ---------- State ---------- */

const state = {
  shows: [],        // results of the last search
  minRating: null,  // validated filter values from the last submit
  minYear: null,
  genre: "",
  sort: "rating",
  watchlist: loadWatchlist(),
};

function loadWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem(WATCHLIST_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

function saveWatchlist() {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(state.watchlist));
  } catch (error) {
    console.warn("Could not save watchlist:", error);
  }
}

function isSaved(id) {
  return state.watchlist.some((item) => item.id === id);
}

function toggleWatchlist(show) {
  if (isSaved(show.id)) {
    state.watchlist = state.watchlist.filter((item) => item.id !== show.id);
  } else {
    state.watchlist.push({ id: show.id, name: show.name, imageUrl: show.imageUrl });
  }
  saveWatchlist();
  renderWatchlist();
  renderResults();
}

/* ---------- Filtering and sorting ---------- */

function getVisibleShows() {
  let list = state.shows.filter((show) => {
    if (state.genre && !show.genres.includes(state.genre)) return false;
    if (state.minRating !== null && (show.rating === null || show.rating < state.minRating)) return false;
    if (state.minYear !== null && (show.premiered === null || show.premiered < state.minYear)) return false;
    return true;
  });

  list = [...list];
  if (state.sort === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else if (state.sort === "year") {
    list.sort((a, b) => (b.premiered ?? 0) - (a.premiered ?? 0));
  } else {
    list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  }
  return list;
}

function populateGenres() {
  const select = document.getElementById("genre-select");
  const genres = [...new Set(state.shows.flatMap((show) => show.genres))].sort();
  const fragment = document.createDocumentFragment();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All genres";
  fragment.appendChild(all);
  for (const genre of genres) {
    const option = document.createElement("option");
    option.value = genre;
    option.textContent = genre;
    fragment.appendChild(option);
  }
  select.replaceChildren(fragment);
  state.genre = "";
}

/* ---------- Rendering ---------- */

function setStatus(message) {
  document.getElementById("status").textContent = message;
}

function createPoster(show, className) {
  if (show.imageUrl) {
    const img = document.createElement("img");
    img.src = show.imageUrl;
    img.alt = `Poster for ${show.name}`;
    img.loading = "lazy";
    if (className) img.className = className;
    return img;
  }
  return null;
}

function createCard(show) {
  const li = document.createElement("li");
  li.className = "card";

  const poster = document.createElement("div");
  poster.className = "card-poster";
  const img = createPoster(show);
  poster.appendChild(img ?? document.createTextNode("No poster"));

  const body = document.createElement("div");
  body.className = "card-body";

  const title = document.createElement("h3");
  title.className = "card-title";
  title.textContent = show.name;

  const meta = document.createElement("p");
  meta.className = "card-meta";
  meta.textContent = `${show.genreText} | ${show.yearText} | ${show.ratingText}`;

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const detailsBtn = document.createElement("button");
  detailsBtn.type = "button";
  detailsBtn.className = "button button-quiet";
  detailsBtn.textContent = "Details";
  detailsBtn.setAttribute("aria-label", `Details for ${show.name}`);
  detailsBtn.addEventListener("click", () => openDetails(show));

  const saved = isSaved(show.id);
  const watchBtn = document.createElement("button");
  watchBtn.type = "button";
  watchBtn.className = "button button-quiet";
  watchBtn.textContent = saved ? "Remove" : "Add to watchlist";
  watchBtn.setAttribute("aria-label", `${saved ? "Remove" : "Add"} ${show.name} ${saved ? "from" : "to"} watchlist`);
  watchBtn.addEventListener("click", () => toggleWatchlist(show));

  actions.append(detailsBtn, watchBtn);
  body.append(title, meta, actions);
  li.append(poster, body);
  return li;
}

function renderResults() {
  const grid = document.getElementById("card-grid");
  const visible = getVisibleShows();
  const fragment = document.createDocumentFragment();
  for (const show of visible) {
    fragment.appendChild(createCard(show));
  }
  grid.replaceChildren(fragment);

  if (state.shows.length > 0) {
    if (visible.length === 0) {
      setStatus("No shows match your filters. Try a different genre, rating, or year.");
    } else {
      setStatus(`Showing ${visible.length} of ${state.shows.length} shows.`);
    }
  }
}

function renderWatchlist() {
  const list = document.getElementById("watch-list");
  const status = document.getElementById("watchlist-status");
  const fragment = document.createDocumentFragment();

  for (const item of state.watchlist) {
    const li = document.createElement("li");
    li.className = "watch-item";

    if (item.imageUrl) {
      const img = document.createElement("img");
      img.src = item.imageUrl;
      img.alt = "";
      li.appendChild(img);
    }

    const name = document.createElement("span");
    name.textContent = item.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button button-quiet";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${item.name} from watchlist`);
    remove.addEventListener("click", () => {
      state.watchlist = state.watchlist.filter((s) => s.id !== item.id);
      saveWatchlist();
      renderWatchlist();
      renderResults();
    });

    li.append(name, remove);
    fragment.appendChild(li);
  }

  list.replaceChildren(fragment);
  status.textContent = state.watchlist.length === 0
    ? "Shows you save will appear here."
    : `${state.watchlist.length} saved ${state.watchlist.length === 1 ? "show" : "shows"}.`;
}

/* ---------- Details dialog ---------- */

function addLine(parent, label, value) {
  const p = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  p.append(strong, document.createTextNode(value));
  parent.appendChild(p);
}

function renderDetails(show) {
  const content = document.getElementById("dialog-content");
  const fragment = document.createDocumentFragment();

  const poster = createPoster(show, "dialog-poster");
  if (poster) fragment.appendChild(poster);

  const info = document.createElement("div");
  info.className = "dialog-info";
  addLine(info, "Genres", show.genreText);
  addLine(info, "Premiered", show.yearText);
  addLine(info, "Status", show.status);
  addLine(info, "Network", show.network);
  addLine(info, "Rating", show.rating === null ? "No rating" : show.rating.toFixed(1));

  const summaryHead = document.createElement("h3");
  summaryHead.textContent = "Summary";
  const summary = document.createElement("p");
  summary.textContent = show.summary;
  info.append(summaryHead, summary);

  const castHead = document.createElement("h3");
  castHead.textContent = "Cast";
  info.appendChild(castHead);
  if (show.cast.length === 0) {
    const none = document.createElement("p");
    none.textContent = "No cast information available.";
    info.appendChild(none);
  } else {
    const ul = document.createElement("ul");
    ul.className = "cast-list";
    for (const member of show.cast) {
      const li = document.createElement("li");
      li.textContent = `${member.person} as ${member.character}`;
      ul.appendChild(li);
    }
    info.appendChild(ul);
  }

  fragment.appendChild(info);
  content.replaceChildren(fragment);
}

async function openDetails(show) {
  const dialog = document.getElementById("details-dialog");
  document.getElementById("dialog-title").textContent = show.name;
  const content = document.getElementById("dialog-content");
  const loading = document.createElement("p");
  loading.textContent = "Loading details...";
  content.replaceChildren(loading);
  dialog.showModal();

  try {
    const full = await fetchShowDetails(show.id);
    renderDetails(full);
  } catch (error) {
    console.error("Could not load details:", error);
    const message = document.createElement("p");
    message.textContent = "Could not load details. Close this window and try again.";
    content.replaceChildren(message);
  }
}

/* ---------- Events ---------- */

async function handleSubmit(event) {
  event.preventDefault();

  // Validate every field so all errors show at once.
  const results = FIELDS.map(checkField);
  if (results.includes(false)) {
    const firstBad = FIELDS.find((f, i) => !results[i]);
    document.getElementById(firstBad.inputId).focus();
    setStatus("Fix the errors in the form and try again.");
    return;
  }

  const term = document.getElementById("search-input").value.trim();
  const ratingText = document.getElementById("rating-input").value.trim();
  const yearText = document.getElementById("year-input").value.trim();
  state.minRating = ratingText === "" ? null : Number(ratingText);
  state.minYear = yearText === "" ? null : Number(yearText);

  setStatus(`Searching for "${term}"...`);
  try {
    state.shows = await searchShows(term);
    populateGenres();
    renderResults();
    if (state.shows.length === 0) {
      setStatus(`No shows found for "${term}". Check the spelling or try another name.`);
    }
  } catch (error) {
    console.error("Could not load shows:", error);
    state.shows = [];
    renderResults();
    setStatus("Could not load shows. Check your connection and try again.");
  }
}

function init() {
  const form = document.getElementById("search-form");
  form.addEventListener("submit", handleSubmit);

  // Re-check a field as the user types once it has shown an error.
  for (const field of FIELDS) {
    const input = document.getElementById(field.inputId);
    input.addEventListener("input", () => {
      if (input.hasAttribute("aria-invalid")) checkField(field);
    });
    input.addEventListener("blur", () => {
      if (input.value.trim() !== "") checkField(field);
    });
  }

  document.getElementById("genre-select").addEventListener("change", (event) => {
    state.genre = event.target.value;
    renderResults();
  });
  document.getElementById("sort-select").addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderResults();
  });

  const dialog = document.getElementById("details-dialog");
  document.getElementById("dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close(); // click on backdrop
  });

  renderWatchlist();
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}
