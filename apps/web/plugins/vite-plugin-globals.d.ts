interface ImportMeta {
	hot?: {
		send(event: string, data?: unknown): void;
		on(event: string, cb: () => void): void;
	};
}
