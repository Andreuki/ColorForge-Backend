const bcrypt = require('bcryptjs');

const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

const hashPassword = async (plainText) => bcrypt.hash(plainText, BCRYPT_SALT_ROUNDS);
const comparePassword = async (plainText, hash) => bcrypt.compare(plainText, hash);

module.exports = { hashPassword, comparePassword, BCRYPT_SALT_ROUNDS };
