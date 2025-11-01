# Hatch Documentation

Welcome to the Hatch documentation! This directory contains all technical, operational, and business documentation for the Hatch flash loan protocol.

## Quick Navigation

### Getting Started
- [Main README](../README.md) - Project overview and quick start
- [ROADMAP](../ROADMAP.md) - Development roadmap and current status

### Deployment & Operations

#### Guides
- [DEPLOYMENT.md](guides/DEPLOYMENT.md) - Complete deployment guide for testnet and mainnet
- [DEX_INTEGRATION.md](guides/DEX_INTEGRATION.md) - Guide for integrating new DEX adapters

#### Operations
- [RUNBOOK.md](operations/RUNBOOK.md) - Day-to-day operations manual
- [MONITORING.md](operations/MONITORING.md) - Production monitoring setup and alerts
- [PRODUCTION_READINESS.md](operations/PRODUCTION_READINESS.md) - Pre-launch readiness checklist

### Launch Strategies
- [LAUNCH_CHECKLIST.md](launch-strategies/LAUNCH_CHECKLIST.md) - 7-day launch plan
- [ZERO_CAPITAL_QUICKSTART.md](launch-strategies/ZERO_CAPITAL_QUICKSTART.md) - 4-week launch with external LPs
- [ZERO_CAPITAL_LAUNCH.md](launch-strategies/ZERO_CAPITAL_LAUNCH.md) - Complete zero-capital strategy

### Financial Documentation
- [FINANCIAL_SUMMARY.md](financial/FINANCIAL_SUMMARY.md) - Quick financial reference
- [FINANCIAL_MODEL.md](financial/FINANCIAL_MODEL.md) - Detailed financial model and projections
- [LP_OUTREACH_TRACKER.md](financial/LP_OUTREACH_TRACKER.md) - LP acquisition tracking
- [OUTREACH_TEMPLATES.md](financial/OUTREACH_TEMPLATES.md) - Marketing and outreach templates

### Deprecated
- [deprecated/](deprecated/) - Old documentation kept for reference (not recommended for new users)

---

## Documentation by Use Case

### I want to deploy Hatch to production
1. Read [guides/DEPLOYMENT.md](guides/DEPLOYMENT.md)
2. Complete [operations/PRODUCTION_READINESS.md](operations/PRODUCTION_READINESS.md) checklist
3. Follow [launch-strategies/LAUNCH_CHECKLIST.md](launch-strategies/LAUNCH_CHECKLIST.md)
4. Set up [operations/MONITORING.md](operations/MONITORING.md)

### I need liquidity providers (no capital)
1. Start with [launch-strategies/ZERO_CAPITAL_QUICKSTART.md](launch-strategies/ZERO_CAPITAL_QUICKSTART.md)
2. Use templates from [financial/OUTREACH_TEMPLATES.md](financial/OUTREACH_TEMPLATES.md)
3. Track progress with [financial/LP_OUTREACH_TRACKER.md](financial/LP_OUTREACH_TRACKER.md)
4. Show potential LPs [financial/FINANCIAL_SUMMARY.md](financial/FINANCIAL_SUMMARY.md)

### I'm running Hatch in production
1. Daily: Check [operations/RUNBOOK.md](operations/RUNBOOK.md)
2. Monitor via [operations/MONITORING.md](operations/MONITORING.md)
3. For incidents: Follow runbook troubleshooting section

### I want to integrate a new DEX
1. Follow [guides/DEX_INTEGRATION.md](guides/DEX_INTEGRATION.md)
2. Test deployment via [guides/DEPLOYMENT.md](guides/DEPLOYMENT.md)

### I need financial projections
1. Quick overview: [financial/FINANCIAL_SUMMARY.md](financial/FINANCIAL_SUMMARY.md)
2. Detailed model: [financial/FINANCIAL_MODEL.md](financial/FINANCIAL_MODEL.md)

---

## Document Status

### Current & Maintained
All documents in `guides/`, `operations/`, `launch-strategies/`, and `financial/` directories are actively maintained and current.

### Deprecated
Documents in `deprecated/` are kept for historical reference but are no longer maintained. They contain outdated information and have been superseded by the organized documentation structure.

---

## Documentation Standards

### For Contributors
When adding new documentation:
1. Place technical guides in `guides/`
2. Place operational docs in `operations/`
3. Place business/strategy docs in `launch-strategies/` or `financial/`
4. Update this README.md to include the new document
5. Cross-reference related documents

### Document Headers
All documents should include:
- Clear title
- Brief description of purpose
- Target audience (if applicable)
- Last updated date (optional)

---

## Contributing

To improve documentation:
1. Identify gaps or outdated information
2. Create or update the relevant document
3. Update this index
4. Submit a pull request

---

## Support

- **GitHub Issues**: https://github.com/TortoiseOS/hatch/issues
- **Documentation Feedback**: Create an issue with the "documentation" label

---

**Last Updated**: 2025-01-11
