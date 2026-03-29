#!/usr/bin/env node

/**
 * One-time migration script
 * Reads all-staff.csv and populates:
 * - data/staff.json
 * - data/team_counts.json
 */

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const CSV_FILE = path.join(__dirname, '../data/all-staff.csv');
const STAFF_JSON = path.join(__dirname, '../data/staff.json');
const TEAM_COUNTS_JSON = path.join(__dirname, '../data/team_counts.json');

async function migrateCSVtoJSON() {
  try {
    console.log('🔄 Starting migration from CSV to JSON...\n');

    // Step 1: Read and parse CSV
    console.log(`📖 Reading CSV from: ${CSV_FILE}`);
    const staffData = await readCSV(CSV_FILE);
    console.log(`✅ Parsed ${staffData.length} staff records\n`);

    // Step 2: Generate team counts
    console.log('📊 Calculating team member counts...');
    const teamCounts = calculateTeamCounts(staffData);
    console.log(`✅ Found ${Object.keys(teamCounts).length} teams:\n`);
    Object.entries(teamCounts).forEach(([team, count]) => {
      console.log(`   ${team}: ${count} members`);
    });
    console.log();

    // Step 3: Write staff.json
    console.log(`📝 Writing staff data to: ${STAFF_JSON}`);
    await fs.writeFile(
      STAFF_JSON,
      JSON.stringify(staffData, null, 2),
      'utf8'
    );
    console.log(`✅ Written ${staffData.length} staff records\n`);

    // Step 4: Write team_counts.json
    console.log(`📝 Writing team counts to: ${TEAM_COUNTS_JSON}`);
    const teamCountsArray = Object.entries(teamCounts).map(([teamName, memberCount]) => ({
      team_name: teamName,
      member_count: memberCount,
      updated_at: Date.now()
    }));
    await fs.writeFile(
      TEAM_COUNTS_JSON,
      JSON.stringify(teamCountsArray, null, 2),
      'utf8'
    );
    console.log(`✅ Written team counts for ${teamCountsArray.length} teams\n`);

    console.log('✨ Migration completed successfully!\n');
    console.log('Summary:');
    console.log(`  • Staff records: ${staffData.length}`);
    console.log(`  • Teams: ${Object.keys(teamCounts).length}`);
    console.log(`  • Files created: staff.json, team_counts.json`);
    console.log();

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

/**
 * Read and parse CSV file
 */
async function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const staff = [];
    const fileStream = require('fs').createReadStream(filePath);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let isHeader = true;
    const headers = [];

    rl.on('line', (line) => {
      // Skip empty lines
      if (!line.trim()) return;

      if (isHeader) {
        headers.push(...line.split(',').map(h => h.trim()));
        isHeader = false;
        return;
      }

      // Parse CSV line
      const values = parseCSVLine(line);
      
      if (values.length >= 3) {
        staff.push({
          staff_pass_id: values[0].trim(),
          team_name: values[1].trim(),
          created_at: parseInt(values[2].trim(), 10)
        });
      }
    });

    rl.on('close', () => {
      resolve(staff);
    });

    rl.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Calculate member counts per team
 */
function calculateTeamCounts(staffData) {
  const counts = {};

  staffData.forEach(staff => {
    const team = staff.team_name;
    counts[team] = (counts[team] || 0) + 1;
  });

  return counts;
}

// Run migration
migrateCSVtoJSON();
