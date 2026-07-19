type CloudflareCacheStorage = CacheStorage & { readonly default: Cache };

export function defaultWorkerCache(): Cache {
	return (caches as CloudflareCacheStorage).default;
}
