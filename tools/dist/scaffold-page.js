import fs from 'fs/promises';
import path from 'path';
import { pages, scaffoldingConfig } from './scaffoldConfig.js';
// --- TYPEN & KONSTANTEN ---
const toCamelCase = (s) => s.charAt(0).toLowerCase() + s.slice(1);
// KORREKTUR: Dieser Regex ist jetzt robust gegen zusätzliche Zeichen in den Marker-Zeilen.
const scaffoldRemoveRegex = /\s*\/\/ SCAFFOLD-REMOVE-BEGIN.*[\s\S]*?.*SCAFFOLD-REMOVE-END.*\n?/g;
// --- KERNFUNKTIONEN ---
async function loadTemplates() {
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
async function prepareOutputDirectory() {
    if (scaffoldingConfig.deleteGeneratedFolderBeforeGeneration) {
        console.warn(`\n⚠️  Deleting directory as configured: ${scaffoldingConfig.generatedRoot}`);
        await fs.rm(scaffoldingConfig.generatedRoot, { recursive: true, force: true });
        console.log(`✅ Directory deleted.`);
    }
    else {
        console.log('\n- Skipping directory deletion as configured.');
    }
}
function generateFilesContent(baseDir, pageKey, templates) {
    const config = pages[baseDir][pageKey];
    const { pageName, paramName } = config;
    const camelCaseName = toCamelCase(pageName);
    const pageDir = path.resolve(process.cwd(), scaffoldingConfig.pagesRoot, baseDir);
    const routeDir = path.resolve(process.cwd(), scaffoldingConfig.routesRoot, baseDir, paramName ? `[${paramName}]` : '');
    const aliasPathToPageModule = `$lib/components/domain/${baseDir}`;
    const paramLogSuffix = paramName ? ` with ID: \${_event.params.${paramName}}` : '.';
    const paramId = paramName ? `Number(_event.params.${paramName})` : 'null';
    let pageTsContent = templates.pageTsTpl;
    pageTsContent = pageTsContent.replace(scaffoldRemoveRegex, '');
    pageTsContent = pageTsContent.replaceAll('PageName$PlaceHolder', pageName);
    pageTsContent = pageTsContent.replaceAll('paramLogSuffix$PlaceHolder', paramLogSuffix);
    pageTsContent = pageTsContent.replaceAll('paramId$PlaceHolder', paramId);
    let routeSvelteContent = templates.routeTpl;
    routeSvelteContent = routeSvelteContent.replace(scaffoldRemoveRegex, '');
    routeSvelteContent = routeSvelteContent.replaceAll('PageName$PlaceHolder', pageName);
    routeSvelteContent = routeSvelteContent.replaceAll('aliasPath$PlaceHolder', aliasPathToPageModule);
    let routeTsContent = templates.routeTsTpl;
    routeTsContent = routeTsContent.replaceAll('aliasPath$PlaceHolder', aliasPathToPageModule);
    routeTsContent = routeTsContent.replaceAll('pageNameCamelCase$PlaceHolder', camelCaseName);
    return [
        {
            path: path.join(pageDir, `${pageName}.svelte`),
            content: templates.pageTpl.replaceAll('PageName$PlaceHolder', pageName)
        },
        { path: path.join(pageDir, `${camelCaseName}.ts`), content: pageTsContent },
        { path: path.join(routeDir, '+page.ts'), content: routeTsContent },
        { path: path.join(routeDir, '+page.svelte'), content: routeSvelteContent }
    ];
}
async function writeFile(file) {
    const relativePath = path.relative(process.cwd(), file.path);
    try {
        await fs.mkdir(path.dirname(file.path), { recursive: true });
        if (scaffoldingConfig.overwriteExisting) {
            await fs.writeFile(file.path, file.content);
            console.log(`  ✅ Wrote/Overwrote: ${relativePath}`);
        }
        else {
            await fs.writeFile(file.path, file.content, { flag: 'wx' });
            console.log(`  ✅ Created: ${relativePath}`);
        }
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
            console.log(`  🟡 Skipped (already exists): ${relativePath}`);
        }
        else {
            console.error(`  ❌ Failed to create ${relativePath}:`, error);
        }
    }
}
// --- HAUPTFUNKTION (Orchestrator) ---
async function main() {
    console.log('--- SvelteKit Page Generator ---');
    await prepareOutputDirectory();
    const templates = await loadTemplates();
    let count = 0;
    for (const [baseDir, pageGroup] of Object.entries(pages)) {
        for (const pageKey of Object.keys(pageGroup)) {
            count++;
            const config = pages[baseDir][pageKey];
            console.log(`\nProcessing "${config.pageName}" (key: ${baseDir}.${pageKey})...`);
            const filesToCreate = generateFilesContent(baseDir, pageKey, templates);
            for (const file of filesToCreate) {
                await writeFile(file);
            }
        }
    }
    console.log(`\nFound and processed ${count} page configurations.`);
    console.log('\n🚀 All done!');
}
main();
//# sourceMappingURL=scaffold-page.js.map