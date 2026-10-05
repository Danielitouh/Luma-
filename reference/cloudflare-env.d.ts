declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    LUMA_AI_ENCRYPTION_KEY?: string;
  }
}
