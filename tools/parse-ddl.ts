/**
 * DDL to Object Model Parser
 *
 * Parses MS SQL Server DDL (T-SQL) and generates object-model.json
 *
 * Usage: npm run parse-ddl
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ===== TYPES =====

interface ParsedTable {
  name: string;
  schema: string;
  entityName: string;
  fields: ParsedField[];
  primaryKey: string[];
  foreignKeys: ParsedFK[];
  uniqueConstraints: string[][];
}

interface ParsedField {
  name: string;
  sqlType: string;
  nullable: boolean;
  identity: boolean;
  default?: string;
  unique: boolean;
  isPrimaryKey?: boolean;
  maxLength?: number;
  precision?: [number, number];
}

interface ParsedFK {
  name: string;
  column: string;
  refTable: string;
  refColumn: string;
}

interface ObjectModelEntity {
  name: string;
  table: string;
  fields: ObjectModelField[];
  uniques?: string[][];
  relations: ObjectModelRelation[];
}

interface ObjectModelField {
  name: string;
  type: string;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  required?: boolean;
  nullable?: boolean;
  unique?: boolean;
  maxLength?: number;
  precision?: [number, number];
  default?: string;
  format?: string;
}

interface ObjectModelRelation {
  name: string;
  type: 'one-to-many' | 'many-to-one' | 'many-to-many';
  target: string;
  foreignKey?: string;
  through?: string;
  sourceKey?: string;
  throughSourceKey?: string;
  throughTargetKey?: string;
  targetKey?: string;
}

// ===== CONFIGURATION =====

const DDL_FILE = path.resolve(__dirname, '../../../pureenergy-schema/DDL.sql');
const OUTPUT_FILE = path.resolve(__dirname, '../../../pureenergy-schema/object-model.json');

// ===== TYPE MAPPING =====

function mapSqlTypeToObjectModelType(sqlType: string, fieldName: string, maxLength?: number): { type: string; format?: string } {
  const upper = sqlType.toUpperCase();

  if (upper.includes('INT')) return { type: 'integer' };
  if (upper.includes('BIT')) return { type: 'boolean' };
  if (upper.includes('DECIMAL') || upper.includes('NUMERIC') || upper.includes('MONEY')) return { type: 'number' };
  if (upper.includes('FLOAT') || upper.includes('REAL')) return { type: 'number' };
  if (upper.includes('DATE') || upper.includes('TIME')) return { type: 'datetime' };
  if (upper.includes('VARCHAR') || upper.includes('CHAR') || upper.includes('TEXT')) {
    // Check if it's a URL field based on field name
    const lowerName = fieldName.toLowerCase();
    if (lowerName.includes('url') || lowerName.includes('link') || lowerName.includes('website')) {
      return { type: 'string', format: 'uri' };
    }
    return { type: 'string' };
  }

  return { type: 'string' }; // fallback
}

function toPascalCase(str: string): string {
  let result = str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  // Singularize with proper English rules
  // Rule 1: -ies → -y (e.g., properties → property, categories → category)
  if (result.endsWith('ies')) {
    result = result.slice(0, -3) + 'y';
  }
  // Rule 2: -ses → -s (e.g., courses → course, but not Address → Addres)
  else if (result.endsWith('ses') && result.length > 4) {
    result = result.slice(0, -2);
  }
  // Rule 3: Regular plural -s (but not ss, us, is)
  else if (result.endsWith('s') && !result.endsWith('ss') && !result.endsWith('us') && !result.endsWith('is')) {
    result = result.slice(0, -1);
  }

  return result;
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

// ===== PARSING =====

function parseDDL(ddlContent: string): ParsedTable[] {
  const tables: ParsedTable[] = [];

  // Remove comments
  let content = ddlContent.replace(/--.*$/gm, ''); // Line comments
  content = content.replace(/\/\*[\s\S]*?\*\//g, ''); // Block comments

  // Extract CREATE TABLE statements
  const createTableRegex = /CREATE\s+TABLE\s+(dbo\.)?(\w+)\s*\(([\s\S]*?)\);/gi;
  let match;

  while ((match = createTableRegex.exec(content)) !== null) {
    const schema = match[1] ? 'dbo' : 'dbo';
    const tableName = match[2];
    const tableBody = match[3];

    const table = parseTableBody(schema, tableName, tableBody);
    tables.push(table);
  }

  // Parse CREATE UNIQUE INDEX for composite uniques
  const uniqueIndexRegex = /CREATE\s+UNIQUE\s+INDEX\s+\w+\s+ON\s+(dbo\.)?(\w+)\s*\(([\w,\s]+)\)/gi;
  while ((match = uniqueIndexRegex.exec(content)) !== null) {
    const tableName = match[2];
    const columns = match[3].split(',').map(c => c.trim());

    const table = tables.find(t => t.name === tableName);
    if (table && columns.length > 1) {
      table.uniqueConstraints.push(columns);
    }
  }

  return tables;
}

function parseTableBody(schema: string, tableName: string, body: string): ParsedTable {
  const table: ParsedTable = {
    name: tableName,
    schema,
    entityName: toPascalCase(tableName),
    fields: [],
    primaryKey: [],
    foreignKeys: [],
    uniqueConstraints: []
  };

  // Split into lines/statements
  const lines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Handle multi-line statements
    // Continue if line doesn't look complete (e.g., CONSTRAINT without REFERENCES yet)
    while (i + 1 < lines.length) {
      const nextLine = lines[i + 1];

      // Stop if next line is clearly a new statement
      if (nextLine.startsWith('CONSTRAINT') || nextLine.match(/^\w+\s+(N?VARCHAR|INT|BIT|DECIMAL|DATETIME)/i)) {
        break;
      }

      // Continue if current line ends with comma, or if it looks incomplete (FOREIGN KEY without REFERENCES)
      if (line.endsWith(',') || (line.includes('FOREIGN KEY') && !line.includes('REFERENCES'))) {
        i++;
        line += ' ' + nextLine.trim();
      } else {
        break;
      }
    }

    // Remove trailing comma
    line = line.replace(/,\s*$/, '');

    if (line.startsWith('CONSTRAINT')) {
      parseConstraint(line, table);
    } else if (line.match(/^\w+\s+\w+/)) {
      // This is a column definition
      const field = parseField(line);
      if (field) {
        table.fields.push(field);
        if (field.isPrimaryKey) {
          table.primaryKey.push(field.name);
        }
        if (field.unique) {
          // Single-column unique
          table.uniqueConstraints.push([field.name]);
        }
      }
    }
  }

  return table;
}

function parseField(line: string): ParsedField | null {
  // Pattern: column_name TYPE [constraints...]
  const match = line.match(/^(\w+)\s+(N?VARCHAR|INT|BIT|DECIMAL|NUMERIC|DATETIME2?|FLOAT|REAL|MONEY|TEXT|NTEXT)\s*(\([^)]+\))?\s*(.*)?$/i);

  if (!match) return null;

  const name = match[1];
  const sqlType = match[2];
  const typeParams = match[3];
  const constraints = match[4] || '';

  const field: ParsedField = {
    name,
    sqlType,
    nullable: !constraints.toUpperCase().includes('NOT NULL'),
    identity: constraints.toUpperCase().includes('IDENTITY'),
    unique: constraints.toUpperCase().includes('UNIQUE'),
    default: undefined,
    maxLength: undefined,
    precision: undefined,
    isPrimaryKey: constraints.toUpperCase().includes('PRIMARY KEY')
  };

  // Parse type parameters
  if (typeParams) {
    const params = typeParams.slice(1, -1); // Remove ()
    if (sqlType.toUpperCase().includes('VARCHAR') || sqlType.toUpperCase().includes('CHAR')) {
      const len = parseInt(params, 10);
      if (!isNaN(len)) field.maxLength = len;
    } else if (sqlType.toUpperCase().includes('DECIMAL') || sqlType.toUpperCase().includes('NUMERIC')) {
      const parts = params.split(',').map(p => parseInt(p.trim(), 10));
      if (parts.length === 2) field.precision = [parts[0], parts[1]];
    }
  }

  // Parse DEFAULT - Handle both DEFAULT value and DEFAULT(value)
  const defaultMatch = constraints.match(/DEFAULT\s*\(?([^),]+)\)?/i);
  if (defaultMatch) {
    field.default = defaultMatch[1].trim();
  }

  // Add inline PK to table.primaryKey (will be handled in parseTableBody)

  return field;
}

function parseConstraint(line: string, table: ParsedTable): void {
  // PRIMARY KEY
  const pkMatch = line.match(/CONSTRAINT\s+\w+\s+PRIMARY\s+KEY\s*\(([\w,\s]+)\)/i);
  if (pkMatch) {
    table.primaryKey = pkMatch[1].split(',').map(c => c.trim());
    return;
  }

  // FOREIGN KEY
  const fkMatch = line.match(/CONSTRAINT\s+(\w+)\s+FOREIGN\s+KEY\s*\((\w+)\)\s+REFERENCES\s+(dbo\.)?(\w+)\s*\((\w+)\)/i);
  if (fkMatch) {
    table.foreignKeys.push({
      name: fkMatch[1],
      column: fkMatch[2],
      refTable: fkMatch[4],
      refColumn: fkMatch[5]
    });
    return;
  }

  // UNIQUE (not handled here, single-column unique is in field, composite is in CREATE INDEX)
}

// ===== JUNCTION TABLE DETECTION =====

function isJunctionTable(table: ParsedTable): boolean {
  // Junction table criteria:
  // 1. Composite primary key with exactly 2 columns
  // 2. At least 2 foreign keys
  // 3. All PK columns are FK columns
  if (table.primaryKey.length !== 2) return false;
  if (table.foreignKeys.length < 2) return false;

  const fkColumns = new Set(table.foreignKeys.map(fk => fk.column));
  return table.primaryKey.every(pk => fkColumns.has(pk));
}

// ===== RELATION BUILDING =====

function buildRelations(tables: ParsedTable[]): Map<string, ObjectModelRelation[]> {
  const relationsByTable = new Map<string, ObjectModelRelation[]>();

  // Initialize
  tables.forEach(t => relationsByTable.set(t.entityName, []));

  // Detect junction tables
  const junctionTables = tables.filter(isJunctionTable);
  const junctionTableNames = new Set(junctionTables.map(t => t.name));

  // Process junction tables for many-to-many
  junctionTables.forEach(junction => {
    const fks = junction.foreignKeys;
    if (fks.length !== 2) return;

    const [fk1, fk2] = fks;
    const table1 = tables.find(t => t.name === fk1.refTable);
    const table2 = tables.find(t => t.name === fk2.refTable);

    if (!table1 || !table2) return;

    // Add many-to-many in both directions
    relationsByTable.get(table1.entityName)!.push({
      name: toCamelCase(table2.name),
      type: 'many-to-many',
      target: table2.entityName,
      through: junction.entityName,
      sourceKey: fk1.refColumn,
      throughSourceKey: fk1.column,
      throughTargetKey: fk2.column,
      targetKey: fk2.refColumn
    });

    relationsByTable.get(table2.entityName)!.push({
      name: toCamelCase(table1.name),
      type: 'many-to-many',
      target: table1.entityName,
      through: junction.entityName,
      sourceKey: fk2.refColumn,
      throughSourceKey: fk2.column,
      throughTargetKey: fk1.column,
      targetKey: fk1.refColumn
    });
  });

  // Process regular foreign keys (many-to-one + one-to-many)
  tables.forEach(table => {
    if (junctionTableNames.has(table.name)) return; // Skip junction tables

    table.foreignKeys.forEach(fk => {
      const targetTable = tables.find(t => t.name === fk.refTable);
      if (!targetTable) return;

      // Skip if target is a junction table
      if (junctionTableNames.has(targetTable.name)) return;

      // many-to-one: current table → target table
      relationsByTable.get(table.entityName)!.push({
        name: toCamelCase(targetTable.name),
        type: 'many-to-one',
        target: targetTable.entityName,
        foreignKey: fk.column
      });

      // one-to-many: target table → current table
      relationsByTable.get(targetTable.entityName)!.push({
        name: toCamelCase(table.name),
        type: 'one-to-many',
        target: table.entityName,
        foreignKey: fk.column
      });
    });
  });

  return relationsByTable;
}

// ===== OBJECT MODEL GENERATION =====

function generateObjectModel(tables: ParsedTable[]): any {
  const relationsByTable = buildRelations(tables);

  const entities: ObjectModelEntity[] = tables
    .filter(t => !isJunctionTable(t)) // Junction tables are not entities in object-model
    .map(table => {
      const entity: ObjectModelEntity = {
        name: table.entityName,
        table: `${table.schema}.${table.name}`,
        fields: table.fields.map(field => {
          const { type, format } = mapSqlTypeToObjectModelType(field.sqlType, field.name, field.maxLength);
          const isPrimaryKey = table.primaryKey.includes(field.name);

          const modelField: ObjectModelField = {
            name: field.name,
            type
          };

          if (isPrimaryKey) modelField.primaryKey = true;
          if (field.identity) modelField.autoIncrement = true;
          if (!field.nullable) modelField.required = true;
          if (field.nullable) modelField.nullable = true;
          if (field.unique && !isPrimaryKey) modelField.unique = true;
          if (field.maxLength) modelField.maxLength = field.maxLength;
          if (field.precision) modelField.precision = field.precision;
          if (field.default) modelField.default = field.default;
          if (format) modelField.format = format;

          return modelField;
        }),
        relations: relationsByTable.get(table.entityName) || []
      };

      // Add composite uniques
      if (table.uniqueConstraints.length > 0) {
        entity.uniques = table.uniqueConstraints;
      }

      return entity;
    });

  return {
    model: 'pureenergyworks',
    version: 1,
    entities
  };
}

// ===== MAIN =====

function main() {
  console.log('🔍 Parsing DDL...');
  console.log(`   Input: ${DDL_FILE}`);

  if (!fs.existsSync(DDL_FILE)) {
    console.error(`❌ Error: DDL file not found at ${DDL_FILE}`);
    process.exit(1);
  }

  const ddlContent = fs.readFileSync(DDL_FILE, 'utf-8');
  const tables = parseDDL(ddlContent);

  console.log(`✅ Parsed ${tables.length} tables`);

  console.log('\n📊 All Tables:');
  tables.forEach(t => {
    const isJunction = isJunctionTable(t);
    console.log(`   ${isJunction ? '✓' : '·'} ${t.name} - PK: [${t.primaryKey.join(', ')}], FKs: ${t.foreignKeys.length}`);
  });

  console.log('\n📊 Junction Tables Detected:');
  tables.filter(isJunctionTable).forEach(t => {
    console.log(`   - ${t.name} (${t.foreignKeys.map(fk => `${fk.column} → ${fk.refTable}`).join(', ')})`);
  });

  console.log('\n🔗 Generating object model...');
  const objectModel = generateObjectModel(tables);

  console.log(`✅ Generated ${objectModel.entities.length} entities`);

  console.log(`\n💾 Writing to ${OUTPUT_FILE}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(objectModel, null, 2), 'utf-8');

  console.log('✅ Done!\n');
}

main();
