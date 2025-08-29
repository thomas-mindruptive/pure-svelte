import fs from 'fs/promises';
import path from 'path';
import { pages, scaffoldingConfig } from './scaffoldConfig.js';

// --- TYPEN & KONSTANTEN ---
const toCamelCase = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const scaffoldRemoveRegex = /\s*\/\/ SCAFFOLD-REMOVE-BEGIN[\s\S]*?\/\/ SCAFFOLD-REMOVE-END\s*\n?/g;

interface FileToWrite {
    path: string;
    content: string;
}

// NEU: Definiere einen Typ für das, was loadTemplates zurückgibt.
interface Templates {
    pageTpl: string;
    pageTsTpl: string;
    routeTpl: string;
    routeTsTpl: string;
}

// --- KERNFUNKTIONEN ---

/**
 * Liest alle Template-Dateien zu Beginn des Skripts ein.
 */
async function loadTemplates(): Promise<Templates> { // <-- Rückgabetyp hier explizit machen
    const templateDir = path.resolve(process.cwd(), 'tools', 'templates');
    const [pageTpl, pageTsTpl, routeTpl, routeTsTpl] = await Promise.all([
        fs.readFile(path.join(templateDir, 'page.svelte'), 'utf-8'),
        fs.readFile(path.join(templateDir, 'page.ts'), 'utf-8'),
        fs.readFile(path.join(templateDir, 'route-page.svelte'), 'utf-8'),
        fs.readFile(path.join(templateDir, 'route-page.ts'), 'utf-8'),
    ]);
    console.log('✅ Templates loaded successfully.');
    return { pageTpl, pageTsTpl, routeTpl, routeTsTpl };
}

/**
 * Bereitet das Zielverzeichnis vor, indem es optional gelöscht wird.
 */
async function prepareOutputDirectory() {
    if (scaffoldingConfig.deleteGeneratedFolderBeforeGeneration) {
        console.warn(`\n⚠️  Deleting directory as configured: ${scaffoldingConfig.generatedRoot}`);
        await fs.rm(scaffoldingConfig.generatedRoot, { recursive: true, force: true });
        console.log(`✅ Directory deleted.`);
    } else {
        console.log('\n- Skipping directory deletion as configured.');
    }
}

/**
 * Generiert den Inhalt für alle vier benötigten Dateien für eine einzelne Page-Konfiguration.
 */
// KORREKTUR: Verwende den neuen `Templates`-Typ anstelle von `any`.
function generateFilesContent(pageKey: string, templates: Templates): FileToWrite[] {
    const config = pages[pageKey];
    const { baseDir, pageName, paramName } = config;
    const camelCaseName = toCamelCase(pageName);

    const pageDir = path.resolve(process.cwd(), scaffoldingConfig.pagesRoot, baseDir);
    const routeDir = path.resolve(process.cwd(), scaffoldingConfig.routesRoot, baseDir, paramName ? `[${paramName}]` : '');
    const relativePathToPage = path.relative(routeDir, pageDir).replace(/\\/g, '/');

    const paramLogSuffix = paramName ? ` with ID: \${_event.params.${paramName}}` : '.';
    const paramId = paramName ? `Number(_event.params.${paramName})` : 'null';

    return [
        {
            path: path.join(pageDir, `${pageName}.svelte`),
            content: templates.pageTpl.replaceAll('PageName$PlaceHolder', pageName)
        },
        {
            path: path.join(pageDir, `${camelCaseName}.ts`),
            content: templates.pageTsTpl
                .replace(scaffoldRemoveRegex, '')
                .replaceAll('PageName$PlaceHolder', pageName)
                .replaceAll('paramLogSuffix$PlaceHolder', paramLogSuffix)
                .replaceAll('paramId$PlaceHolder', paramId)
        },
        {
            path: path.join(routeDir, '+page.ts'),
            content: templates.routeTsTpl
                .replaceAll('relativePath$PlaceHolder', relativePathToPage)
                .replaceAll('pageNameCamelCase$PlaceHolder', camelCaseName)
        },
        {
            path: path.join(routeDir, '+page.svelte'),
            content: templates.routeTpl
                .replace(scaffoldRemoveRegex, '')
                .replaceAll('PageName$PlaceHolder', pageName)
                .replaceAll('relativePath$PlaceHolder', relativePathToPage)
        }
    ];
}

/**
 * Schreibt eine einzelne Datei auf die Festplatte und berücksichtigt dabei die `overwriteExisting`-Konfiguration.
 */
async function writeFile(file: FileToWrite) {
    const relativePath = path.relative(process.cwd(), file.path);
    try {
        await fs.mkdir(path.dirname(file.path), { recursive: true });

        if (scaffoldingConfig.overwriteExisting) {
            await fs.writeFile(file.path, file.content);
            console.log(`  ✅ Created/Overwritten: ${relativePath}`);
        } else {
            // 'wx' flag throws an error if the file already exists.
            await fs.writeFile(file.path, file.content, { flag: 'wx' });
            console.log(`  ✅ Created: ${relativePath}`);
        }
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
            console.log(`  🟡 Skipped (already exists): ${relativePath}`);
        } else {
            console.error(`  ❌ Failed to create ${relativePath}:`, error);
        }
    }
}


// --- HAUPTFUNKTION (Orchestrator) ---

async function main() {
    console.log('--- SvelteKit Page Generator ---');
    
    await prepareOutputDirectory();
    const templates = await loadTemplates();
    
    console.log(`\nFound ${Object.keys(pages).length} page configurations to process.`);

    for (const pageKey of Object.keys(pages)) {
        console.log(`\nProcessing "${pages[pageKey].pageName}" (key: ${pageKey})...`);
        const filesToCreate = generateFilesContent(pageKey, templates);
        
        for (const file of filesToCreate) {
            await writeFile(file);
        }
    }
    console.log('\n🚀 All done!');
}

// Skript ausführen
main();