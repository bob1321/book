// LectuepubLibre6 — Source pour Cinder
// Utilise l'API REST WordPress si disponible, sinon fallback

var LectuepubLibre6 = {};

LectuepubLibre6.id = "lectuepub6";
LectuepubLibre6.name = "Lectuepub Libre";
LectuepubLibre6.version = "1.0.5";
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

LectuepubLibre6.UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
LectuepubLibre6.baseUrl = "https://lectuepublibre6.com";

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

// ─── Parser un livre depuis HTML ───────────────────────────────────────────

LectuepubLibre6._parseBookFromHTML = function(html, bookUrl) {
  // Extraire le titre
  var titleMatch = html.match(/<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
                   html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
                   html.match(/<title>([\s\S]*?)<\/title>/i);
  var title = titleMatch ? this._cleanText(titleMatch[1]) : "Sans titre";
  
  // Extraire l'image
  var imgMatch = html.match(/<img[^>]+class=["'][^"']*wp-post-image[^"']*["'][^>]+src=["']([^"']+)["']/i) ||
                 html.match(/<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*wp-post-image/i) ||
                 html.match(/<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*(?:cover|featured)[^"']*/i);
  var cover = imgMatch ? this._cleanUrl(imgMatch[1]) : undefined;
  
  // Extraire l'auteur depuis les tags ou meta
  var authorMatch = html.match(/<a[^>]+rel=["']tag["'][^>]*>([^<]+)<\/a>/i) ||
                    html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i);
  var author = authorMatch ? this._cleanText(authorMatch[1]) : "Desconocido";
  
  var idMatch = bookUrl.match(/\/([^\/]+)\/?$/);
  var bookId = idMatch ? idMatch[1] : String(Math.random()).slice(2, 10);
  
  return {
    id: "lp6_" + bookId,
    title: title,
    author: author,
    cover: cover,
    source: this.name,
    extra: { bookUrl: bookUrl, bookId: bookId }
  };
};

// ─── Essayer l'API WordPress ───────────────────────────────────────────────

LectuepubLibre6._searchAPI = async function(query) {
  // API REST WordPress standard
  var apiUrl = this.baseUrl + "/wp-json/wp/v2/posts?search=" + encodeURIComponent(query) + "&per_page=20";
  
  try {
    var r = await cinder.fetch(apiUrl, {
      method: "GET",
      headers: {
        "User-Agent": this.UA,
        "Accept": "application/json",
      },
      timeout: 15000,
    });
    
    if (!r || !r.data) return [];
    
    var json = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
    var results = [];
    
    for (var i = 0; i < json.length; i++) {
      var post = json[i];
      var bookUrl = post.link;
      var title = this._cleanText(post.title.rendered || post.title);
      
      // Extraire image featured
      var cover = post.featured_media_src_url || 
                  (post._embedded && post._embedded["wp:featuredmedia"] && 
                   post._embedded["wp:featuredmedia"][0] && 
                   post._embedded["wp:featuredmedia"][0].source_url);
      
      // Extraire auteur depuis les catégories ou tags
      var author = "Desconocido";
      if (post._embedded && post._embedded["wp:term"]) {
        var terms = post._embedded["wp:term"];
        for (var t = 0; t < terms.length; t++) {
          for (var tt = 0; tt < terms[t].length; tt++) {
            if (terms[t][tt].taxonomy === "post_tag") {
              author = this._cleanText(terms[t][tt].name);
              break;
            }
          }
        }
      }
      
      var idMatch = bookUrl.match(/\/([^\/]+)\/?$/);
      var bookId = idMatch ? idMatch[1] : String(post.id);
      
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
  } catch (e) {
    return [];
  }
};

// ─── Récupérer les livres depuis le HTML ───────────────────────────────────

LectuepubLibre6._fetchBooksFromPage = async function(pageNum) {
  var url = this.baseUrl + "/page/" + pageNum + "/";
  
  try {
    var r = await cinder.fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": this.UA,
        "Accept": "text/html,*/*",
      },
      timeout: 15000,
    });
    
    if (!r || !r.data) return [];
    
    var html = String(r.data);
    var results = [];
    var seen = {};
    
    // Pattern: articles WordPress
    var articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    var match;
    
    while ((match = articleRegex.exec(html)) !== null) {
      var article = match[1];
      
      var linkMatch = article.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;
      
      var bookUrl = this._cleanUrl(linkMatch[1]);
      var title = this._cleanText(linkMatch[2]);
      
      if (!title || title.length < 2) continue;
      if (bookUrl.includes("/page/") || bookUrl.includes("/category/") || bookUrl.includes("/tag/")) continue;
      if (seen[bookUrl]) continue;
      seen[bookUrl] = true;
      
      var imgMatch = article.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
      var cover = imgMatch ? this._cleanUrl(imgMatch[1]) : undefined;
      
      var authorMatch = article.match(/<a[^>]+rel=["']tag["'][^>]*>([^<]+)<\/a>/i);
      var author = authorMatch ? this._cleanText(authorMatch[1]) : "Desconocido";
      
      var idMatch = bookUrl.match(/\/([^\/]+)\/?$/);
      var bookId = idMatch ? idMatch[1] : String(results.length);
      
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
  } catch (e) {
    return [];
  }
};

// ─── Recherche ─────────────────────────────────────────────────────────────

LectuepubLibre6.search = async function(query, page) {
  var q = String(query || "").trim().toLowerCase();
  if (!q) return [];

  // Essayer l'API d'abord
  var apiResults = await this._searchAPI(query);
  if (apiResults.length > 0) {
    return apiResults;
  }

  // FALLBACK: Récupérer plusieurs pages et filtrer
  cinder.log("[lectuepub] API indisponible, utilisation du fallback");
  
  var allBooks = [];
  var pagesToFetch = page && page > 1 ? [page, page + 1, page + 2] : [1, 2, 3];
  
  for (var i = 0; i < pagesToFetch.length; i++) {
    var books = await this._fetchBooksFromPage(pagesToFetch[i]);
    allBooks = allBooks.concat(books);
  }
  
  // Filtrer
  var searchTerms = q.split(/\s+/);
  var filtered = [];
  
  for (var j = 0; j < allBooks.length; j++) {
    var book = allBooks[j];
    var titleLower = book.title.toLowerCase();
    var authorLower = (book.author || "").toLowerCase();
    
    var match = true;
    for (var k = 0; k < searchTerms.length; k++) {
      if (titleLower.indexOf(searchTerms[k]) === -1 && 
          authorLower.indexOf(searchTerms[k]) === -1) {
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
  return this._fetchBooksFromPage(p);
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
      },
      timeout: 30000,
    });

    if (!r || !r.data) {
      throw new Error("Page inaccessible");
    }

    var html = String(r.data);
    var downloadUrl = null;
    var fileFormat = "epub";

    // Chercher les liens de téléchargement
    var patterns = [
      /href=["']([^"']+\.epub[^"']*)["']/i,
      /href=["']([^"']+\.pdf[^"']*)["']/i,
      /<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*EPUB/i,
      /<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*PDF/i,
      /<a[^>]+class=["'][^"']*download[^"']*["'][^>]+href=["']([^"']+)["']/i,
      /data-url=["']([^"']+)["'][^>]*class=["'][^"']*download/i,
    ];
    
    for (var i = 0; i < patterns.length; i++) {
      var m = html.match(patterns[i]);
      if (m) {
        downloadUrl = this._cleanUrl(m[1]);
        break;
      }
    }

    if (!downloadUrl) {
      // Chercher dans les iframes
      var iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      if (iframeMatch) {
        downloadUrl = this._cleanUrl(iframeMatch[1]);
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
