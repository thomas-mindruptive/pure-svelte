const sql = require('mssql');

const config = {
  server: 'localhost',
  database: 'pureenergyworks',
  user: 'sa',
  password: 'ichBinAdmin@123',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

(async () => {
  try {
    await sql.connect(config);
    console.log('Connected to database');

    const result = await sql.query`SELECT * FROM dbo.wholesaler_offering_links WHERE offering_id = 152`;
    console.log('Links for offering_id=152:', result.recordset);

    await sql.close();
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();
