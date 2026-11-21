// Import the module-only types to avoid replacing browser Request/Response globals.
declare module 'cloudflare:workers' {
 const DurableObject:typeof import('@cloudflare/workers-types/index.ts').CloudflareWorkersModule.DurableObject;
 export {DurableObject};
}
