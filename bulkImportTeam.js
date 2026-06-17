// backend/bulkImportTeam.js
// FINAL production-safe bulk import script for Shaastra team CSV

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { sequelize } = require('./config/database');
const User = require('./models/User');
require('dotenv').config();

/* =========================================================
   CONSTANTS
========================================================= */

const VALID_ROLES = ['Core', 'Head', 'Coordinator', 'Volunteer', 'Vendor'];

const VALID_DEPARTMENTS = [
  'Finance',
  'S&E',
  'EnW',
  'O&IP',
  'Publicity',
  'WebOps',
  'DAM',
  'Spons &PR',
  'QMS',
  'Evolve',
  'Envisage'
];

// Safe string trim
const safeTrim = (v) => (typeof v === 'string' ? v.trim() : '');

/* =========================================================
   VALIDATION
========================================================= */

function validateUser(user, lineNumber) {
  const errors = [];

  if (!user.name) errors.push(`Line ${lineNumber}: name is required`);
  if (!user.userId) errors.push(`Line ${lineNumber}: userId (roll number) is required`);
  if (!user.department) errors.push(`Line ${lineNumber}: department is required`);
  if (!user.role) errors.push(`Line ${lineNumber}: role is required`);

  if (user.userId && !/^[A-Z]{2}\d{2}[A-Z]\d{3}$/i.test(user.userId)) {
    errors.push(`Line ${lineNumber}: invalid userId format (${user.userId})`);
  }

  if (user.role && !VALID_ROLES.includes(user.role)) {
    errors.push(
      `Line ${lineNumber}: invalid role (${user.role}), must be ${VALID_ROLES.join(', ')}`
    );
  }

  if (user.department && !VALID_DEPARTMENTS.includes(user.department)) {
    console.warn(`⚠️  Line ${lineNumber}: non-standard department "${user.department}"`);
  }

  return errors;
}

/* =========================================================
   BULK IMPORT
========================================================= */

async function bulkImportFromCSV(csvFilePath) {
  const users = [];
  const errors = [];
  const seenUserIds = new Set(); // ✅ track first occurrence
  let lineNumber = 1;

  console.log('📂 Reading CSV file:', csvFilePath);
  console.log('⏳ Processing...\n');

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(
        csv({
          mapHeaders: ({ header }) => header.trim().toLowerCase()
        })
      )
      .on('data', (row) => {
        lineNumber++;

        const userId = safeTrim(row.userid).toUpperCase();

        // Skip duplicate userId rows (keep first only)
        if (userId && seenUserIds.has(userId)) {
          console.warn(`⚠️  Line ${lineNumber}: duplicate userId "${userId}" ignored`);
          return;
        }

        const rawContact = safeTrim(row.contact);

        const user = {
          name: safeTrim(row.name),
          userId,
          smail: safeTrim(row.smail),
          contact: rawContact || 'NA',
          department: safeTrim(row.department),
          role: safeTrim(row.role),
          balance: parseFloat(row.balance) || 0,
          password: null,
          sPin: null,
          otp: null,
          otpExpiry: null
        };

        // Skip fully empty rows
        if (!user.name && !user.userId) return;

        const validationErrors = validateUser(user, lineNumber);
        if (validationErrors.length > 0) {
          errors.push(...validationErrors);
          return;
        }

        // Mark userId as seen AFTER validation
        if (user.userId) seenUserIds.add(user.userId);

        users.push(user);
      })
      .on('end', async () => {
        console.log(`✅ CSV parsed. Valid users (unique userId): ${users.length}\n`);

        if (errors.length > 0) {
          console.error('❌ VALIDATION ERRORS:\n');
          errors.forEach(e => console.error('   ' + e));
          return reject(new Error('CSV validation failed'));
        }

        try {
          await sequelize.authenticate();
          console.log('✅ Database connected\n');
          await User.sync();

          console.log('📊 Importing to database...\n');

          const result = await User.bulkCreate(users, {
            ignoreDuplicates: true,
            validate: true
          });

          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('✅ IMPORT COMPLETE');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(`📥 CSV rows accepted: ${users.length}`);
          console.log(`✅ Inserted: ${result.length}`);
          console.log(`⚠️  Skipped (existing in DB): ${users.length - result.length}`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

          resolve();
        } catch (err) {
          reject(err);
        } finally {
          await sequelize.close();
        }
      })
      .on('error', (err) => {
        console.error('❌ CSV READ ERROR:', err);
        reject(err);
      });
  });
}

/* =========================================================
   RUN SCRIPT
========================================================= */

const csvFile =
  process.argv[2] ||
  path.join(__dirname, 'Updated Shaastra 2026 Team details for Food coupon website.csv');

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 SHAASTRA TEAM BULK IMPORT');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

bulkImportFromCSV(csvFile)
  .then(() => {
    console.log('✅ Import process completed successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Import failed');
    console.error(err.message || err);
    process.exit(1);
  });