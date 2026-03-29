const fs = require('fs');
const csv = require('csv-parser');

class StaffMappingRepository {
  constructor(filePath) {
    this.filePath = filePath;
    this.map = new Map();
  }

  load() {
    return new Promise((resolve, reject) => {
      fs.createReadStream(this.filePath)
        .pipe(csv())
        .on('data', (row) => {
          this.map.set(row.staff_pass_id, row.team_name);
        })
        .on('end', resolve)
        .on('error', reject);
    });
  }

  getTeam(id) {
    return this.map.get(id);
  }
}

module.exports = StaffMappingRepository;
