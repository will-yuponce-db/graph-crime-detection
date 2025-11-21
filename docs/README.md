# Crime Graph Documentation

Welcome to the Crime Graph Intelligence Platform documentation.

## 📚 Documentation Structure

### Features

- **[Case Filters](features/CASE_FILTERS_GUIDE.md)** - Filtering and sorting cases
- **[Case Lifecycle](features/CASE_LIFECYCLE_GUIDE.md)** - Managing cases through investigation stages
- **[Case Merging](features/MERGE_CASES_GUIDE.md)** - Combining related cases
- **[Pagination](features/PAGINATION_GUIDE.md)** - Navigating large datasets
- **[Global Case Filter](features/GLOBAL_CASE_FILTER_GUIDE.md)** - (Deprecated - now in sidebar)

### Integration Guides

- **[Databricks Integration](guides/DATABRICKS_INTEGRATION.md)** - Connecting to Databricks data sources
- **[Databricks Deployment](guides/DATABRICKS_APPS_DEPLOYMENT.md)** - Deploying to Databricks Apps
- **[Neo4j Workflow](guides/NEO4J_WORKFLOW.md)** - Working with Neo4j graph database

### Technical Documentation

- **[Redux Migration](technical/REDUX_MIGRATION.md)** - State management architecture
- **[State Management Upgrade](technical/STATE_MANAGEMENT_UPGRADE.md)** - Redux Toolkit implementation
- **[Dynamic Types](technical/DYNAMIC_TYPES_IMPLEMENTATION.md)** - Scalable type system for graph nodes
- **[Interactive Editor](technical/INTERACTIVE_EDITOR_GUIDE.md)** - Graph editing capabilities

## 🚀 Quick Start

See the main [README.md](../README.md) in the project root for setup instructions.

## 🏗️ Project Structure

```
crime-graph/
├── src/                    # Frontend source code
│   ├── components/         # React components
│   ├── pages/             # Page components
│   ├── store/             # Redux store and slices
│   ├── utils/             # Utility functions
│   └── types/             # TypeScript type definitions
├── backend/               # Backend server
├── scrapers/              # Data extraction tools
└── docs/                  # Documentation (you are here)
```

## 🛠️ Development Workflow

1. **Setup**: See [DEVELOPMENT.md](../DEVELOPMENT.md)
2. **Features**: Check feature guides above for specific functionality
3. **Integration**: Review integration guides for connecting external systems
4. **Technical**: Dive into technical docs for architecture details

## 📝 Recent Updates

See [CHANGELOG.md](../CHANGELOG.md) for version history and recent changes.

## 🆘 Getting Help

- Check the relevant documentation section above
- Review error messages in browser console
- Check Redux DevTools for state issues
- Look at network tab for API issues
