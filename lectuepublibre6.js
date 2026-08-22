// LectuepubLibre6 — Version API WordPress REST

__cinderExport = {
	id: "lectuepub6",
	name: "Lectuepub Libre",
	version: "2.0.0",
	icon: "📚",
	description: "Descargar libros EPUB y PDF gratis en español",
	contentType: "books",
	contentTypes: ["ebook"],

	capabilities: {
		search: true,
		discover: true,
		download: false,
		resolve: true,
		searchDownloads: true,
		manga: false,
	},

	_BASE_URL: "https://lectuepublibre6.com",
	_API_URL: "https://lectuepublibre6.com/wp-json/wp/v2",

	_clean: function(text) {
		if (!text) return "";
		return String(text)
			.replace(/<[^>]+>/g, "")
			.replace(/&nbsp;/g, " ")
			.replace(/&amp;/g, "&")
			.replace(/\s+/g, " ")
			.trim();
	},

	// Appel API WordPress
	_apiCall: async function(endpoint) {
		try {
			var resp = await cinder.fetch(this._API_URL + endpoint, {
				headers: {
					"Accept": "application/json",
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
				},
				timeout: 30000,
			});
			if (resp && resp.data) {
				return JSON.parse(resp.data);
			}
		} catch (e) {
			cinder.log("[LectuepubLibre6] API error: " + e);
		}
		return null;
	},

	search: async function(query, page) {
		page = page || 1;
		var endpoint = "/posts?search=" + encodeURIComponent(query) + "&per_page=20&page=" + page + "&_embed";
		
		var data = await this._apiCall(endpoint);
		if (!data || !Array.isArray(data)) return [];

		return data.map(function(post) {
			var title = post.title && post.title.rendered ? this._clean(post.title.rendered) : "Sin título";
			var url = post.link || "";
			
			// Extraire image
			var cover = "";
			if (post._embedded && post._embedded["wp:featuredmedia"] && post._embedded["wp:featuredmedia"][0]) {
				var media = post._embedded["wp:featuredmedia"][0];
				cover = media.source_url || "";
			}
			
			// Extraire auteur
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
	},

	getDiscoverSections: async function() {
		return [
			{ id: "latest", title: "Últimos libros", icon: "⏰" },
			{ id: "page2", title: "Página 2", icon: "📄" }
		];
	},

	getDiscoverItems: async function(sectionId, page) {
		page = page || 1;
		var endpoint = "/posts?per_page=20&page=" + page + "&_embed";
		
		var data = await this._apiCall(endpoint);
		if (!data || !Array.isArray(data)) return [];

		return data.map(function(post) {
			var title = post.title && post.title.rendered ? this._clean(post.title.rendered) : "Sin título";
			var cover = "";
			if (post._embedded && post._embedded["wp:featuredmedia"] && post._embedded["wp:featuredmedia"][0]) {
				cover = post._embedded["wp:featuredmedia"][0].source_url || "";
			}
			var author = "Desconocido";
			if (post._embedded && post._embedded.author && post._embedded.author[0]) {
				author = post._embedded.author[0].name || "Desconocido";
			}

			return {
				id: "lp6_" + post.id,
				title: title,
				author: author,
				cover: cover || undefined,
				url: post.link,
				source: "Lectuepub Libre",
				extra: {
					bookUrl: post.link,
					bookId: String(post.id)
				}
			};
		}.bind(this));
	},

	resolve: async function(item) {
		if (!item || !item.extra || !item.extra.bookUrl) {
			throw new Error("URL manquante");
		}

		// Récupérer le contenu du post
		var slug = item.extra.slug || item.extra.bookUrl.split("/").filter(Boolean).pop();
		var endpoint = "/posts?slug=" + encodeURIComponent(slug) + "&_embed";
		var data = await this._apiCall(endpoint);
		
		if (!data || !data[0] || !data[0].content || !data[0].content.rendered) {
			throw new Error("Contenu non trouvé");
		}

		var content = data[0].content.rendered;
		var downloadUrl = null;
		var fileFormat = "epub";

		// Chercher les liens dans le contenu
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
				downloadUrl = match[1].startsWith("http") ? match[1] : "https://" + match[1];
				if (match[1].toLowerCase().includes(".pdf")) fileFormat = "pdf";
				break;
			}
		}

		if (!downloadUrl) {
			throw new Error("Lien de téléchargement non trouvé");
		}

		return {
			url: downloadUrl,
			fileName: this._clean(item.title) + "." + fileFormat,
			headers: { Referer: item.extra.bookUrl }
		};
	},
};
