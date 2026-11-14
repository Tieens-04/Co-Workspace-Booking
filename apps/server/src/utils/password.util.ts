import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ENV } from '../config/env.config.js';

// Valid bcrypt hash built once at load time with the same cost factor as real password hashes,
// so verifying against a missing user takes as long as verifying a real one (no email enumeration
// through response latency). Never hard-code it: the cost would drift from BCRYPT_SALT_ROUNDS.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), ENV.BCRYPT_SALT_ROUNDS);

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, ENV.BCRYPT_SALT_ROUNDS);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const compareDummyPassword = async (password: string): Promise<void> => {
  await bcrypt.compare(password, DUMMY_HASH);
};
