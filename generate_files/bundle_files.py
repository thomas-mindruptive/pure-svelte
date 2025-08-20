#!/usr/bin/env python3
"""
Sammelt alle .cs-, .ts-, .html-, .json-, .yaml- und .yml-Dateien ab einem festgelegten Startverzeichnis und schreibt sie in einer einzigen Textdatei
mit Markerzeilen für jede Datei.
Vorher wird das Zielverzeichnis ggf. erstellt und die Zieldatei gelöscht, falls sie existiert.
Debug-Ausgabe zeigt jede verarbeitete Datei.
Enthält Listen von auszuschließenden Unterverzeichnissen und Dateien.
"""
from pathlib import Path
import sys

# --- Konfiguration ---
# Festgelegtes Startverzeichnis (relative oder absolute Angabe)
# START_DIR = Path(__file__).parent.parent.resolve()
START_DIR = Path(__file__).parent.parent.resolve() 
# Ausgabedatei im Unterverzeichnis "generated_data"
#OUTPUT_FILE = START_DIR / "generate_files" / "generated" / "all_classes_bundle.txt"
OUTPUT_FILE = Path(__file__).parent.resolve()  / "generated" / "bundle.txt"
# Dateiendungen, die gesammelt werden sollen
EXTENSIONS = ['.cs', '.ts', '.html', '.json', '.yaml', '.yml', '.css', '.md', '.json', '.old', '.svelte', '.js', '.txt', '.scss', '.cjs', '.mjs']
# Verzeichnisnamen (oder Pfadteile), die ausgeschlossen werden sollen
EXCLUDE_DIRS = [
    'bin', 'obj', '.git', 'Tests', '.venv', 'output', '.svelte-kit', '.venv'
    'generated_data', 'generate_files', 'input_data', 'node_modules', '.vite', 'playwright-report'
]
# Dateinamen, die ausgeschlossen werden sollen (nur Name mit Extension)
EXCLUDE_FILES = [
    'package-lock.json'
]

def bundle_files(start_dir: Path, output_file: Path):
    """
    Durchsuche rekursiv start_dir nach Dateien mit den angegebenen EXTENSIONS und schreibe sie in output_file.
    Jede Datei beginnt mit einer Zeile: // File: <relativer Pfad>
    Falls output_file bereits existiert, wird sie vorher gelöscht.
    Debug-Ausgabe für jede Datei.
    Dateipfade, die einen Ordnernamen aus EXCLUDE_DIRS enthalten, oder deren Dateiname in EXCLUDE_FILES steht, werden übersprungen.
    """
    # Sicherstellen, dass das Zielverzeichnis existiert
    output_dir = output_file.parent
    output_dir.mkdir(parents=True, exist_ok=True)

    # Lösche vorhandene Ausgabedatei, falls sie existiert
    if output_file.exists():
        try:
            output_file.unlink()
            print(f"✔ Vorhandene Ausgabedatei '{output_file.name}' gelöscht.")
        except Exception as e:
            print(f"⚠ Fehler beim Löschen der Datei '{output_file}': {e}", file=sys.stderr)
            sys.exit(1)

    start_dir = start_dir.resolve()
    # Alle relevanten Dateien sammeln
    all_files = sorted(start_dir.rglob('*'))
    target_files = [
        f for f in all_files
        if f.is_file()
           and f.suffix.lower() in EXTENSIONS
           and not any(part in EXCLUDE_DIRS for part in f.relative_to(start_dir).parts)
           and f.name not in EXCLUDE_FILES
    ]

    # Datei zum Schreiben öffnen
    try:
        with output_file.open('w', encoding='utf-8') as out:
            for file in target_files:
                rel_path = file.relative_to(start_dir)
                # Debug-Ausgabe pro Datei
                print(f"→ Verarbeite Datei: {rel_path}")
                # Markerzeile schreiben
                out.write(f"// File: {rel_path}\n")
                # Dateiinhalt lesen und schreiben
                content = file.read_text(encoding='utf-8')
                out.write(content)
                # Sicherstellen, dass am Ende ein Zeilenumbruch steht
                if not content.endswith('\n'):
                    out.write('\n')
                # Trennzeile zwischen Dateien
                out.write('\n')
    except Exception as e:
        print(f"⚠ Fehler beim Schreiben der Ausgabedatei '{output_file}': {e}", file=sys.stderr)
        sys.exit(1)

    print(f"✔ Alle {len(target_files)} Dateien ({', '.join(EXTENSIONS)}) ab '{start_dir}' ohne {EXCLUDE_DIRS} bzw. ohne Dateien {EXCLUDE_FILES} in '{output_file}' gebündelt.")

if __name__ == '__main__':
    # Ausgabe der Quell- und Zielinformationen zu Beginn
    print("--- Zusammenfassung ---")
    print(f"Quell-Startverzeichnis: {START_DIR}")
    print(f"Zieldatei: {OUTPUT_FILE.name}")
    print(f"Zielverzeichnis: {OUTPUT_FILE.parent.resolve()}")
    print(f"Zu sammelnde Dateiendungen: {EXTENSIONS}")
    print(f"Ausgeschlossene Verzeichnisse: {EXCLUDE_DIRS}")
    print(f"Ausgeschlossene Dateien: {EXCLUDE_FILES}")
    print("-----------------------")
    bundle_files(START_DIR, OUTPUT_FILE)
    print("Fertig.")
