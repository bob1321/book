// LectuepubLibre6 — Source pour Cinder
// Correction: la recherche utilisait une URL différente qui ne fonctionnait pas

var LectuepubLibre6 = {};

LectuepubLibre6.id = "lectuepub6";
LectuepubLibre6.name = "Lectuepub Libre";
LectuepubLibre6.version = "1.0.3";
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

// ─── Fonction commune pour extraire les livres du HTML ─────────────────────

LectuepubLibre6._extractBooks = function(html) {
  var results = [];
  
  // Pattern 1: Articles WordPress standards
  var articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  var match;
  
  while ((match = articleRegex.exec(html)) !== null) {
    var article = match[1];
    
    // Chercher le lien principal (titre du livre)
    var linkMatch = article.match(/<h[23][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i) ||
                    article.match(/<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/i) ||
                    article.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/i);
    
    if (!linkMatch) continue;
    
    var bookUrl = this._cleanUrl(linkMatch[1]);
    var title = this._cleanText(linkMatch[2] || linkMatch[0]);
    
    // Filtrer les liens qui ne sont pas des livres
    if (!bookUrl || 
        bookUrl.includes("/page/") || 
        bookUrl.includes("/category/") || 
        bookUrl.includes("/tag/") ||
        bookUrl.includes("/author/")) {
      continue;
    }
    
    if (!title || title.length < 2) continue;
    
    // Chercher l'image
    var imgMatch = article.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i) ||
                   article.match(/<img[^>]+data-src=["']([^"']+)["'][^>]*>/i) ||
                   article.match(/<img[^>]+srcset=["']([^"'\s]+)/i);
    var cover = imgMatch ? this._cleanUrl(imgMatch[1]) : undefined;
    
    // Chercher l'auteur dans les tags
    var authorMatch = article.match(/<a[^>]+rel=["']tag["'][^>]*>([^<]+)<\/a>/i);
    var author = authorMatch ? this._cleanText(authorMatch[1]) : "Desconocido";
    
    // Extraire l'ID de l'URL
    var idMatch = bookUrl.match(/\/([^\/]+)\/?$/);
    var bookId = idMatch ? idMatch[1] : String(Math.random()).slice(2, 10);

    results.push({
      id: "lp6_" + bookId,
      title: title,
      author: author,
      cover: cover,
      source: this.name,
      extra: {
        bookUrl: bookUrl,
        bookId: bookId
      }
    });
  }
  
  // Pattern 2: Si pas d'articles trouvés, chercher des divs avec class post
  if (results.length === 0) {
    var divRegex = /<div[^>]*class=["'][^"']*post[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
    while ((match = divRegex.exec(html)) !== null) {
      var div = match[1];
      
      var linkMatch = div.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/i);
      if (!linkMatch) continue;
      
      var bookUrl = this._cleanUrl(linkMatch[1]);
      var title = this._cleanText(linkMatch[2]);
      
      if (!title || title.length < 3) continue;
      if (bookUrl.includes("/page/") || bookUrl.includes("/category/")) continue;
      
      var imgMatch = div.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
      var cover = imgMatch ? this._cleanUrl(imgMatch[1]) : undefined;
      
      var idMatch = bookUrl.match(/\/([^\/]+)\/?$/);
      var bookId = idMatch ? idMatch[1] : String(results.length);

      results.push({
        id: "lp6_" + bookId,
        title: title,
        author: "Desconocido",
        cover: cover,
        source: this.name,
        extra: { bookUrl: bookUrl, bookId: bookId }
      });
    }
  }
  
  return results;
};

// ─── Recherche ─────────────────────────────────────────────────────────────

LectuepubLibre6.search = async function(query, page) {
  var q = String(query || "").trim();
  if (!q) return [];

  var p = page && page > 1 ? page : 1;
  
  // CORRECTION: L'URL de recherche sur WordPress est généralement:
  // /?s=mot+clé ou /search/mot+clé ou /page/X/?s=mot
  // Essayons plusieurs formats
  
  var searchUrls = [
    this.baseUrl + "/?s=" + encodeURIComponent(q) + "&paged=" + p,
    this.baseUrl + "/page/" + p + "/?s=" + encodeURIComponent(q),
    this.baseUrl + "/search/" + encodeURIComponent(q) + "/page/" + p + "/"
  ];
  
  var lastError = null;
  
  for (var i = 0; i < searchUrls.length; i++) {
    var searchUrl = searchUrls[i];
    
    try {
      var r = await cinder.fetch(searchUrl, {
        method: "GET",
        headers: {
          "User-Agent": this.UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-ES,es;q=0.9",
        },
        timeout: 30000,
      });

      if (!r || !r.data) continue;
      
      var html = String(r.data);
      var results = this._extractBooks(html);
      
      if (results.length > 0) {
        return results;
      }
      
    } catch (e) {
      lastError = e;
      continue;
    }
  }
  
  // Si aucune URL n'a fonctionné, retourner vide
  return [];
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

    var html = String(r.data);
    return this._extractBooks(html);

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

    // Pattern 1: Lien .epub direct
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

    // Pattern 3: Bouton/lien avec texte EPUB/PDF
    if (!downloadUrl) {
      var textMatch = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*EPUB/i) ||
                      html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*PDF/i);
      if (textMatch) {
        downloadUrl = this._cleanUrl(textMatch[1]);
        fileFormat = html.toLowerCase().includes("pdf") ? "pdf" : "epub";
      }
    }

    // Pattern 4: Class download
    if (!downloadUrl) {
      var btnMatch = html.match(/<a[^>]+class=["'][^"']*download[^"']*["'][^>]+href=["']([^"']+)["']/i);
      if (btnMatch) {
        downloadUrl = this._cleanUrl(btnMatch[1]);
      }
    }

    if (!downloadUrl) {
      throw new Error("Lien de téléchargement non trouvé");
    }

    // Déterminer format depuis l'URL
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
