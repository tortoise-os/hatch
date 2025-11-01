# TortoiseOS Hatch Documentation Index

**Last Updated**: 2025-11-01
**Repository**: hatch
**Purpose**: Trading strategies and yield optimization on Sui blockchain

---

## 📖 Documentation Structure

This repository uses TortoiseOS standardized documentation approach with:
- **Timestamps** for versioning
- **Clear deprecation** markers
- **Organized by type** (architecture, guides, operations, roadmaps)
- **Package-specific docs** in package directories

---

## 📂 Directory Organization

### Root Documentation (`/docs`)
```
docs/
├── INDEX.md          # This file - documentation index
├── README.md         # Documentation overview
├── current/          # Active, current documentation
├── archive/          # Historical/deprecated docs (timestamped)
├── guides/           # How-to guides and tutorials
├── architecture/     # Architecture and system design
├── operations/       # Operational guides (financial, monitoring, production)
└── roadmaps/         # Product roadmaps and launch strategies
```

---

## 📚 Current Documentation

### Getting Started
| Document | Location | Description | Status |
|----------|----------|-------------|--------|
| [DEPLOYMENT.md](./guides/DEPLOYMENT.md) | guides/ | Deployment guide | ✅ CURRENT |
| [DEX_INTEGRATION.md](./guides/DEX_INTEGRATION.md) | guides/ | DEX integration guide | ✅ CURRENT |
| [INTEGRATION.md](./current/INTEGRATION.md) | current/ | Integration documentation | ✅ CURRENT |

### Architecture
| Document | Location | Description | Status |
|----------|----------|-------------|--------|
| _No architecture docs yet_ | architecture/ | Architecture documentation | 📝 NEEDED |

### Operations
| Document | Location | Description | Status |
|----------|----------|-------------|--------|
| [MONITORING.md](./operations/MONITORING.md) | operations/ | Monitoring and observability | ✅ CURRENT |
| [PRODUCTION_READINESS.md](./operations/PRODUCTION_READINESS.md) | operations/ | Production readiness checklist | ✅ CURRENT |
| [RUNBOOK.md](./operations/RUNBOOK.md) | operations/ | Operations runbook | ✅ CURRENT |

### Financial Operations
| Document | Location | Description | Status |
|----------|----------|-------------|--------|
| [FINANCIAL_MODEL.md](./operations/FINANCIAL_MODEL.md) | operations/ | Financial model and projections | ✅ CURRENT |
| [FINANCIAL_SUMMARY.md](./operations/FINANCIAL_SUMMARY.md) | operations/ | Financial summary | ✅ CURRENT |
| [LP_OUTREACH_TRACKER.md](./operations/LP_OUTREACH_TRACKER.md) | operations/ | LP outreach tracking | ✅ CURRENT |
| [OUTREACH_TEMPLATES.md](./operations/OUTREACH_TEMPLATES.md) | operations/ | Outreach communication templates | ✅ CURRENT |

### Launch Strategies & Roadmaps
| Document | Location | Description | Status |
|----------|----------|-------------|--------|
| [LAUNCH_CHECKLIST.md](./roadmaps/LAUNCH_CHECKLIST.md) | roadmaps/ | Launch checklist and milestones | ✅ CURRENT |
| [ZERO_CAPITAL_LAUNCH.md](./roadmaps/ZERO_CAPITAL_LAUNCH.md) | roadmaps/ | Zero-capital launch strategy | ✅ CURRENT |
| [ZERO_CAPITAL_QUICKSTART.md](./roadmaps/ZERO_CAPITAL_QUICKSTART.md) | roadmaps/ | Quick start for zero-capital launch | ✅ CURRENT |

---

## 🗄️ Archived Documentation

Historical documentation in `/docs/archive/` (timestamped):

| Date | Document | Reason |
|------|----------|--------|
| 2025-11-01 | [DEPLOY_NOW.md](./archive/2025-11-01_DEPLOY_NOW.md) | Superseded by DEPLOYMENT.md |
| 2025-11-01 | [DEPLOY_WITH_100.md](./archive/2025-11-01_DEPLOY_WITH_100.md) | Superseded by launch strategies |
| 2025-11-01 | [MANUAL_ACTIONS.md](./archive/2025-11-01_MANUAL_ACTIONS.md) | Superseded by RUNBOOK.md |
| 2025-11-01 | [README.md](./archive/2025-11-01_README.md) | Old deprecated README |
| 2025-11-01 | [START_HERE.md](./archive/2025-11-01_START_HERE.md) | Superseded by current docs |

---

## 🏷️ Documentation Conventions

### Timestamps
All timestamped documentation uses format: `YYYY-MM-DD_FILENAME.md`

Example: `2025-11-01_DEPLOY_NOW.md`

### Status Markers
- ✅ **CURRENT** - Active, up-to-date documentation
- ⚠️ **NEEDS REVIEW** - May be outdated, needs verification
- 🔄 **ARCHIVED** - Historical record, not for current use
- 📝 **DRAFT** - Work in progress
- 📝 **NEEDED** - Documentation gap, needs to be created

### Linking
Always use relative paths:
```markdown
[Deployment Guide](./guides/DEPLOYMENT.md)
[Launch Strategy](./roadmaps/ZERO_CAPITAL_LAUNCH.md)
```

