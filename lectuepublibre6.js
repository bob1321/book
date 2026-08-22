// LectuepubLibre6 — Version finale API WordPress REST
// Basée sur la structure de Z-Library qui fonctionne

var LectuepubLibre6 = {};

LectuepubLibre6.id = "lectuepub6";
LectuepubLibre6.name = "Lectuepub Libre";
LectuepubLibre6.version = "2.0.1";
LectuepubLibre6.icon = "book-outline";
LectuepubLibre6.description = "Descargar libros EPUB y PDF gratis en español desde LectuepubLibre6";

LectuepubLibre6.contentType = "books";
LectuepubLibre6.contentTypes = ["ebook"];

LectuepubLibre6.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: true,
  searchDownloads: true,
  bookChapters: false,
  manga: false,
};

LectuepubLibre6.UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// ─── Configuration ───────────────────────────────────────────────────────────

LectuepubLibre6._base = function() {
  return "https://lectuepublibre6.com";
};

LectuepubLibre6._api = function() {
  return this._base() + "/wp-json/wp/v2";
};

LectuepubLibre6._clean = function(text) {
  if (!text) return "";
  return String(text)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
};

// ─── HTTP ─────────────────────────────────────────────────────────────────────

LectuepubLibre6._appel = async function(url, contexte) {
  var r;
  try {
    r = await cinder.fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": this.UA,
      },
      timeout: 30000,
    });
  } catch (e) {
    throw new Error("LectuepubLibre6 injoignable (" + contexte + ").");
  }
  
  if (!r) throw new Error("LectuepubLibre6: pas de réponse (" + contexte + ").");
  
  var corps = String(r.data || "").trim();
  if (corps.charAt(0) === "<") {
    throw new Error("LectuepubLibre6 a retourné une page HTML au lieu de JSON (" + contexte + ").");
  }
  
  if (r.status < 200 || r.status >= 300) {
    throw new Error("LectuepubLibre6: HTTP " + r.status + " (" + contexte + ").");
  }
  
  try {
    return JSON.parse(corps);
  } catch (e) {
    throw new Error("LectuepubLibre6: réponse illisible (" + contexte + ").");
  }
};

// ─── Conversion ───────────────────────────────────────────────────────────────

LectuepubLibre6._versResultats = function(posts) {
  if (!Array.isArray(posts)) return [];
  
  return posts.map(function(post) {
    var title = post.title && post.title.rendered ? this._clean(post.title.rendered) : "Sin título";
    var url = post.link || "";
    
    // Image mise en avant
    var cover = "";
    if (post._embedded && post._embedded["wp:featuredmedia"] && post._embedded["wp:featuredmedia"][0]) {
      cover = post._embedded["wp:featuredmedia"][0].source_url || "";
    }
    
    // Auteur
    var author = "Desconocido";
    if (post._embedded && post._embedded.author && post._embedded.author[0]) {
      author = post._embedded.author[0].name || "Desconocido";
    }
    
    return {
      id: "lp6_" + post.id,
      title: title,
      author: author,
      cover: cover || undefined,
      url: url,
      source: "Lectuepub Libre",
      extra: {
        bookUrl: url,
        bookId: String(post.id),
        slug: post.slug || ""
      }
    };
  }.bind(this));
};

// ─── Recherche ────────────────────────────────────────────────────────────────

LectuepubLibre6.search = async function(query, page) {
  var q = String(query || "").trim();
  if (!q) return [];
  
  var p = page && page > 1 ? page : 1;
  var url = this._api() + "/posts?search=" + encodeURIComponent(q) + "&per_page=20&page=" + p + "&_embed";
  
  cinder.log("[LectuepubLibre6] Recherche: " + q + " (page " + p + ")");
  
  var data = await this._appel(url, "recherche");
  var results = this._versResultats(data);
  
  cinder.log("[LectuepubLibre6] " + results.length + " résultat(s)");
  return results;
};

// ─── Découverte ───────────────────────────────────────────────────────────────

LectuepubLibre6.getDiscoverSections = async function() {
  return [
    { id: "recientes", title: "Recientes", icon: "time" },
    { id: "pagina2", title: "Página 2", icon: "file" }
  ];
};

LectuepubLibre6.getDiscoverItems = async function(sectionId, page) {
  var p = page && page > 1 ? page : 1;
  if (sectionId === "pagina2") p = 2;
  
  var url = this._api() + "/posts?per_page=20&page=" + p + "&_embed";
  
  var data = await this._appel(url, "découverte");
  return this._versResultats(data);
};

// ─── Résolution ─────────────────────────────────────────────────────────────────

LectuepubLibre6.resolve = async function(item) {
  var e = (item && item.extra) || {};
  if (!e.bookId) throw new Error("Identifiant du livre manquant.");
  
  // Récupérer le contenu complet du post
  var url = this._api() + "/posts/" + encodeURIComponent(e.bookId) + "?_embed";
  var post = await this._appel(url, "résolution");
  
  if (!post || !post.content || !post.content.rendered) {
    throw new Error("Contenu du livre non trouvé.");
  }
  
  var content = post.content.rendered;
  var downloadUrl = null;
  var fileFormat = "epub";
  
  // Chercher les liens de téléchargement dans le contenu
  var patterns = [
    /href=["'](https?:\/\/send\.now\/[^"']+)["']/i,
    /href=["'](https?:\/\/www\.upload\.ee\/[^"']+)["']/i,
    /href=["'](https?:\/\/krakenfiles\.com\/[^"']+)["']/i,
    /href=["'](https?:\/\/ey43\.com\/[^"']+)["']/i,
    /href=["']([^"']+\.epub[^"']*)["']/i,
    /href=["']([^"']+\.pdf[^"']*)["']/i,
  ];
  
  for (var i = 0; i < patterns.length; i++) {
    var match = content.match(patterns[i]);
    if (match) {
      downloadUrl = match[1].startsWith("http") ? match[1] : this._base() + "/" + match[1];
      if (match[1].toLowerCase().includes(".pdf")) fileFormat = "pdf";
      break;
    }
  }
  
  if (!downloadUrl) {
    throw new Error("Lien de téléchargement non trouvé dans le contenu.");
  }
  
  var fileName = this._clean(item.title || "libro").replace(/[\\/:*?"<>|]+/g, " ") + "." + fileFormat;
  
  return {
    url: downloadUrl,
    fileName: fileName,
    headers: { Referer: e.bookUrl || this._base() + "/" }
  };
};

__cinderExport = LectuepubLibre6;
