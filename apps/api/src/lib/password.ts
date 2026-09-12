/**
 * Argon2id password hashing (PRD 25) using Bun's built-in password module.
 */
export const hashPassword = (plain: string): Promise<string> =>
  Bun.password.hash(plain, { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2 });

export const verifyPassword = (hashValue: string, plain: string): Promise<boolean> =>
  Bun.password.verify(plain, hashValue, 'argon2id');