---

## 🔍 Finding Documentation

### By Topic

**Getting Started**
- Deploy Hatch? → [DEPLOYMENT.md](./guides/DEPLOYMENT.md)
- Integrate with DEX? → [DEX_INTEGRATION.md](./guides/DEX_INTEGRATION.md)
- Integration docs? → [INTEGRATION.md](./current/INTEGRATION.md)

**Operations**
- Monitoring? → [MONITORING.md](./operations/MONITORING.md)
- Production ready? → [PRODUCTION_READINESS.md](./operations/PRODUCTION_READINESS.md)
- Operations runbook? → [RUNBOOK.md](./operations/RUNBOOK.md)

**Financial**
- Financial model? → [FINANCIAL_MODEL.md](./operations/FINANCIAL_MODEL.md)
- LP outreach? → [LP_OUTREACH_TRACKER.md](./operations/LP_OUTREACH_TRACKER.md)
- Outreach templates? → [OUTREACH_TEMPLATES.md](./operations/OUTREACH_TEMPLATES.md)

**Launch**
- Launch checklist? → [LAUNCH_CHECKLIST.md](./roadmaps/LAUNCH_CHECKLIST.md)
- Zero-capital strategy? → [ZERO_CAPITAL_LAUNCH.md](./roadmaps/ZERO_CAPITAL_LAUNCH.md)
- Quick launch? → [ZERO_CAPITAL_QUICKSTART.md](./roadmaps/ZERO_CAPITAL_QUICKSTART.md)

**Historical**
- Past decisions? → [/docs/archive/](./archive/)

### By Directory

- **`current/`** (1 file) - Active documentation for core concepts
- **`guides/`** (2 files) - Step-by-step how-to guides
- **`architecture/`** (0 files) - Architecture documentation (needs creation)
- **`operations/`** (7 files) - Financial, monitoring, and production operations
- **`archive/`** (5 files) - Historical documents with timestamps
- **`roadmaps/`** (3 files) - Launch strategies and roadmaps

---

## 📝 Contributing Documentation

### Creating New Documentation

1. **Determine type** (guide, architecture, operations, roadmap)
2. **Place in appropriate directory**:
   - Current active docs → `/docs/current/`
   - How-to guides → `/docs/guides/`
   - Architecture → `/docs/architecture/`
   - Operations → `/docs/operations/`
   - Roadmaps → `/docs/roadmaps/`
3. **Add timestamp if appropriate** (for versioned content)
4. **Update this INDEX.md**
5. **Add status marker** (CURRENT, DRAFT, etc.)

### Deprecating Documentation

1. **Move to `/docs/archive/`** with timestamp prefix
2. **Add deprecation marker** to title (🔄 ARCHIVED)
3. **Update INDEX.md** to mark as archived
4. **Add link to replacement** document if applicable
5. **Update any documents** that link to the deprecated doc

### Updating Documentation

1. **Update the document**
2. **Update "Last Updated"** timestamp in document header
3. **If major changes**, consider creating new timestamped version
4. **Update INDEX.md** if file moved or renamed

---

## 🔗 Quick Links

### Essential Reading
- 🚀 [Deployment Guide](./guides/DEPLOYMENT.md)
- 💰 [Zero-Capital Launch](./roadmaps/ZERO_CAPITAL_LAUNCH.md)
- 📊 [Financial Model](./operations/FINANCIAL_MODEL.md)
- 🔧 [Production Readiness](./operations/PRODUCTION_READINESS.md)

### For Contributors
- 🔌 [DEX Integration](./guides/DEX_INTEGRATION.md)
- 📝 [Integration Docs](./current/INTEGRATION.md)
- 📈 [Monitoring](./operations/MONITORING.md)

### For Maintainers
- 📋 [Launch Checklist](./roadmaps/LAUNCH_CHECKLIST.md)
- 📚 [Operations Runbook](./operations/RUNBOOK.md)
- 💼 [LP Outreach](./operations/LP_OUTREACH_TRACKER.md)

---

## 📧 Documentation Maintainers

For questions or suggestions about documentation:
- Create an issue with `[docs]` prefix
- Tag: `documentation`
- Repository: [tortoise-os/hatch](https://github.com/tortoise-os/hatch)

---

## 🚀 TortoiseOS Ecosystem

This is the **Hatch (Trading Strategies) repository**. For other documentation:
- **Foundation** (bun-move): `../bun-move/docs/INDEX.md`
- **Carapace** (AMM/DEX): `../carapace/docs/INDEX.md`
- **Turtle-net** (Network): `../turtle-net/docs/INDEX.md`

---

## 📊 Documentation Statistics

- **Total Documents**: 18 files
- **Current/Active**: 13 files
- **Guides**: 2 files
- **Architecture**: 0 files (needs creation)
- **Operations**: 7 files
- **Roadmaps**: 3 files
- **Archived**: 5 files
- **Last Organized**: 2025-11-01

---

**Navigation**: [Home](../README.md) | [Current](./current/) | [Guides](./guides/) | [Architecture](./architecture/) | [Operations](./operations/) | [Roadmaps](./roadmaps/) | [Archive](./archive/)

**Last Updated**: 2025-11-01
