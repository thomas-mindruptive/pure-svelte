#!/usr/bin/env python3
from pathlib import Path
import sys, os, fnmatch
from typing import List, Dict, Iterable

# =========================
# Konfiguration
# =========================
START_DIR = Path(__file__).parent.parent.resolve()
OUTPUT_FILE = Path(__file__).parent.resolve() / "generated" / "bundle.txt"

TREE_ONLY = False
TREE_OUTPUT_FILE = Path(__file__).parent.resolve() / "generated" / "tree.txt"
TREE_INCLUDE_ALL_FILES_EXCEPT_EXCLUDES = True

EXTENSIONS = {
    ".cs",
    ".ts",
    ".html",
    ".json",
    ".yaml",
    ".yml",
    ".css",
    ".md",
    ".svelte",
    ".js",
    ".txt",
    ".scss",
    ".cjs",
    ".mjs",
}

EXCLUDE_PATTERNS = [
    "tmp",
    "tools",
    "node_modules",
    ".git",
    ".venv",
    ".vscode",
    ".svelte-kit",
    ".vite",
    "static",
    "playwright-report",
    "generated_data",
    "generate_files",
    "scaffolding-generated",
    "input_data",
    "output",
    "bin",
    "obj",
    "Tests",
]

EXCLUDE_FILES = ["package-lock.json", ".gitignore", "package.json", "package-lock.json"]

# Positivliste: Leer = alles zulassen
INCLUDE_PATTERNS: List[str] = [
    # z.B. "src/**", "app/*.svelte",
    # "src/lib/components/sidebarAndNav/**",
    # "src/routes/(browser)/*.*",
    # "**"
    # "src/lib/components/domain/offerings/**",
    "src/lib/domain/**",
    "src/lib/backendQueries/**",
    "src/lib/api/client/supplier.ts",
    "src/lib/utils/recordsetTransformer.ts",
    "src/routes/(browser)/suppliers/**"

]  

# =========================
# Logging
# =========================
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
_LEVELS = {"ERROR": 40, "WARN": 30, "INFO": 20, "DEBUG": 10}
_ICONS = {"ERROR": "✖", "WARN": "⚠", "INFO": "ℹ", "DEBUG": "·", "OK": "✔", "ARROW": "→"}


def _lvl() -> int:
    return _LEVELS.get(LOG_LEVEL, 20)


def log(level: str, msg: str):
    if _LEVELS.get(level, 100) >= _lvl():
        print(f"{_ICONS.get(level,'')} {msg}")


def info(msg: str):
    log("INFO", msg)


def warn(msg: str):
    log("WARN", msg)


def dbg(msg: str):
    log("DEBUG", msg)


def err(msg: str):
    log("ERROR", msg)


# =========================
# Hilfsfunktionen
# =========================
def ensure_parent(path: Path):
    info(
        f"{_ICONS['ARROW']} Stelle sicher, dass Zielverzeichnis '{path.parent}' existiert …"
    )
    path.parent.mkdir(parents=True, exist_ok=True)


def should_skip_dir(rel_dir: str) -> bool:
    rel = rel_dir.replace("\\", "/")
    for pat in EXCLUDE_PATTERNS:
        if pat in rel:
            warn(f"Ausgeschlossener Ordner: {rel} (Grund: '{pat}')")
            return True
    return False


def is_excluded_file(filepath_or_name: str) -> bool:
    fname = os.path.basename(filepath_or_name)
    return fname in EXCLUDE_FILES


def matches_include_patterns(rel_path: str) -> bool:
    if not INCLUDE_PATTERNS:
        return True
    return any(fnmatch.fnmatch(rel_path, pat) for pat in INCLUDE_PATTERNS)


def is_dir_relevant(rel_dir: str) -> bool:
    if not INCLUDE_PATTERNS:
        return True
    rel_dir = rel_dir.rstrip("/\\")
    if rel_dir in ("", "."):
        return True
    for pat in INCLUDE_PATTERNS:
        if fnmatch.fnmatch(rel_dir, pat):
            return True
        if pat.startswith(rel_dir + "/") or pat.startswith(rel_dir + "\\"):
            return True
    return False


def list_dir_safe(path: Path) -> Iterable[Path]:
    try:
        return list(path.iterdir())
    except PermissionError:
        warn(f"Kein Zugriff auf: {path}")
        return []


def log_excluded_file(rel_path: str, reason: str):
    warn(f"Ausgeschlossene Datei: {rel_path} (Grund: {reason})")


