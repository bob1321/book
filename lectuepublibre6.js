// LectuepubLibre6 — Source de téléchargement pour Cinder
// Version DEBUG avec logs détaillés

var LectuepubLibre6 = {};

LectuepubLibre6.id = "lectuepub6";
LectuepubLibre6.name = "Lectuepub Libre";
LectuepubLibre6.version = "1.0.1";
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

// ─── Utilitaires ─────────────────────────────────────────────────────────────

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

// ─── Recherche ─────────────────────────────────────────────────────────────

LectuepubLibre6.search = async function(query, page) {
  var q = String(query || "").trim();
  if (!q) {
    cinder.log("[lectuepub] recherche vide");
    return [];
  }

  var p = page && page > 1 ? page : 1;
  var searchUrl = this.baseUrl + "/page/" + p + "/?s=" + encodeURIComponent(q) + "&post_type=post";

  cinder.log("[lectuepub] ==========================================");
  cinder.log("[lectuepub] RECHERCHE: '" + q + "' page " + p);
  cinder.log("[lectuepub] URL: " + searchUrl);

  try {
    var r = await cinder.fetch(searchUrl, {
      method: "GET",
      headers: {
        "User-Agent": this.UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
      timeout: 30000,
    });

    if (!r) {
      cinder.error("[lectuepub] Pas de réponse HTTP");
      throw new Error("Pas de réponse du serveur");
    }

    cinder.log("[lectuepub] Status: " + (r.status || "unknown"));
    
    if (!r.data) {
      cinder.error("[lectuepub] Pas de données dans la réponse");
      throw new Error("Réponse vide");
    }

    var html = String(r.data);
    cinder.log("[lectuepub] HTML reçu: " + html.length + " caractères");
    cinder.log("[lectuepub] Début HTML: " + html.substring(0, 200).replace(/\n/g, " "));

    var results = [];

    // Pattern 1: Articles WordPress standard
    var articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    var articles = [];
    var match;
    while ((match = articleRegex.exec(html)) !== null) {
      articles.push(match[1]);
    }
    cinder.log("[lectuepub] Articles trouvés (pattern 1): " + articles.length);

    // Pattern 2: Divs avec classes spécifiques
    if (articles.length === 0) {
      var divRegex = /<div[^>]*class=["'][^"']*(?:post|entry|book|item|result|card)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
      while ((match = divRegex.exec(html)) !== null) {
        articles.push(match[0]); // On garde toute la div
      }
      cinder.log("[lectuepub] Divs trouvés (pattern 2): " + articles.length);
    }

    // Pattern 3: Liens vers des livres
    if (articles.length === 0) {
      var linkRegex = /<a[^>]+href=["']([^"']*(?:libro|book)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
      while ((match = linkRegex.exec(html)) !== null) {
        articles.push(match[0]);
      }
      cinder.log("[lectuepub] Liens trouvés (pattern 3): " + articles.length);
    }

    // Pattern 4: Tous les liens avec images (dernier recours)
    if (articles.length === 0) {
      var imgLinkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi;
      var links = [];
      while ((match = imgLinkRegex.exec(html)) !== null) {
        if (match[1].includes(this.baseUrl) && !match[1].includes("/page/")) {
          articles.push(match[0]);
        }
      }
      cinder.log("[lectuepub] Liens avec images (pattern 4): " + articles.length);
    }

    // Analyser chaque article trouvé
    for (var i = 0; i < articles.length && i < 20; i++) { // Limite à 20 pour éviter les boucles infinies
      var article = articles[i];
      
      // Chercher le titre et le lien
      var titleMatch = article.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!titleMatch) continue;
      
      var bookUrl = this._cleanUrl(titleMatch[1]);
      var rawTitle = titleMatch[2];
      
      // Nettoyer le titre (enlever les tags HTML)
      var title = this._cleanText(rawTitle);
      if (!title || title.length < 2) continue;
      
      // Filtrer les liens qui ne sont pas des livres
      if (bookUrl.includes("/page/") || bookUrl.includes("/category/") || bookUrl.includes("/tag/")) {
        continue;
      }
      
      // Chercher l'image
      var imgMatch = article.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i) ||
                     article.match(/<img[^>]+data-src=["']([^"']+)["'][^>]*>/i) ||
                     article.match(/<img[^>]+srcset=["']([^"'\s]+)/i);
      var cover = imgMatch ? this._cleanUrl(imgMatch[1]) : undefined;
      
      // Chercher l'auteur
      var authorMatch = article.match(/<a[^>]+rel=["']tag["'][^>]*>([^<]+)<\/a>/i) ||
                        article.match(/class=["'][^"']*author[^"']*["'][^>]*>([^<]+)/i) ||
                        article.match(/<span[^>]*class=["'][^"']*author[^"']*["'][^>]*>([^<]+)/i);
      var author = authorMatch ? this._cleanText(authorMatch[1]) : undefined;

      // Extraire l'ID
      var idMatch = bookUrl.match(/\/([^\/]+)\/?$/);
      var bookId = idMatch ? idMatch[1] : String(i);

      cinder.log("[lectuepub] Livre trouvé: '" + title + "' -> " + bookUrl);

      results.push({
        id: "lp6:" + bookId,
        title: title,
        author: author,
        cover: cover,
        source: this.name,
        extra: { bookUrl: bookUrl, bookId: bookId },
      });
    }

    cinder.log("[lectuepub] Total résultats: " + results.length);
    cinder.log("[lectuepub] ==========================================");

    return results;

  } catch (e) {
    cinder.error("[lectuepub] ERREUR recherche: " + e.message);
    throw new Error("Erreur de recherche: " + e.message);
  }
};

// ─── Découverte ─────────────────────────────────────────────────────────────

LectuepubLibre6.getDiscoverSections = async function() {
  return [
    { id: "novedades", title: "Novedades", icon: "time" },
    { id: "populares", title: "Populares", icon: "flame" },
  ];
};

LectuepubLibre6.getDiscoverItems = async function(sectionId, page) {
  var p = page && page > 1 ? page : 1;
  var url = this.baseUrl + "/page/" + p + "/";

  cinder.log("[lectuepub] Découverte section: " + sectionId + " page " + p);

  try {
    var r = await cinder.fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": this.UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeout: 30000,
    });

    if (!r || !r.data) return [];

    var html = String(r.data);
    var results = [];

    // Même logique que search
    var articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    var articles = [];
    var match;
    
    while ((match = articleRegex.exec(html)) !== null) {
      articles.push(match[1]);
    }

    for (var i = 0; i < articles.length && i < 15; i++) {
      var article = articles[i];
      
      var titleMatch = article.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!titleMatch) continue;
      
      var bookUrl = this._cleanUrl(titleMatch[1]);
      var title = this._cleanText(titleMatch[2]);
      
      if (!title || title.length < 2) continue;
      if (bookUrl.includes("/page/") || bookUrl.includes("/category/")) continue;
      
      var imgMatch = article.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
      var cover = imgMatch ? this._cleanUrl(imgMatch[1]) : undefined;
      
      var idMatch = bookUrl.match(/\/([^\/]+)\/?$/);
      var bookId = idMatch ? idMatch[1] : String(i);

      results.push({
        id: "lp6:" + bookId,
        title: title,
        cover: cover,
        source: this.name,
        extra: { bookUrl: bookUrl, bookId: bookId },
      });
    }

    cinder.log("[lectuepub] Découverte: " + results.length + " résultats");
    return results;

  } catch (e) {
    cinder.error("[lectuepub] ERREUR découverte: " + e.message);
    return [];
  }
};

// ─── Résolution du lien ─────────────────────────────────────────────────────

LectuepubLibre6.resolve = async function(item) {
  var e = (item && item.extra) || {};
  if (!e.bookUrl) {
    throw new Error("URL du livre manquante");
  }

  cinder.log("[lectuepub] Résolution: " + e.bookUrl);

  try {
    var r = await cinder.fetch(e.bookUrl, {
      method: "GET",
      headers: {
        "User-Agent": this.UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeout: 30000,
    });

    if (!r || !r.data) {
      throw new Error("Page du livre inaccessible");
    }

    var html = String(r.data);
    cinder.log("[lectuepub] Page reçue: " + html.length + " caractères");

    var downloadUrl = null;
    var fileFormat = "epub";

    // Pattern 1: Liens directs .epub
    var epubPatterns = [
      /href=["']([^"']+\.epub[^"']*)["']/i,
      /href=["']([^"']+)["'][^>]*>[^<]*EPUB/i,
      /href=["']([^"']+)["'][^>]*class=["'][^"']*download[^"']*["'][^>]*>[^<]*EPUB/i,
    ];

    for (var i = 0; i < epubPatterns.length; i++) {
      var m = html.match(epubPatterns[i]);
      if (m) {
        downloadUrl = this._cleanUrl(m[1]);
        fileFormat = "epub";
        break;
      }
    }

    // Pattern 2: Liens PDF si pas d'EPUB
    if (!downloadUrl) {
      var pdfPatterns = [
        /href=["']([^"']+\.pdf[^"']*)["']/i,
        /href=["']([^"']+)["'][^>]*>[^<]*PDF/i,
      ];
      
      for (var j = 0; j < pdfPatterns.length; j++) {
        var m = html.match(pdfPatterns[j]);
        if (m) {
          downloadUrl = this._cleanUrl(m[1]);
          fileFormat = "pdf";
          break;
        }
      }
    }

    // Pattern 3: Boutons de téléchargement généraux
    if (!downloadUrl) {
      var btnMatch = html.match(/<a[^>]+href=["']([^"']+(?:download|descargar)[^"']*)["']/i) ||
                     html.match(/<a[^>]+class=["'][^"']*(?:btn|button)[^"']*["'][^>]+href=["']([^"']+)["']/i);
      if (btnMatch) {
        downloadUrl = this._cleanUrl(btnMatch[1]);
      }
    }

    if (!downloadUrl) {
      cinder.error("[lectuepub] Aucun lien trouvé dans la page");
      throw new Error("Lien de téléchargement non trouvé");
    }

    // Déterminer le format
    if (downloadUrl.toLowerCase().includes(".pdf")) fileFormat = "pdf";
    else if (downloadUrl.toLowerCase().includes(".epub")) fileFormat = "epub";

    var nom = String(item.title || "libro")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .trim();

    cinder.log("[lectuepub] Lien trouvé: " + downloadUrl + " (" + fileFormat + ")");

    return {
      url: downloadUrl,
      fileName: nom + "." + fileFormat,
    };

  } catch (e) {
    cinder.error("[lectuepub] ERREUR résolution: " + e.message);
    throw new Error("Impossible d'obtenir le lien: " + e.message);
  }
};

__cinderExport = LectuepubLibre6;
