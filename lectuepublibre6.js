// LectuepubLibre6 — Source de téléchargement pour Cinder
// Site: https://lectuepublibre6.com
// Langue: Espagnol (es)
// Format: EPUB, PDF

var LectuepubLibre6 = {};

LectuepubLibre6.id = "lectuepublibre6";
LectuepubLibre6.name = "Lectuepub Libre";
LectuepubLibre6.version = "1.0.0";
LectuepubLibre6.icon = "book-outline";
LectuepubLibre6.description = "Descargar libros EPUB y PDF gratis en español desde LectuepubLibre.";

LectuepubLibre6.contentType = "books";
LectuepubLibre6.contentTypes = ["ebook"];

LectuepubLibre6.capabilities = {
  search: true,
  discover: true,
  download: false,  // On utilise resolve() pour obtenir le lien
  resolve: true,
  searchDownloads: true,
  bookChapters: false,
  manga: false,
};

LectuepubLibre6.UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// URL de base du site
LectuepubLibre6.baseUrl = "https://lectuepublibre6.com";

// ─── Utilitaires ─────────────────────────────────────────────────────────────

/**
 * Parse le HTML et retourne un document
 */
LectuepubLibre6._parseHTML = function(html) {
  // Créer un parser simple pour le HTML
  var div = { innerHTML: html };
  return div;
};

/**
 * Extrait le texte entre deux balises HTML
 */
LectuepubLibre6._extractText = function(html, startTag, endTag) {
  var start = html.indexOf(startTag);
  if (start === -1) return "";
  start += startTag.length;
  var end = html.indexOf(endTag, start);
  if (end === -1) return "";
  var text = html.substring(start, end);
  // Nettoyer les entités HTML basiques
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "")  // Supprimer les tags restants
    .trim();
};

/**
 * Extrait tous les liens correspondant à un pattern
 */
LectuepubLibre6._extractLinks = function(html, pattern) {
  var links = [];
  var regex = new RegExp(pattern, "gi");
  var match;
  while ((match = regex.exec(html)) !== null) {
    links.push(match[1]);
  }
  return links;
};

