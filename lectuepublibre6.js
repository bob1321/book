// LectuepubLibre6 — Source pour Cinder
// Version corrigée avec parsing HTML adapté au site

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

// ─── Fonction pour extraire les livres du HTML ─────────────────────────────

LectuepubLibre6._extractBooks = function(html) {
  var results = [];
  var seenUrls = {};
  
  // Pattern 1: Structure du site - liens d'images vers les livres
  // Format: [![](image-url)](book-url)
  var imgLinkPattern = /\[!\[\]\(([^)]+)\)\]\(([^)]+)\)/g;
  var match;
  
  while ((match = imgLinkPattern.exec(html)) !== null) {
    var coverUrl = match[1];
    var bookUrl = match[2];
    
    // Filtrer les liens qui ne sont pas des livres
    if (!bookUrl || 
        bookUrl.includes("/page/") || 
        bookUrl.includes("/category/") || 
        bookUrl.includes("/tag/") ||
        bookUrl.includes("/author/") ||
        bookUrl.includes("wp-content/uploads")) {
      continue;
    }
    
    // Nettoyer les URLs
    coverUrl = this._cleanUrl(coverUrl);
    bookUrl = this._cleanUrl(bookUrl);
    
    // Éviter les doublons
    if (seenUrls[bookUrl]) continue;
    seenUrls[bookUrl] = true;
    
    // Extraire l'ID du livre depuis l'URL
    var idMatch = bookUrl.match(/\/([^\/]+)\/?$/);
    var bookId = idMatch ? idMatch[1] : String(Math.random()).slice(2, 10);
    
    // Extraire le titre depuis l'URL (slug)
    var title = bookId
      .replace(/-/g, " ")
      .replace(/\.html?$/, "")
      .replace(/\b\w/g, function(l) { return l.toUpperCase(); });
    
    // Chercher le texte après l'image pour trouver une meilleure description
    var afterImage = html.substring(match.index + match[0].length, match.index + match[0].length + 500);
    var descMatch = afterImage.match(/([^\[]+)(?=\[|$)/);
    if (descMatch) {
      var desc = this._cleanText(descMatch[1]);
      if (desc && desc.length > 10 && desc.length < 300) {
        // Essayer d'extraire le titre depuis la description si possible
      }
    }
    
    results.push({
      id: "lp6_" + bookId,
      title: title,
      author: "Desconocido",
      cover: coverUrl,
      source: this.name,
      extra: {
        bookUrl: bookUrl,
        bookId: bookId
      }
    });
  }
  
  // Pattern 2: Liens "Seguir leyendo" avec leurs images précédentes
  if (results.length === 0) {
    var seguirPattern = /\[!\[\]\(([^)]+)\)\]\(([^)]+)\)[\s\S]*?\[Seguir leyendo\]\(([^)]+)\)/gi;
    while ((match = seguirPattern.exec(html)) !== null) {
      var coverUrl = match[1];
      var imgLink = match[2];
      var bookUrl = match[3];
      
      if (!bookUrl || bookUrl.includes("/page/") || bookUrl.includes("/category/")) continue;
      
      coverUrl = this._cleanUrl(coverUrl);
      bookUrl = this._cleanUrl(bookUrl);
      
      if (seenUrls[bookUrl]) continue;
      seenUrls[bookUrl] = true;
      
      var idMatch = bookUrl.match(/\/([^\/]+)\/?$/);
      var bookId = idMatch ? idMatch[1] : String(results.length);
      
      var title = bookId.replace(/-/g, " ").replace(/\b\w/g, function(l) { return l.toUpperCase(); });
      
      results.push({
        id: "lp6_" + bookId,
        title: title,
        author: "Desconocido",
        cover: coverUrl,
        source: this.name,
        extra: {
          bookUrl: bookUrl,
          bookId: bookId
        }
      });
    }
  }
  
  // Pattern 3: Recherche générique de liens vers des pages de livres
  if (results.length === 0) {
    // Chercher des liens qui ressemblent à des livres (pas des catégories, tags, etc.)
    var linkPattern = /href=["'](https?:\/\/lectuepublibre6\.com\/[^"']+)["']/gi;
    while ((match = linkPattern.exec(html)) !== null) {
      var url = match[1];
      
      // Filtrer les URLs non-livres
      if (url.includes("/page/") || 
          url.includes("/category/") || 
          url.includes("/tag/") ||
          url.includes("/author/") ||
          url.includes("wp-content") ||
          url.includes("#") ||
          seenUrls[url]) {
        continue;
      }
      
      // Vérifier que ça ressemble à un livre (URL avec des mots séparés par des tirets)
      var pathMatch = url.match(/\/([^\/\-]+-[^\/]+)\/?$/);
      if (!pathMatch) continue;
      
      seenUrls[url] = true;
      
      var bookId = pathMatch[1];
      var title = bookId.replace(/-/g, " ").replace(/\b\w/g, function(l) { return l.toUpperCase(); });
      
      // Chercher une image associée dans le HTML proche
      var beforeLink = html.substring(Math.max(0, match.index - 500), match.index);
      var imgMatch = beforeLink.match(/src=["']([^"']+\.(?:jpg|jpeg|png|webp))["']/i);
      var cover = imgMatch ? this._cleanUrl(imgMatch[1]) : undefined;
      
      results.push({
        id: "lp6_" + bookId,
        title: title,
        author: "Desconocido",
        cover: cover,
        source: this.name,
        extra: {
          bookUrl: url,
          bookId: bookId
        }
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
  
  // L'URL de recherche WordPress standard
  var searchUrl = this.baseUrl + "/?s=" + encodeURIComponent(q);
  if (p > 1) {
    searchUrl += "&paged=" + p;
  }

  try {
    var r = await cinder.fetch(searchUrl, {
      method: "GET",
      headers: {
        "User-Agent": this.UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
      },
      timeout: 30000,
    });

    if (!r || !r.data) {
      return [];
    }
    
    var html = String(r.data);
    var results = this._extractBooks(html);
    
    return results;
    
  } catch (e) {
    return [];
  }
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
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

    // Pattern 1: Send.Now (lien recommandé)
    var sendNowMatch = html.match(/href=["'](https?:\/\/send\.now\/[^"']+)["']/i);
    if (sendNowMatch) {
      downloadUrl = sendNowMatch[1];
    }

    // Pattern 2: Upload.ee
    if (!downloadUrl) {
      var uploadMatch = html.match(/href=["'](https?:\/\/www\.upload\.ee\/[^"']+)["']/i);
      if (uploadMatch) {
        downloadUrl = uploadMatch[1];
      }
    }

    // Pattern 3: KrakenFiles
    if (!downloadUrl) {
      var krakenMatch = html.match(/href=["'](https?:\/\/krakenfiles\.com\/[^"']+)["']/i);
      if (krakenMatch) {
        downloadUrl = krakenMatch[1];
      }
    }

    // Pattern 4: ey43.com (liens via images)
    if (!downloadUrl) {
      var eyMatch = html.match(/href=["'](https?:\/\/ey43\.com\/[^"']+)["']/i);
      if (eyMatch) {
        downloadUrl = eyMatch[1];
      }
    }

    // Pattern 5: Autres hébergeurs communs
    if (!downloadUrl) {
      var hostMatch = html.match(/href=["'](https?:\/\/(?:mega\.nz|mediafire\.com|drive\.google\.com|dropbox\.com|1fichier\.com|zippyshare\.com)[^"']+)["']/i);
      if (hostMatch) {
        downloadUrl = hostMatch[1];
      }
    }

    // Pattern 6: Lien direct .epub ou .pdf
    if (!downloadUrl) {
      var directMatch = html.match(/href=["']([^"']+\.(?:epub|pdf)[^"']*)["']/i);
      if (directMatch) {
        downloadUrl = this._cleanUrl(directMatch[1]);
        fileFormat = directMatch[1].toLowerCase().includes(".pdf") ? "pdf" : "epub";
      }
    }

    if (!downloadUrl) {
      throw new Error("Aucun lien de téléchargement trouvé sur cette page");
    }

    // Déterminer le format depuis l'URL
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
