/// <reference types="vite/client" />
import { env } from 'cloudflare:workers';
export function database(){if(!env.DB)throw new Error('Database unavailable');return env.DB;}
export function userId(request:Request){if(import.meta.env.DEV && ['terminal.local','localhost','127.0.0.1'].includes(new URL(request.url).hostname))return 'luma-local-preview';return request.headers.get('oai-authenticated-user-id');}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}
