# Changelog - Interactive Graph Editor

## Version 2.0.0 - Interactive Editor Release

### 🎉 Major Features Added

#### Interactive Node Creation

- ✅ Drag-and-drop node palette with 4 node types
- ✅ Visual node creation with form-based property editing
- ✅ Support for custom properties (key-value pairs)
- ✅ Automatic ID generation for new nodes
- ✅ Visual distinction between new (green) and existing (blue) nodes

#### Interactive Edge Creation

- ✅ Click-to-connect edge creation mode
- ✅ Visual feedback (crosshair cursor, highlighted source node)
- ✅ Relationship type selection from predefined types
- ✅ Custom edge properties support
- ✅ Visual distinction for new edges (green dashed lines)

#### Node & Edge Editing

- ✅ Click any node to edit its properties
- ✅ Modal forms for comprehensive editing
- ✅ Property validation and type detection (string, number, boolean)
- ✅ Keyboard shortcuts (Delete/Backspace to remove items, Escape to cancel)

#### State Management

- ✅ Custom `useGraphEditor` hook for complex state management
- ✅ Tracks original data, user modifications, and deletions separately
- ✅ Undo-friendly architecture (though undo not yet implemented)
- ✅ Selection state tracking
- ✅ Edge creation mode state

#### Backend & Database

- ✅ SQLite database integration with better-sqlite3
- ✅ Automatic database initialization and seeding
- ✅ REST API endpoints for CRUD operations
- ✅ Databricks sync with graceful fallback to SQLite
- ✅ Transaction-based writes for data integrity
- ✅ Foreign key constraints and indexes

#### Developer Experience

- ✅ Startup scripts (`start-backend.sh`, `start-frontend.sh`)
- ✅ Comprehensive documentation (INTERACTIVE_EDITOR_GUIDE.md)
- ✅ Health check endpoint
- ✅ Proper error handling and user feedback
- ✅ TypeScript throughout for type safety

### 🔧 Technical Changes

#### New Backend Files

- `backend/db/schema.sql` - Database schema definition
- `backend/db/database.js` - SQLite connection and query helpers
- `backend/db/seed.js` - Database seeding script
- `backend/server.js` - Updated with new API routes

#### New Frontend Components

- `src/components/NodePalette.tsx` - Draggable node type palette
- `src/components/NodeEdgeForm.tsx` - Modal forms for editing
- `src/hooks/useGraphEditor.ts` - State management hook

#### Updated Components

- `src/components/GraphVisualization.tsx` - Added drag-drop and click handlers
- `src/pages/GraphVisualization.tsx` - Complete rewrite for editor functionality
- `src/services/graphApi.ts` - Updated API integration

#### Backend API Endpoints

**New:**

- `POST /api/graph` - Save new nodes and edges
- `PATCH /api/graph/status` - Update item status
- `POST /api/graph/seed` - Reseed database
- `GET /health` - Health check

**Updated:**

- `GET /api/graph` - Now fetches from SQLite with Databricks fallback

### 📦 Dependencies Added

**Backend:**

- `better-sqlite3@^9.2.2` - SQLite database driver

**No new frontend dependencies** - Used existing MUI components

### 🎨 UI/UX Improvements

- Three-column layout (Palette | Graph | Controls)
- Visual feedback for all interactive operations
- Success/error notifications via snackbars
- Confirmation dialogs for destructive actions
- Loading states for async operations
- Connection status banner
- Real-time statistics updates

### 🔒 Data Integrity

- SQLite foreign key constraints
- Transaction-based bulk operations
- Proper error handling and rollback
- Status tracking (new, existing, modified)
- Validation in forms before save

### 📖 Documentation Added

- `INTERACTIVE_EDITOR_GUIDE.md` - Comprehensive user guide
- `README_SETUP.md` - Quick start guide
- `CHANGELOG.md` - This file
- Code comments throughout

### 🐛 Known Issues

- Edge editing not yet implemented (only creation and deletion)
- Cannot delete existing (non-NEW) items from UI
- No undo/redo functionality yet
- Large graphs (>1000 nodes) may have performance issues
- No export/import functionality yet

### 🚀 Performance Notes

- Force graph uses canvas rendering (efficient for 100s of nodes)
- SQLite provides fast local storage
- Databricks writes are async and don't block UI
- State updates are optimized with React hooks

### 🔄 Migration Notes

**From v1.0 (read-only) to v2.0 (interactive):**

1. Backend server is now **required** (was optional)
2. Data is stored in SQLite first, then synced to Databricks
3. Mock data is now in the database, not frontend code
4. Environment variable change:
   - Old: `VITE_USE_BACKEND_API=true` to enable backend
   - New: Backend enabled by default; set `=false` to disable

**No breaking changes to existing data or configuration.**

---

## Version 1.0.0 - Initial Release

### Features

- Read-only graph visualization
- Databricks SQL Warehouse integration
- Mock data fallback
- Node type filtering
- Relationship type filtering
- Force-directed graph layout
- Dark/light theme support

---

## Roadmap - Planned Features

### v2.1 - Enhanced Editing

- [ ] Edit existing edges
- [ ] Delete existing (non-NEW) items
- [ ] Undo/redo functionality
- [ ] Bulk operations (select multiple, delete multiple)
- [ ] Node/edge search

### v2.2 - Import/Export

- [ ] Export graph as JSON
- [ ] Export graph as CSV
- [ ] Import nodes from CSV
- [ ] Import edges from CSV
- [ ] Export visualization as PNG/SVG

### v2.3 - Advanced Features

- [ ] Graph layout algorithms (hierarchical, circular, etc.)
- [ ] Node grouping/clustering
- [ ] Path finding between nodes
- [ ] Subgraph extraction
- [ ] Time-based filtering (created_at, updated_at)

### v3.0 - Collaboration

- [ ] Real-time multi-user editing
- [ ] Change history/audit log
- [ ] Comments on nodes/edges
- [ ] User permissions
- [ ] Conflict resolution

---

## Credits

Built with:

- React + TypeScript
- Material-UI
- react-force-graph-2d
- better-sqlite3
- Express.js
- @databricks/sql