/**
 * Nettoie et décode une URL
 */
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
  if (!q) return [];

  var p = page && page > 1 ? page : 1;
  var searchUrl = this.baseUrl + "/page/" + p + "/?s=" + encodeURIComponent(q) + "&post_type=post";

  cinder.log("[lectuepub] recherche: " + q + " (page " + p + ")");

  try {
    var r = await cinder.fetch(searchUrl, {
      method: "GET",
      headers: {
        "User-Agent": this.UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeout: 30000,
    });

    if (!r || !r.data) {
      throw new Error("Pas de réponse du site");
    }

    var html = String(r.data);
    var results = [];

    // Pattern pour trouver les articles de livres
    // Les sites WordPress ont souvent des articles avec class "post" ou "entry"
    var articlePattern = /<article[^>]*class=["'][^"']*(?:post|entry)[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi;
    var articles = [];
    var match;
    
    while ((match = articlePattern.exec(html)) !== null) {
      articles.push(match[1]);
    }

    // Si pas d'articles trouvés avec ce pattern, essayer un autre
    if (articles.length === 0) {
      // Pattern plus général pour les conteneurs de livres
      var divPattern = /<div[^>]*class=["'][^"']*(?:book|item|result)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
      while ((match = divPattern.exec(html)) !== null) {
        articles.push(match[1]);
      }
    }

    for (var i = 0; i < articles.length; i++) {
      var article = articles[i];
      
      // Extraire le titre et le lien
      var titleMatch = article.match(/<h[23][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h[23]>/i) ||
                       article.match(/<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/i) ||
                       article.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      
      if (!titleMatch) continue;
      
      var bookUrl = this._cleanUrl(titleMatch[1]);
      var title = this._extractText(titleMatch[2] || titleMatch[0], ">", "<") || "Sans titre";
      
      // Extraire l'image de couverture
      var coverMatch = article.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i) ||
                       article.match(/<img[^>]+data-src=["']([^"']+)["'][^>]*>/i);
      var cover = coverMatch ? this._cleanUrl(coverMatch[1]) : undefined;
      
      // Extraire l'auteur si disponible
      var authorMatch = article.match(/class=["'][^"']*author[^"']*["'][^>]*>([^<]+)/i) ||
                        article.match(/<a[^>]+rel=["']tag["'][^>]*>([^<]+)/i);
      var author = authorMatch ? authorMatch[1].trim() : undefined;

      // Extraire l'ID du livre depuis l'URL
      var idMatch = bookUrl.match(/\/([^\/]+)\/?$/);
      var bookId = idMatch ? idMatch[1] : bookUrl;

      results.push({
        id: "lectuepub:" + bookId,
        title: title,
        author: author,
        cover: cover,
        source: this.name,
        extra: { bookUrl: bookUrl, bookId: bookId },
      });
    }

    cinder.log("[lectuepub] " + results.length + " résultat(s) trouvé(s)");
    return results;

  } catch (e) {
    cinder.error("[lectuepub] erreur recherche: " + e.message);
    throw new Error("Impossible de rechercher sur Lectuepub: " + e.message);
  }
};

// ─── Découverte (Populaires/Récents) ─────────────────────────────────────────

LectuepubLibre6.getDiscoverSections = async function() {
  return [
    { id: "recents", title: "Novedades", icon: "time" },
    { id: "populares", title: "Populares", icon: "flame" },
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
      },
      timeout: 30000,
    });

    if (!r || !r.data) return [];

    var html = String(r.data);
    var results = [];

    // Même logique que search
    var articlePattern = /<article[^>]*class=["'][^"']*(?:post|entry)[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi;
    var articles = [];
    var match;
    
    while ((match = articlePattern.exec(html)) !== null) {
      articles.push(match[1]);
    }

    for (var i = 0; i < articles.length; i++) {
      var article = articles[i];
      
      var titleMatch = article.match(/<h[23][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h[23]>/i) ||
                       article.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      
      if (!titleMatch) continue;
      
      var bookUrl = this._cleanUrl(titleMatch[1]);
      var title = this._extractText(titleMatch[2] || titleMatch[0], ">", "<") || "Sans titre";
      
      var coverMatch = article.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
      var cover = coverMatch ? this._cleanUrl(coverMatch[1]) : undefined;
      
      var authorMatch = article.match(/class=["'][^"']*author[^"']*["'][^>]*>([^<]+)/i);
      var author = authorMatch ? authorMatch[1].trim() : undefined;

      var idMatch = bookUrl.match(/\/([^\/]+)\/?$/);
      var bookId = idMatch ? idMatch[1] : bookUrl;

      results.push({
        id: "lectuepub:" + bookId,
        title: title,
        author: author,
        cover: cover,
        source: this.name,
        extra: { bookUrl: bookUrl, bookId: bookId },
      });
    }

    return results;

  } catch (e) {
    cinder.error("[lectuepub] erreur découverte: " + e.message);
    return [];
  }
};

// ─── Résolution du lien de téléchargement ────────────────────────────────────

LectuepubLibre6.resolve = async function(item) {
  var e = (item && item.extra) || {};
  if (!e.bookUrl) throw new Error("URL du livre manquante");

  cinder.log("[lectuepub] résolution: " + e.bookUrl);

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
      throw new Error("Impossible de charger la page du livre");
    }

    var html = String(r.data);

    // Chercher les liens de téléchargement EPUB
    var downloadUrl = null;
    var fileFormat = "epub";

    // Pattern pour les liens directs .epub ou .pdf
    var epubMatch = html.match(/href=["']([^"']+\.epub[^"']*)["']/i) ||
                    html.match(/href=["']([^"']+)["'][^>]*>[^<]*EPUB/i);
    var pdfMatch = html.match(/href=["']([^"']+\.pdf[^"']*)["']/i) ||
                   html.match(/href=["']([^"']+)["'][^>]*>[^<]*PDF/i);

    if (epubMatch) {
      downloadUrl = this._cleanUrl(epubMatch[1]);
      fileFormat = "epub";
    } else if (pdfMatch) {
      downloadUrl = this._cleanUrl(pdfMatch[1]);
      fileFormat = "pdf";
    }

    // Si pas trouvé, chercher des boutons de téléchargement
    if (!downloadUrl) {
      var btnMatch = html.match(/<a[^>]+class=["'][^"']*(?:download|btn|button)[^"']*["'][^>]+href=["']([^"']+)["']/i) ||
                     html.match(/<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*(?:download|btn|button)/i);
      if (btnMatch) {
        downloadUrl = this._cleanUrl(btnMatch[1]);
      }
    }

    // Chercher dans des iframes ou embeds
    if (!downloadUrl) {
      var iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      if (iframeMatch) {
        downloadUrl = this._cleanUrl(iframeMatch[1]);
      }
    }

    if (!downloadUrl) {
      throw new Error("Lien de téléchargement non trouvé sur la page");
    }

    // Déterminer le format depuis l'URL
    if (downloadUrl.toLowerCase().includes(".pdf")) fileFormat = "pdf";
    else if (downloadUrl.toLowerCase().includes(".epub")) fileFormat = "epub";

    var nom = String(item.title || "libro").replace(/[\\/:*?"<>|]+/g, " ").trim();

    cinder.log("[lectuepub] lien trouvé: " + downloadUrl + " (" + fileFormat + ")");

    return {
      url: downloadUrl,
      fileName: nom + "." + fileFormat,
      // Pas d'en-têtes spéciaux nécessaires pour ce site
    };

  } catch (e) {
    cinder.error("[lectuepub] erreur résolution: " + e.message);
    throw new Error("Impossible d'obtenir le lien: " + e.message);
  }
};

__cinderExport = LectuepubLibre6;
