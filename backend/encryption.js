const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// Validate encryption key (but don't exit in serverless)
function getKey() {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 characters (32 bytes hex)');
  }
  return Buffer.from(ENCRYPTION_KEY, 'hex');
}

/**
 * Encrypt credentials object to string
 */
function encryptCredentials(credentialsObject) {
  try {
    const KEY = getKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    
    const jsonString = JSON.stringify(credentialsObject);
    let encrypted = cipher.update(jsonString, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return IV + encrypted data (IV needed for decryption)
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt credentials');
  }
}

/**
 * Decrypt string to credentials object
 */
function decryptCredentials(encryptedString) {
  try {
    const KEY = getKey();
    const parts = encryptedString.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt credentials');
  }
}

module.exports = {
  encryptCredentials,
  decryptCredentials
};

