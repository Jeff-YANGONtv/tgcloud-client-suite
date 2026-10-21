// Set a strong password-derived PBKDF2 hash here only in the private deployment
// workspace. Never commit a populated hash to the public repository. Format:
// pbkdf2-sha256$120000$<32-char salt hex>$<64-char derived-key hex>
export const ADMIN_PASSWORD_HASH = '';
