// LectuePublibre6 - Cinder catalogue extension
// Catalogue/search only: does NOT extract or resolve ebook download links.
//
// Source: https://lectuepublibre6.com/
// Cinder extension format:
// https://github.com/TrexxyMon/Cinder-Extensions
//
// Cinder extensions run in a sandbox: use cinder.fetch() and cinder.parseHTML().

const BASE_URL = "https://lectuepublibre6.com";

function absUrl(url) {
  if (!url) return undefined;
  url = String(url).trim();
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return BASE_URL + url;
  return BASE_URL + "/" + url;
}

function cleanText(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function textOf(node) {
  try {
    return node ? cleanText(node.text()) : "";
  } catch (_) {
    return "";
  }
}

function attrOf(node, name) {
  try {
    return node ? node.attr(name) : undefined;
  } catch (_) {
    return undefined;
  }
}

function first(root, selectors) {
  for (const selector of selectors) {
    try {
      const el = root.querySelector(selector);
      if (el) return el;
    } catch (_) {}
  }
  return null;
}

function all(root, selectors) {
  for (const selector of selectors) {
    try {
      const nodes = root.querySelectorAll(selector);
      if (nodes && nodes.length) return nodes;
    } catch (_) {}
  }
  return [];
}

function parseTitleAndAuthor(fullTitle) {
  const title = cleanText(fullTitle);
  if (!title) return { title: "", author: undefined };

  // Most posts currently use: "Book title | Author"
  const parts = title.split("|").map(cleanText).filter(Boolean);
  if (parts.length >= 2) {
    return {
      title: parts.slice(0, -1).join(" | "),
      author: parts[parts.length - 1],
    };
  }

  return { title, author: undefined };
}

function imageFrom(root) {
  const img = first(root, [
    "img.wp-post-image",
    ".post-thumbnail img",
    ".entry-content img",
    "article img",
    "img",
  ]);

  if (!img) return undefined;

  // Prefer lazy-loaded full URL where available.
  return absUrl(
    attrOf(img, "data-src") ||
    attrOf(img, "data-lazy-src") ||
    attrOf(img, "src")
  );
}

function getCategories(root) {
  const values = [];
  const links = all(root, [
    ".cat-links a",
    ".entry-meta a[rel='category tag']",
    ".entry-meta a[rel='category']",
    "a[rel='category tag']",
  ]);

  links.forEach((node) => {
    const value = textOf(node);
    if (value && !values.includes(value)) values.push(value);
  });

  return values;
}

function parseArticle(article) {
  const heading = first(article, [
    ".entry-title a",
    "h2.entry-title a",
    "h1.entry-title a",
    "header h2 a",
    "header h1 a",
    "h2 a",
    "h1 a",
  ]);

  if (!heading) return null;

  const href = absUrl(attrOf(heading, "href"));
  const rawTitle = textOf(heading);
  if (!href || !rawTitle) return null;

  const parsed = parseTitleAndAuthor(rawTitle);

  const excerptNode = first(article, [
    ".entry-summary",
    ".entry-content",
    ".post-excerpt",
    "p",
  ]);

  const dateNode = first(article, [
    "time.entry-date",
    ".posted-on time",
    "time",
  ]);

  const categories = getCategories(article);

  return {
    id: href,
    title: parsed.title || rawTitle,
    author: parsed.author,
    cover: imageFrom(article),
    format: "books",
    extra: {
      source: "LectuePublibre6",
      pageUrl: href,
      originalTitle: rawTitle,
      description: textOf(excerptNode) || undefined,
      date: textOf(dateNode) || attrOf(dateNode, "datetime") || undefined,
      categories: categories.length ? categories.join(", ") : undefined,
      status: "catalogue",
    },
  };
}

async function fetchDocument(url) {
  const response = await cinder.fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 Cinder-Extension",
      "Accept": "text/html,application/xhtml+xml",
      "Referer": BASE_URL + "/",
    },
  });

  if (response.status !== 200) {
    cinder.warn("LectuePublibre6 HTTP error", response.status, url);
    throw new Error(`HTTP ${response.status}`);
  }

  return cinder.parseHTML(response.data);
}

function pageUrlForSearch(query, page) {
  const p = Math.max(0, Number(page || 0));
  const q = encodeURIComponent(cleanText(query));

  if (p === 0) {
    return `${BASE_URL}/?s=${q}`;
  }

  // WordPress paginated search convention.
  return `${BASE_URL}/page/${p + 1}/?s=${q}`;
}

function pageUrlForLatest(page) {
  const p = Math.max(0, Number(page || 0));
  return p === 0 ? `${BASE_URL}/` : `${BASE_URL}/page/${p + 1}/`;
}

