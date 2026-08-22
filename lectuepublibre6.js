// LectuepubLibre6 — Source pour Cinder
// Version ultra-simplifiée et robuste

var LectuepubLibre6 = {};

LectuepubLibre6.id = "lectuepub6";
LectuepubLibre6.name = "Lectuepub Libre";
LectuepubLibre6.version = "1.0.6";
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
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

LectuepubLibre6._cleanUrl = function(url) {
  if (!url) return "";
  url = url.replace(/&amp;/g, "&").trim();
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return this.baseUrl + url;
  if (!url.startsWith("http")) return this.baseUrl + "/" + url;
  return url;
};

// ─── Extraction ultra-simple ─────────────────────────────────────────────

LectuepubLibre6._extractBooks = function(html) {
  var results = [];
  var seen = {};
  
  // Méthode 1: Chercher tous les liens vers des pages de livres
  // Pattern: href="https://lectuepublibre6.com/TITRE-AUTEUR/"
  var linkPattern = /href=["'](https?:\/\/lectuepublibre6\.com\/[a-z0-9\-]+(?:\-[a-z0-9\-]+)*\/?)["']/gi;
  var match;
  
  while ((match = linkPattern.exec(html)) !== null) {
    var url = match[1];
    
    // Filtrer les URLs non-livres
    if (url.includes("/page/") || 
        url.includes("/category/") || 
        url.includes("/tag/") ||
        url.includes("/author/") ||
        url.includes("/wp-content/") ||
        url.includes("/feed/") ||
        url.includes("/xmlrpc.php") ||
        seen[url]) {
      continue;
    }
    
    // Vérifier que l'URL ressemble à un livre (au moins 2 tirets = titre-complet)
    var pathMatch = url.match(/\/([a-z0-9\-]{10,})\/?$/i);
    if (!pathMatch) continue;
    
    seen[url] = true;
    
    var slug = pathMatch[1];
    var title = slug
      .replace(/-/g, " ")
      .replace(/\b\w/g, function(l) { return l.toUpperCase(); });
    
    // Chercher une image associée proche dans le HTML
    var searchStart = Math.max(0, match.index - 1000);
    var searchEnd = Math.min(html.length, match.index + 500);
    var nearbyHtml = html.substring(searchStart, searchEnd);
    
    var imgMatch = nearbyHtml.match(/src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
    var cover = imgMatch ? imgMatch[1] : null;
    
    results.push({
      id: "lp6_" + slug,
      title: title,
      author: "Desconocido",
      cover: cover,
      source: this.name,
      extra: {
        bookUrl: url,
        bookId: slug
      }
    });
  }
  
  // Méthode 2: Si méthode 1 échoue, chercher les articles directement
  if (results.length === 0) {
    // Pattern simple: article avec post-id
    var articlePattern = /<article[^>]*id=["']post-(\d+)["'][^>]*>/gi;
    while ((match = articlePattern.exec(html)) !== null) {
      var postId = match[1];
      var articleStart = match.index;
      var articleEnd = html.indexOf("</article>", articleStart);
      if (articleEnd === -1) continue;
      
      var article = html.substring(articleStart, articleEnd + 10);
      
      // Chercher le premier lien qui n'est pas une catégorie/tag
      var urlMatch = article.match(/href=["'](https?:\/\/lectuepublibre6\.com\/[^"']+)["']/i);
      if (!urlMatch) continue;
      
      var url = urlMatch[1];
      if (url.includes("/category/") || url.includes("/tag/") || url.includes("/author/")) continue;
      
      // Chercher le titre dans un h2
      var titleMatch = article.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
      var title = titleMatch ? this._cleanText(titleMatch[1]) : "Libro " + postId;
      
      // Chercher l'image
      var imgMatch = article.match(/src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
      var cover = imgMatch ? imgMatch[1] : null;
      
      if (!seen[url]) {
        seen[url] = true;
        results.push({
          id: "lp6_" + postId,
          title: title,
          author: "Desconocido",
          cover: cover,
          source: this.name,
          extra: {
            bookUrl: url,
            bookId: postId
          }
        });
      }
    }
  }
  
  return results;
};

// ─── Recherche ─────────────────────────────────────────────────────────────

LectuepubLibre6.search = async function(query, page) {
  var q = String(query || "").trim();
  if (!q) return [];

  var p = page && page > 1 ? page : 1;
  var searchUrl = this.baseUrl + "/?s=" + encodeURIComponent(q);
  if (p > 1) {
    searchUrl += "&paged=" + p;
  }

  try {
    var r = await cinder.fetch(searchUrl, {
      method: "GET",
      headers: {
        "User-Agent": this.UA,
        "Accept": "text/html,*/*",
        "Accept-Language": "es-ES,es;q=0.9",
      },
      timeout: 30000,
    });

    if (!r || !r.data) {
      return [];
    }
    
    var html = String(r.data);
    return this._extractBooks(html);
    
  } catch (e) {
    return [];
  }
};

// ─── Découverte ─────────────────────────────────────────────────────────────

LectuepubLibre6.getDiscoverSections = async function() {
  return [
    { id: "novedades", title: "Novedades", icon: "time" }
  ];
};

LectuepubLibre6.getDiscoverItems = async function(sectionId, page) {
  var p = page && page > 1 ? page : 1;
  var url = this.baseUrl + "/page/" + p + "/";

  try {
    var r = await cinder.fetch(url, {
      method: "GET",
      headers: { 
        "User-Agent": this.UA, 
        "Accept": "text/html,*/*",
        "Accept-Language": "es-ES,es;q=0.9"
      },
      timeout: 30000,
    });

    if (!r || !r.data) return [];
    return this._extractBooks(String(r.data));

  } catch (e) {
    return [];
  }
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
        "Accept-Language": "es-ES,es;q=0.9"
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
      /href=["'](https?:\/\/send\.now\/[^"']+)["']/i,
      /href=["'](https?:\/\/www\.upload\.ee\/[^"']+)["']/i,
      /href=["'](https?:\/\/krakenfiles\.com\/[^"']+)["']/i,
      /href=["'](https?:\/\/ey43\.com\/[^"']+)["']/i,
      /href=["']([^"']+\.epub[^"']*)["']/i,
      /href=["']([^"']+\.pdf[^"']*)["']/i
    ];

    for (var i = 0; i < patterns.length; i++) {
      var match = html.match(patterns[i]);
      if (match) {
        downloadUrl = match[1].startsWith("http") ? match[1] : this._cleanUrl(match[1]);
        if (match[1].toLowerCase().includes(".pdf")) fileFormat = "pdf";
        break;
      }
    }

    if (!downloadUrl) {
      throw new Error("Lien de téléchargement non trouvé");
    }

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
