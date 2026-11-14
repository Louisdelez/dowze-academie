//#region pwa/src/api.ts
var ApiError = class extends Error {
	status;
	code;
	currentVersion;
	constructor(status, message, code, currentVersion) {
		super(message);
		this.status = status;
		this.code = code;
		this.currentVersion = currentVersion;
	}
};
var ApiClient = class {
	baseUrl;
	fetcher;
	accountId = null;
	csrfToken = null;
	csrfRestore = null;
	constructor(baseUrl = "", fetcher = fetch) {
		this.baseUrl = baseUrl;
		this.fetcher = fetcher;
	}
	hasCsrf() {
		return this.csrfToken !== null;
	}
	bindAccount(accountId) {
		if (this.accountId && this.accountId !== accountId) throw new ApiError(409, "La session appartient à un autre compte. Reconnectez-vous.", "session_account_changed");
		this.accountId = accountId;
	}
	async request(path, init = {}, retryCsrf = true) {
		const protectedMutation = !!init.method && init.method !== "GET" && !(init.method === "POST" && ["/v1/accounts", "/v1/sessions"].includes(path));
		if (protectedMutation && (!this.csrfToken || this.csrfRestore)) await this.restoreCsrf();
		const headers = new Headers(init.headers);
		if (this.accountId && path.startsWith("/v1/spaces")) headers.set("X-Dowze-Account", this.accountId);
		if (init.body && !(init.body instanceof Blob) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
		if (this.csrfToken && init.method && init.method !== "GET") headers.set("X-CSRF-Token", this.csrfToken);
		const fetcher = this.fetcher;
		const response = await fetcher(`${this.baseUrl}${path}`, {
			...init,
			headers,
			credentials: "include",
			cache: "no-store"
		});
		const payload = response.status === 204 ? null : await response.json().catch(() => null);
		if (protectedMutation && retryCsrf && response.status === 403 && payload?.code === "csrf_rejected") {
			await this.restoreCsrf();
			return this.request(path, init, false);
		}
		if (!response.ok) throw new ApiError(response.status, payload?.message ?? `Erreur HTTP ${response.status}`, payload?.code, payload?.current_version);
		return payload;
	}
	async register(email, password) {
		return this.request("/v1/accounts", {
			method: "POST",
			body: JSON.stringify({
				email,
				password
			})
		});
	}
	async login(email, password) {
		const session = await this.request("/v1/sessions", {
			method: "POST",
			body: JSON.stringify({
				email,
				password
			})
		});
		this.csrfToken = session.csrf_token;
		return session;
	}
	async me() {
		const account = await this.request("/v1/me");
		this.bindAccount(account.id);
		return account;
	}
	async restoreCsrf() {
		if (!this.csrfRestore) this.csrfRestore = this.request("/v1/csrf").then((value) => {
			this.csrfToken = value.csrf_token;
		}).finally(() => {
			this.csrfRestore = null;
		});
		await this.csrfRestore;
	}
	async logout() {
		try {
			await this.request("/v1/sessions", { method: "DELETE" });
		} finally {
			this.csrfToken = null;
			this.accountId = null;
		}
	}
	async putSpace(spaceId, formationId, academicYear, title) {
		return this.request(`/v1/spaces/${encodeURIComponent(spaceId)}`, {
			method: "PUT",
			body: JSON.stringify({
				formation_id: formationId,
				academic_year: academicYear,
				title
			})
		});
	}
	async spaces() {
		const items = [];
		let after = "";
		do {
			const page = await this.request(`/v1/spaces?limit=500&after=${encodeURIComponent(after)}`);
			items.push(...page.items);
			after = page.has_more ? page.next_after ?? "" : "";
		} while (after);
		return items;
	}
	async changes(spaceId, cursor) {
		const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=500` : "?limit=500";
		return this.request(`/v1/spaces/${encodeURIComponent(spaceId)}/changes${query}`);
	}
	async courseContent(formationId, version) {
		return this.request(`/v1/catalog/${encodeURIComponent(formationId)}/${encodeURIComponent(version)}/content`);
	}
	async catalog() {
		return this.request("/v1/catalog");
	}
	async putDocument(spaceId, type, documentId, baseVersion, content, idempotencyKey) {
		return this.request(`/v1/spaces/${encodeURIComponent(spaceId)}/documents/${type}/${encodeURIComponent(documentId)}`, {
			method: "PUT",
			headers: { "X-Idempotency-Key": idempotencyKey },
			body: JSON.stringify({
				base_version: baseVersion,
				content
			})
		});
	}
	async uploadBlob(spaceId, blob, sha256, idempotencyKey) {
		return this.request(`/v1/spaces/${encodeURIComponent(spaceId)}/blobs`, {
			method: "POST",
			headers: {
				"Content-Type": blob.type,
				"X-Content-SHA256": sha256,
				"X-Idempotency-Key": idempotencyKey
			},
			body: blob
		});
	}
	async downloadBlob(spaceId, blobId) {
		const fetcher = this.fetcher;
		const response = await fetcher(this.blobUrl(spaceId, blobId), {
			credentials: "include",
			cache: "no-store",
			headers: this.accountId ? { "X-Dowze-Account": this.accountId } : {}
		});
		if (!response.ok) throw new ApiError(response.status, "Photo indisponible");
		const maximum = 16777216;
		if (Number(response.headers.get("content-length")) > maximum) throw new Error("Photo trop volumineuse");
		const reader = response.body?.getReader();
		if (!reader) throw new Error("Photo indisponible");
		const chunks = [];
		let size = 0;
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				size += value.byteLength;
				if (size > maximum) throw new Error("Photo trop volumineuse");
				chunks.push(new Uint8Array(value));
			}
		} finally {
			await reader.cancel();
		}
		return new Blob(chunks, { type: response.headers.get("content-type") ?? "application/octet-stream" });
	}
	blobUrl(spaceId, blobId) {
		return `${this.baseUrl}/v1/spaces/${encodeURIComponent(spaceId)}/blobs/${encodeURIComponent(blobId)}`;
	}
};
//#endregion
export { ApiClient, ApiError };