function parseListing(doc) {
  const results = [];
  const seen = {};

  let articles = all(doc, [
    "article",
    ".site-main article",
    "main article",
    ".post",
  ]);

  articles.forEach((article) => {
    const item = parseArticle(article);
    if (!item || !item.id || seen[item.id]) return;
    seen[item.id] = true;
    results.push(item);
  });

  // Fallback for themes where search results are not wrapped in <article>.
  if (!results.length) {
    const headings = all(doc, [
      ".entry-title",
      "h2.entry-title",
      "main h2",
    ]);

    headings.forEach((heading) => {
      const link = first(heading, ["a"]);
      if (!link) return;

      const href = absUrl(attrOf(link, "href"));
      const rawTitle = textOf(link);
      if (!href || !rawTitle || seen[href]) return;

      const parsed = parseTitleAndAuthor(rawTitle);
      seen[href] = true;

      results.push({
        id: href,
        title: parsed.title || rawTitle,
        author: parsed.author,
        format: "books",
        extra: {
          source: "LectuePublibre6",
          pageUrl: href,
          originalTitle: rawTitle,
          status: "catalogue",
        },
      });
    });
  }

  return results;
}

async function enrichCatalogueItem(item) {
  if (!item || !item.id) return item;

  try {
    const doc = await fetchDocument(item.id);

    const titleNode = first(doc, [
      "h1.entry-title",
      ".entry-title",
      "main h1",
      "article h1",
      "h1",
    ]);

    const rawTitle = textOf(titleNode) || item.extra?.originalTitle || item.title;
    const parsed = parseTitleAndAuthor(rawTitle);

    const article = first(doc, ["article", ".site-main article", "main article"]) || doc;

    const contentNode = first(article, [
      ".entry-content",
      ".post-content",
      "main .entry-content",
    ]);

    const dateNode = first(article, [
      "time.entry-date",
      ".posted-on time",
      "time",
    ]);

    const categories = getCategories(article);
    const cover = imageFrom(article) || item.cover;

    // Clean synopsis: only catalogue text; do not inspect or expose external
    // download buttons/URLs.
    let description = textOf(contentNode);
    if (description.length > 1500) description = description.slice(0, 1500) + "…";

    return {
      ...item,
      title: parsed.title || item.title,
      author: parsed.author || item.author,
      cover,
      extra: {
        ...(item.extra || {}),
        source: "LectuePublibre6",
        pageUrl: item.id,
        originalTitle: rawTitle,
        description: description || item.extra?.description,
        date: textOf(dateNode) || attrOf(dateNode, "datetime") || item.extra?.date,
        categories: categories.length
          ? categories.join(", ")
          : item.extra?.categories,
        status: "catalogue",
      },
    };
  } catch (err) {
    cinder.warn("Could not enrich LectuePublibre6 item", String(err));
    return item;
  }
}

__cinderExport = {
  id: "lectuepublibre6-catalogue",
  name: "LectuePublibre6 Catalogue",
  version: "1.0.0",
  icon: "📚",
  description:
    "Recherche et consultation du catalogue LectuePublibre6. Cette extension n'extrait pas les liens de téléchargement.",

  contentType: "books",
  contentTypes: ["ebook"],

  capabilities: {
    search: true,
    discover: true,
    download: true,
    resolve: true,
    searchDownloads: false,
    manga: false,
  },

  async search(query, page = 0) {
    const q = cleanText(query);
    if (!q) return [];

    try {
      const doc = await fetchDocument(pageUrlForSearch(q, page));
      return parseListing(doc);
    } catch (err) {
      cinder.warn("LectuePublibre6 search failed", String(err));
      return [];
    }
  },

  async getDiscoverSections() {
    return [
      {
        id: "latest",
        title: "Dernières publications",
        icon: "🆕",
      },
      {
        id: "romantico",
        title: "Romantique",
        icon: "❤️",
      },
      {
        id: "thriller",
        title: "Thriller",
        icon: "🔎",
      },
      {
        id: "ficcion",
        title: "Fiction",
        icon: "📖",
      },
    ];
  },

  async getDiscoverItems(sectionId, page = 0) {
    try {
      if (sectionId === "latest") {
        const doc = await fetchDocument(pageUrlForLatest(page));
        return parseListing(doc);
      }

      // Categories are implemented as catalogue searches instead of assuming
      // WordPress category slugs that may change.
      const queries = {
        romantico: "Romántico",
        thriller: "Thriller",
        ficcion: "Ficción",
      };

      const query = queries[sectionId];
      if (!query) return [];

      return await this.search(query, page);
    } catch (err) {
      cinder.warn("LectuePublibre6 discover failed", String(err));
      return [];
    }
  },

  // Optional catalogue-detail helper for Cinder versions/custom forks that
  // call getDetails(). It deliberately returns metadata only.
  async getDetails(item) {
    return await enrichCatalogueItem(item);
  },

  getSettings() {
    return [];
  },
};
