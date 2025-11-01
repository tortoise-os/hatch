#!/usr/bin/env bash
set -euo pipefail

# Organize Hatch Documentation Script
# Standardizes documentation structure to match TortoiseOS conventions

COLOR_RESET='\033[0m'
COLOR_GREEN='\033[0;32m'
COLOR_BLUE='\033[0;34m'
COLOR_YELLOW='\033[1;33m'

print_header() {
    echo -e "${COLOR_BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"
    echo -e "${COLOR_BLUE}  $1${COLOR_RESET}"
    echo -e "${COLOR_BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLOR_RESET}"
}

print_success() {
    echo -e "${COLOR_GREEN}✓${COLOR_RESET} $1"
}

print_info() {
    echo -e "${COLOR_BLUE}ℹ${COLOR_RESET} $1"
}

print_move() {
    echo -e "${COLOR_YELLOW}→${COLOR_RESET} $1"
}

DOCS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../docs" && pwd)"

print_header "Standardizing Hatch Documentation Structure"
echo ""
print_info "Converting from old structure to standardized TortoiseOS structure"
echo ""

# Create standardized structure
mkdir -p "${DOCS_DIR}"/{current,archive,guides,architecture,operations,roadmaps}

print_info "Documentation directory: ${DOCS_DIR}"
echo ""

# GUIDES - Already correct, no changes needed
print_header "GUIDES documentation"
print_info "guides/ already matches standard structure - no changes needed"
echo ""

# OPERATIONS - Merge existing operations/ and financial/ into operations/
print_header "Moving OPERATIONS documentation"

# Financial docs go to operations (financial operations)
if [ -d "${DOCS_DIR}/financial" ]; then
    for file in "${DOCS_DIR}"/financial/*.md; do
        if [ -f "$file" ]; then
            filename=$(basename "$file")
            mv "$file" "${DOCS_DIR}/operations/"
            print_move "financial/${filename} → operations/${filename}"
        fi
    done
    rmdir "${DOCS_DIR}/financial" 2>/dev/null || true
fi
echo ""

# ROADMAPS - Launch strategies become roadmaps
print_header "Moving ROADMAPS (launch-strategies) documentation"
if [ -d "${DOCS_DIR}/launch-strategies" ]; then
    for file in "${DOCS_DIR}"/launch-strategies/*.md; do
        if [ -f "$file" ]; then
            filename=$(basename "$file")
            mv "$file" "${DOCS_DIR}/roadmaps/"
            print_move "launch-strategies/${filename} → roadmaps/${filename}"
        fi
    done
    rmdir "${DOCS_DIR}/launch-strategies" 2>/dev/null || true
fi
echo ""

# ARCHIVE - Add timestamps to deprecated/ contents
print_header "Moving ARCHIVE (deprecated) documentation"
TODAY=$(date +%Y-%m-%d)

if [ -d "${DOCS_DIR}/deprecated" ]; then
    for file in "${DOCS_DIR}"/deprecated/*.md; do
        if [ -f "$file" ]; then
            filename=$(basename "$file")
            # Only add timestamp if not already timestamped
            if [[ ! "$filename" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}_ ]]; then
                mv "$file" "${DOCS_DIR}/archive/${TODAY}_${filename}"
                print_move "deprecated/${filename} → archive/${TODAY}_${filename}"
            else
                mv "$file" "${DOCS_DIR}/archive/${filename}"
                print_move "deprecated/${filename} → archive/${filename}"
            fi
        fi
    done
    rmdir "${DOCS_DIR}/deprecated" 2>/dev/null || true
fi
echo ""

# CURRENT - Move INTEGRATION.md from root
print_header "Moving CURRENT documentation"
if [ -f "${DOCS_DIR}/INTEGRATION.md" ]; then
    mv "${DOCS_DIR}/INTEGRATION.md" "${DOCS_DIR}/current/"
    print_move "INTEGRATION.md → current/"
fi
echo ""

# Create .gitkeep if directories are empty
print_header "Creating placeholders for empty directories"
for dir in current architecture operations roadmaps; do
    if [ -z "$(ls -A "${DOCS_DIR}/${dir}" 2>/dev/null)" ]; then
        touch "${DOCS_DIR}/${dir}/.gitkeep"
        print_success "Created ${dir}/.gitkeep"
    fi
done
echo ""

# Summary
print_header "Documentation organization complete!"
echo ""
echo "Standardized structure:"
echo "  ${DOCS_DIR}/"
echo "  ├── INDEX.md              (will be created)"
echo "  ├── README.md             (stays in root)"
echo "  ├── current/              $(ls "${DOCS_DIR}"/current/*.md 2>/dev/null | wc -l | tr -d ' ') files"
echo "  ├── guides/               $(ls "${DOCS_DIR}"/guides/*.md 2>/dev/null | wc -l | tr -d ' ') files"
echo "  ├── architecture/         $(ls "${DOCS_DIR}"/architecture/*.md 2>/dev/null | wc -l | tr -d ' ') files"
echo "  ├── operations/           $(ls "${DOCS_DIR}"/operations/*.md 2>/dev/null | wc -l | tr -d ' ') files"
echo "  ├── archive/              $(ls "${DOCS_DIR}"/archive/*.md 2>/dev/null | wc -l | tr -d ' ') files"
echo "  └── roadmaps/             $(ls "${DOCS_DIR}"/roadmaps/*.md 2>/dev/null | wc -l | tr -d ' ') files"
echo ""

print_success "Hatch documentation now matches TortoiseOS standard structure!"
echo ""
