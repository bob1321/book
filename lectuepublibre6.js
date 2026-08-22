// LectuepubLibre6 — Source pour Cinder
// Si la recherche échoue, on filtre les livres de la page d'accueil

var LectuepubLibre6 = {};

LectuepubLibre6.id = "lectuepub6";
LectuepubLibre6.name = "Lectuepub Libre";
LectuepubLibre6.version = "1.0.4";
LectuepubLibre6.icon = "book-outline";
LectuepubLibre6.description = "Descargar libros EPUB y PDF gratis en español.";

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

LectuepubLibre6.UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
LectuepubLibre6.baseUrl = "https://lectuepublibre6.com";

// Cache pour éviter de re-télécharger
LectuepubLibre6._cache = null;
LectuepubLibre6._cacheTime = 0;

LectuepubLibre6._cleanText = function(text) {
  if (!text) return "";
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, function(match, dec) { return String.fromCharCode(dec); })
    .replace(/<[^>]+>/g, "")
    .trim();
};

LectuepubLibre6._cleanUrl = function(url) {
  if (!url) return "";
  url = url.replace(/&amp;/g, "&");
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return this.baseUrl + url;
  if (!url.startsWith("http")) return this.baseUrl + "/" + url;
  return url;
};

// ─── Extraction des livres ─────────────────────────────────────────────────

LectuepubLibre6._extractBooks = function(html) {
  var results = [];
  var seen = {};
  
  // Pattern 1: Articles WordPress
  var articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  var match;
  
  while ((match = articleRegex.exec(html)) !== null) {
    var article = match[1];
    
    var linkMatch = article.match(/<h[23][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i) ||
                    article.match(/<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/i) ||
                    article.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/i);
    
    if (!linkMatch) continue;
    
    var bookUrl = this._cleanUrl(linkMatch[1]);
    var title = this._cleanText(linkMatch[2] || linkMatch[0]);
    
    if (!bookUrl || bookUrl.includes("/page/") || bookUrl.includes("/category/") || bookUrl.includes("/tag/") || bookUrl.includes("/author/")) {
      continue;
    }
    
    if (!title || title.length < 2) continue;
    
    // Éviter les doublons
    if (seen[bookUrl]) continue;
    seen[bookUrl] = true;
    
    var imgMatch = article.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i) ||
                   article.match(/<img[^>]+data-src=["']([^"']+)["'][^>]*>/i);
    var cover = imgMatch ? this._cleanUrl(imgMatch[1]) : undefined;
    
    var authorMatch = article.match(/<a[^>]+rel=["']tag["'][^>]*>([^<]+)<\/a>/i);
    var author = authorMatch ? this._cleanText(authorMatch[1]) : "Desconocido";
    
    var idMatch = bookUrl.match(/\/([^\/]+)\/?$/);
    var bookId = idMatch ? idMatch[1] : String(Math.random()).slice(2, 10);

    results.push({
      id: "lp6_" + bookId,
      title: title,
      author: author,
      cover: cover,
      source: this.name,
      extra: { bookUrl: bookUrl, bookId: bookId }
    });
  }
  
  return results;
};

// ─── Récupérer tous les livres (plusieurs pages) ───────────────────────────

LectuepubLibre6._fetchAllBooks = async function() {
  var now = Date.now();
  // Cache de 5 minutes
  if (this._cache && (now - this._cacheTime) < 300000) {
    return this._cache;
  }
  
  var allBooks = [];
  
  // Récupérer les 3 premières pages
  for (var page = 1; page <= 3; page++) {
    try {
      var url = this.baseUrl + "/page/" + page + "/";
      var r = await cinder.fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": this.UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-ES,es;q=0.9",
          "Referer": this.baseUrl + "/",
        },
        timeout: 30000,
      });
      
      if (r && r.data) {
        var books = this._extractBooks(String(r.data));
        allBooks = allBooks.concat(books);
      }
    } catch (e) {
      break;
    }
  }
  
  this._cache = allBooks;
  this._cacheTime = now;
  return allBooks;
};

// ─── Recherche (avec fallback) ────────────────────────────────────────────

