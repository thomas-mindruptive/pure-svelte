import sql from 'mssql';
import { error } from '@sveltejs/kit';

// 1. Konfiguration der Datenbankverbindung
// WICHTIG: Später sollten Sie diese sensiblen Daten in eine .env-Datei auslagern!
// Für den Moment schreiben wir sie direkt hier rein.
const dbConfig = {
  user: 'sa',      
  password: 'ichBinAdmin@123',  
  server: 'localhost',                  
  database: 'pureenergyworks',       
  options: {
    // Diese Option ist für die lokale Entwicklung mit selbst-signierten Zertifikaten wichtig.
    // Für eine Produktionsumgebung mit einem validen SSL-Zertifikat setzen Sie dies auf `false`.
    trustServerCertificate: true
  }
};

// 2. Erstellen einer Funktion, um die Verbindung herzustellen und zu verwalten
async function connectToDb() {
  try {
    console.log("Versuche, eine Verbindung zum MSSQL-Server herzustellen...");
    const pool = await sql.connect(dbConfig);
    console.log("✅ Erfolgreich mit MSSQL verbunden!");
    return pool;
  } catch (err) {
    console.error("❌ Datenbankverbindung fehlgeschlagen:", err);
    // Wenn die DB-Verbindung beim Start fehlschlägt, ist die App nutzlos.
    // Wir werfen einen fatalen Fehler, der den Serverstart abbricht.
    throw error(500, "Konnte keine Verbindung zur Datenbank herstellen.");
  }
}

// 3. Verbindung herstellen und den Connection Pool exportieren
// Wir verwenden 'await' auf der obersten Ebene, was in modernen JS-Modulen möglich ist.
// Das bedeutet, dass jeder, der dieses Modul importiert, wartet, bis die Verbindung steht.
export const db = await connectToDb();