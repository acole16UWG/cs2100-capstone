/**
 * TV Show Explorer
 * Fetches show data from the TVMaze API, models it, and logs it to the console.
 */

const API_BASE = "https://api.tvmaze.com";
const DEFAULT_QUERY = "breaking";

/**
 * Model for one tv show which only takes the fields the app will display
 */
class Show {
    constructor({ id, name, genres, rating, premiered, status, network, summary, imageUrl, siteUrl }) {
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
    }

    /**
     * Builds a Show from a TVMaze show object
     */
    static fromApi(raw) {
        return new Show({
            id: raw.id,
            name: raw.name ?? "Untitled",
            genres: Array.isArray(raw.genres) ? raw.genres : [],
            rating: typeof raw.rating?.average === "number" ? raw.rating.average : null,
            premiered: raw.premiered ? raw.premiered.slice(0, 4) : "Unknown",
            status: raw.status ?? "Unknown",
            network: raw.network?.name ?? raw.webChannel?.name ?? "Unknown",
            summary: stripHtml(raw.summary),
            imageUrl: raw.image?.medium ?? null,
            siteUrl: raw.url ?? null,
        });
    }

    /**
     * Short genre text for display
     */
    get genreText() {
        return this.genres.length > 0 ? this.genres.join(", ") : "No genres listed";
    }

    /**
     * Rating as text for display
     */
    get ratingText() {
        return this.rating === null ? "N/A" : this.rating.toFixed(1);
    }
}

/**
 * Removes the HTML tags from a string (TVMaze summaries contain <p>, <b>, etc.)
 */
function stripHtml(html) {
    if (!html) {
        return "No summary available.";
    }
    return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Builds the search URL for a given value
 */
function buildSearchUrl(term) {
    return `${API_BASE}/search/shows?q=${encodeURIComponent(term)}`;
}

/**
 * Fetches the JSON from a URL
 */
async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

/**
 * Search TVMaze and return an array of Show objects
 * The search endpoint returns [{ score, show }, ...]
 */
async function searchShows(term) {
    const rawResults = await fetchJson(buildSearchUrl(term));
    console.log("Raw JSON from API:", rawResults);
    return rawResults.map((item) => Show.fromApi(item.show));
}

/**
 * Fetches and logs results for a search term
 */
async function runSearch(term) {
    const status = document.getElementById("status");
    try {
        if (status) status.textContent = `Searching for "${term}"...`;
        const shows = await searchShows(term);
        console.log(`Cleaned Show objects for "${term}" (${shows.length}):`, shows);
        console.table(
            shows.map((s) => ({
                id: s.id,
                name: s.name,
                genres: s.genreText,
                rating: s.ratingText,
                premiered: s.premiered,
                status: s.status,
            }))
        );
        if (status) {
            status.textContent = `Found ${shows.length} shows for "${term}". Open the console to view the data.`;
        }
        return shows;
    } catch (error) {
        console.error("Could not load shows:", error);
        if (status) status.textContent = "Could not load shows. Check your connection and try again.";
        return [];
    }
}

function init() {
    const form = document.getElementById("search-form");
    const input = document.getElementById("search-input");

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const term = input.value.trim();
        if (term !== "") {
            runSearch(term);
        }
    });

    runSearch(DEFAULT_QUERY);
}

if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
}

