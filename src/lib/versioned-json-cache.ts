/** Reuse decoded immutable JSON only after the caller checks its shared version.
 * The byte limit measures serialized payloads rather than exact JS heap size.
 */
export class VersionedJsonCache<T> {
  private entries = new Map<string, {version: string; value: T; bytes: number}>();
  private bytes = 0;
  constructor(private maxBytes: number, private maxEntries: number) {}

  get(key: string, version: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.version !== version) {
      this.bytes -= entry.bytes;
      return undefined;
    }
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, version: string, value: T, bytes: number) {
    const previous = this.entries.get(key);
    if (previous) { this.bytes -= previous.bytes; this.entries.delete(key); }
    if (bytes > this.maxBytes || this.maxEntries < 1) return;
    while (this.entries.size && (this.bytes + bytes > this.maxBytes || this.entries.size >= this.maxEntries)) {
      const oldest = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
    }
    this.entries.set(key, {version, value, bytes});
    this.bytes += bytes;
  }
}