LectuepubLibre6.search = async function(query, page) {
  var q = String(query || "").trim().toLowerCase();
  if (!q) return [];

  // Essayer la recherche normale d'abord
  try {
    var searchUrl = this.baseUrl + "/?s=" + encodeURIComponent(query);
    var r = await cinder.fetch(searchUrl, {
      method: "GET",
      headers: {
        "User-Agent": this.UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9",
      },
      timeout: 30000,
    });

    if (r && r.data) {
      var html = String(r.data);
      // Vérifier si c'est une page de résultats ou une redirection
      if (html.includes("s=") || html.includes("search") || html.includes("result")) {
        var results = this._extractBooks(html);
        if (results.length > 0) {
          return results;
        }
      }
    }
  } catch (e) {
    // Ignorer et passer au fallback
  }

  // FALLBACK: Récupérer tous les livres et filtrer côté client
  cinder.log("[lectuepub] Fallback: filtrage côté client pour: " + q);
  
  var allBooks = await this._fetchAllBooks();
  var filtered = [];
  
  var searchTerms = q.split(/\s+/);
  
  for (var i = 0; i < allBooks.length; i++) {
    var book = allBooks[i];
    var titleLower = book.title.toLowerCase();
    var authorLower = (book.author || "").toLowerCase();
    
    // Vérifier si tous les termes sont présents
    var match = true;
    for (var j = 0; j < searchTerms.length; j++) {
      if (titleLower.indexOf(searchTerms[j]) === -1 && 
          authorLower.indexOf(searchTerms[j]) === -1) {
        match = false;
        break;
      }
    }
    
    if (match) {
      filtered.push(book);
    }
  }
  
  return filtered;
};

// ─── Découverte ─────────────────────────────────────────────────────────────

LectuepubLibre6.getDiscoverSections = async function() {
  return [
    { id: "novedades", title: "Novedades", icon: "time" },
    { id: "populares", title: "Populares", icon: "flame" }
  ];
};

LectuepubLibre6.getDiscoverItems = async function(sectionId, page) {
  var p = page && page > 1 ? page : 1;
  var books = await this._fetchAllBooks();
  
  // Pagination manuelle
  var perPage = 10;
  var start = (p - 1) * perPage;
  return books.slice(start, start + perPage);
};

// ─── Résolution ───────────────────────────────────────────────────────────────

LectuepubLibre6.resolve = async function(item) {
  var e = (item && item.extra) || {};
  
  if (!e.bookUrl) {
    throw new Error("URL du livre manquante");
  }

  try {
    var r = await cinder.fetch(e.bookUrl, {
      method: "GET",
      headers: { 
        "User-Agent": this.UA, 
        "Accept": "text/html,*/*",
        "Accept-Language": "es-ES,es;q=0.9",
        "Referer": this.baseUrl + "/",
      },
      timeout: 30000,
    });

    if (!r || !r.data) {
      throw new Error("Page inaccessible");
    }

    var html = String(r.data);
    var downloadUrl = null;
    var fileFormat = "epub";

    // Pattern 1: Lien .epub
    var epubMatch = html.match(/href=["']([^"']+\.epub[^"']*)["']/i);
    if (epubMatch) {
      downloadUrl = this._cleanUrl(epubMatch[1]);
      fileFormat = "epub";
    }

    // Pattern 2: Lien .pdf
    if (!downloadUrl) {
      var pdfMatch = html.match(/href=["']([^"']+\.pdf[^"']*)["']/i);
      if (pdfMatch) {
        downloadUrl = this._cleanUrl(pdfMatch[1]);
        fileFormat = "pdf";
      }
    }

    // Pattern 3: Texte EPUB/PDF
    if (!downloadUrl) {
      var textMatch = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*EPUB/i) ||
                      html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*PDF/i);
      if (textMatch) {
        downloadUrl = this._cleanUrl(textMatch[1]);
        fileFormat = html.toLowerCase().includes("pdf") ? "pdf" : "epub";
      }
    }

    // Pattern 4: Bouton download
    if (!downloadUrl) {
      var btnMatch = html.match(/<a[^>]+class=["'][^"']*download[^"']*["'][^>]+href=["']([^"']+)["']/i) ||
                     html.match(/<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*download[^"']*["']/i);
      if (btnMatch) {
        downloadUrl = this._cleanUrl(btnMatch[1]);
      }
    }

    if (!downloadUrl) {
      throw new Error("Lien de téléchargement non trouvé");
    }

    var urlLower = downloadUrl.toLowerCase();
    if (urlLower.includes(".pdf")) fileFormat = "pdf";
    else if (urlLower.includes(".epub")) fileFormat = "epub";

    var fileName = String(item.title || "libro")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .trim() + "." + fileFormat;

    return {
      url: downloadUrl,
      fileName: fileName,
    };

  } catch (e) {
    throw new Error("Erreur: " + e.message);
  }
};

__cinderExport = LectuepubLibre6;
