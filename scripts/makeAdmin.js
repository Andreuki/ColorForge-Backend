const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/makeAdmin.js <email>');
  process.exit(1);
}

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('Missing MONGO_URI or MONGODB_URI in .env');
  process.exit(1);
}

mongoose
  .connect(mongoUri)
  .then(async () => {
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: { role: 'admin', active: true } },
      { new: true }
    );

    if (!user) {
      console.error(`User with email "${email}" not found`);
    } else {
      console.log(`User "${user.username}" is now admin`);
    }
  })
  .catch((err) => {
    console.error('Error updating user role:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