# =========================
# Verzeichnisstruktur
# =========================
def build_tree_lines(start_dir: Path, include_all_files: bool) -> list[str]:
    lines: list[str] = []

    def walk(current_dir: Path, level: int):
        rel_dir = os.path.relpath(current_dir, start_dir).replace("\\", "/")
        if rel_dir == ".":
            rel_dir = ""
        if rel_dir and not is_dir_relevant(rel_dir):
            dbg(f"Irrelevant (Include): {rel_dir}")
            return
        if rel_dir and should_skip_dir(rel_dir):
            return

        entries = list_dir_safe(current_dir)
        dirs, files = [], []
        for e in entries:
            rel_path = os.path.relpath(e, start_dir).replace("\\", "/")
            if e.is_dir():
                dirs.append(e)
            else:
                if is_excluded_file(e.name):
                    log_excluded_file(rel_path, "Dateiname in EXCLUDE_FILES")
                    continue
                if include_all_files or e.suffix.lower() in EXTENSIONS:
                    if matches_include_patterns(rel_path):
                        files.append(e)
                    else:
                        log_excluded_file(rel_path, "kein Treffer in INCLUDE_PATTERNS")

        dirs.sort(key=lambda p: p.name.casefold())
        files.sort(key=lambda p: p.name.casefold())

        if current_dir != start_dir:
            lines.append(f"{'  '*level}* {current_dir.name}")
        file_level = level if current_dir == start_dir else level + 1
        for f in files:
            lines.append(f"{'  '*file_level}* {f.name}")
        for d in dirs:
            walk(d, level + 1 if current_dir != start_dir else level)

    walk(start_dir, 0)
    return lines


def write_tree(start_dir: Path, output_file: Path, include_all_files: bool = False):
    ensure_parent(output_file)
    if output_file.exists():
        output_file.unlink()
    lines = build_tree_lines(start_dir, include_all_files)
    with open(output_file, "w", encoding="utf-8") as out:
        out.write("\n".join(lines) + "\n")
    info(
        f"{_ICONS['OK']} Verzeichnisstruktur in '{output_file}' geschrieben ({len(lines)} Zeilen)."
    )


# =========================
# Bundling
# =========================
def scan_target_files(start_dir: Path) -> tuple[List[str], Dict[str, bool]]:
    targets: List[str] = []
    matched: Dict[str, bool] = {pat: False for pat in INCLUDE_PATTERNS}

    for dirpath, dirnames, filenames in os.walk(start_dir):
        rel_dir = os.path.relpath(dirpath, start_dir).replace("\\", "/")
        if rel_dir == ".":
            rel_dir = ""
        if not is_dir_relevant(rel_dir):
            dirnames[:] = []
            continue
        if should_skip_dir(rel_dir):
            dirnames[:] = []
            continue

        for fname in filenames:
            filepath = os.path.join(dirpath, fname)
            rel_path = os.path.relpath(filepath, start_dir).replace("\\", "/")

            if not Path(fname).suffix.lower() in EXTENSIONS:
                log_excluded_file(rel_path, "Dateiendung nicht in EXTENSIONS")
                continue
            if is_excluded_file(fname):
                log_excluded_file(rel_path, "Dateiname in EXCLUDE_FILES")
                continue
            if not matches_include_patterns(rel_path):
                log_excluded_file(rel_path, "kein Treffer in INCLUDE_PATTERNS")
                continue

            for pat in INCLUDE_PATTERNS:
                if fnmatch.fnmatch(rel_path, pat):
                    matched[pat] = True
            targets.append(filepath)

    return targets, matched


def bundle_files(start_dir: Path, output_file: Path):
    ensure_parent(output_file)
    if output_file.exists():
        output_file.unlink()

    targets, matched = scan_target_files(start_dir)

    for pat, found in matched.items():
        if not found:
            warn(f"Keine Dateien für Include-Pattern '{pat}' gefunden.")

    info(f"{_ICONS['ARROW']} Insgesamt {len(targets)} Datei(en) zum Bündeln.")
    with open(output_file, "w", encoding="utf-8") as out:
        for fp in sorted(
            targets, key=lambda p: os.path.relpath(p, start_dir).casefold()
        ):
            rel = os.path.relpath(fp, start_dir).replace("\\", "/")
            info(f"{_ICONS['OK']} Verarbeite: {rel}")
            out.write(f"// File: {rel}\n")
            with open(fp, encoding="utf-8") as f:
                content = f.read()
            out.write(content)
            if not content.endswith("\n"):
                out.write("\n")
            out.write("\n")
    info(f"{_ICONS['OK']} Erfolgreich alle Dateien in '{output_file}' gebündelt.")


# =========================
# main
# =========================
def main():
    print("--- Zusammenfassung ---")
    print(f"LOG_LEVEL: {LOG_LEVEL}")
    print(f"Quell-Startverzeichnis: {START_DIR}")
    print(f"Bundle-Zieldatei: {OUTPUT_FILE}")
    print(f"Tree-Ausgabedatei: {TREE_OUTPUT_FILE}")
    print(f"Include-Patterns: {INCLUDE_PATTERNS or '[keine => alles]'}")
    print(f"Ausgeschlossene Verzeichnisse: {EXCLUDE_PATTERNS}")
    print(f"Ausgeschlossene Dateien: {EXCLUDE_FILES}")
    print("-----------------------")

    if not START_DIR.exists():
        err(f"Startverzeichnis existiert nicht: {START_DIR}")
        sys.exit(1)

    if TREE_ONLY:
        write_tree(
            START_DIR, TREE_OUTPUT_FILE, include_all_files=TREE_INCLUDE_ALL_FILES_EXCEPT_EXCLUDES
        )
        print("--- Fertig (Tree-Modus) ---")
    else:
        bundle_files(START_DIR, OUTPUT_FILE)
        print("--- Fertig ---")


if __name__ == "__main__":
    main()


