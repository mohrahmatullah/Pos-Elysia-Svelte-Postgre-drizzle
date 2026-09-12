export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '3001', 10),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me-0123456789abcdef',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  accessTokenTtlMin: Number.parseInt(process.env.ACCESS_TOKEN_TTL_MIN ?? '15', 10),
  refreshTokenTtlDays: Number.parseInt(process.env.REFRESH_TOKEN_TTL_DAYS ?? '30', 10),
};

if (config.env === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set (32+ chars) in production');
}
