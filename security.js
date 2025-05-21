import crypto from 'crypto';
import config from './config.js';
import { PublicKey } from '@solana/web3.js';

// Encrypt sensitive data
export function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc', 
    Buffer.from(config.encryptionKey), 
    iv
  );
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

// Decrypt sensitive data
export function decrypt(text) {
  const [ivHex, encryptedText] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc', 
    Buffer.from(config.encryptionKey), 
    iv
  );
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Validate Solana address
export function isValidSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
}