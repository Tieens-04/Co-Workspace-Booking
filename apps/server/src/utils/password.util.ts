import bcrypt from 'bcryptjs';
import { ENV } from '../config/env.config.js';

// Pre-computed valid bcrypt hash to ensure constant-time verification when user does not exist
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, ENV.BCRYPT_SALT_ROUNDS);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const compareDummyPassword = async (password: string): Promise<void> => {
  await bcrypt.compare(password, DUMMY_HASH);
};
