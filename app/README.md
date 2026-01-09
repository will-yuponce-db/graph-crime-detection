# Crime Network Analysis Platform

A powerful graph visualization and analysis platform designed for law enforcement and intelligence agencies to map, analyze, and understand criminal networks, terrorist organizations, and transnational threats.

<img width="1714" height="818" alt="Screenshot 2025-11-24 at 11 08 58 AM" src="https://github.com/user-attachments/assets/2aa96a8f-02d8-4e64-b9fd-04c210688d23" />


## 🎯 Mission

Built specifically for the Intelligence Community and law enforcement agencies, this platform enables analysts to visualize complex criminal relationships, track financial flows, identify key actors, and discover hidden connections across multi-jurisdictional investigations.

## 🔐 Key Features for Intelligence Analysis

### Core Capabilities
- **Interactive Network Mapping** - Visualize suspects, organizations, locations, and assets in an interactive graph
- **Relationship Analysis** - Track associations, communications, financial transfers, and organizational hierarchies
- **Change Tracking** - Distinguish between confirmed intelligence and newly discovered connections
- **Multi-Source Integration** - Combine HUMINT, SIGINT, FININT, and open-source intelligence
- **Temporal Analysis** - Track network evolution and investigate activities over time
- **Data Classification** - Built-in support for classification markings (SECRET, CONFIDENTIAL, etc.)

### Advanced Features
- **Entity Types** - Suspects, Organizations, Locations, Financial Accounts, Communication Devices, Events, Assets
- **Relationship Types** - Member Of, Associates With, Communicated With, Transferred Funds To, Controls, Leads, Attended, Owns
- **Property-Rich Entities** - Attach detailed intelligence metadata to any node or edge
- **Search & Filter** - Quickly locate entities by name, type, alias, or property values
- **Case Management** - Save proposed intelligence additions before committing to knowledge base
- **Evidence Tracking** - Document intelligence sources for each relationship

## 🏗️ Architecture

```
Frontend (React/TypeScript)
    ↓
Backend API (Express/Node.js)
    ↓
Data Layer (Databricks SQL Warehouse + SQLite)
```

**Key Technologies:**
- React 19 with TypeScript for type-safe development
- Material-UI (MUI) for professional, accessible interface
- react-force-graph-2d for high-performance graph visualization
- Databricks for enterprise-scale data storage and analytics
- SQLite for local development and air-gapped deployments

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ and npm
- (Optional) Databricks SQL Warehouse for production deployment
- Security clearance appropriate for classified data handling

### Demo Mode (No Setup Required)

The platform works immediately with realistic mock data representing an international organized crime investigation:

```bash
# Install dependencies
npm install

# Start the application
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to access the platform.

### Production Deployment

For production use with Databricks integration:

1. **Set up backend:**
```bash
cd backend
npm install
cp env.example .env
# Edit .env with your Databricks credentials
```

2. **Configure environment variables:**
```bash
# backend/.env
DATABRICKS_SERVER_HOSTNAME=your-workspace.cloud.databricks.com
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/...
DATABRICKS_CLIENT_ID=your-oauth-client-id
DATABRICKS_CLIENT_SECRET=your-oauth-client-secret
DATABRICKS_TABLE_NAME=main.intelligence.crime_network_entities
```

3. **Enable backend connection:**
```bash
# Create .env in project root
echo "VITE_USE_BACKEND_API=true" > .env
echo "VITE_API_URL=http://localhost:3000/api" >> .env
```

4. **Start services:**
```bash
# Terminal 1: Start backend
cd backend && npm start

# Terminal 2: Start frontend
npm run dev
```

## 📊 Data Model

### Entity Types

**Suspects** - Individuals under investigation
- Name, alias, nationality, date of birth
- Role in organization, threat level
- Last known location, classification level

**Organizations** - Criminal enterprises, terrorist cells, cartels
- Name, type, origin country
- Estimated membership, annual revenue
- Primary activities, operational areas

**Locations** - Safe houses, meeting points, operational sites
- Address, coordinates, location type
- Surveillance status, first observed date

**Financial Accounts** - Bank accounts, cryptocurrency wallets
- Account number (redacted), bank/institution
- Estimated balance, account type
- Opened date, current status

**Communication Devices** - Phones, encrypted apps, messaging platforms
- Device ID, device type, encryption level
- First detected, last activity date

**Events** - Meetings, transactions, crimes, shipments
- Event type, date, location
- Participants, amount (if financial)
- Intelligence source

**Assets** - Vehicles, aircraft, real estate, weapons
- Asset type, registration, estimated value
- Owner (registered/beneficial), location

### Relationship Types

- **MEMBER_OF** - Organizational membership and affiliation
- **ASSOCIATES_WITH** - Known criminal associations
- **COMMUNICATED_WITH** - Phone calls, messages, meetings
- **TRANSFERRED_FUNDS_TO** - Financial transactions and flows
- **LOCATED_AT** - Physical presence at locations
- **CONTROLS** - Control or ownership of accounts, assets, organizations
- **ATTENDED** - Participation in events
- **LEADS** - Leadership roles within organizations
- **OWNS** - Asset ownership
- **REPORTED_BY** - Intelligence reporting relationship

### Properties

All entities and relationships support custom properties for:
- Intelligence source attribution (HUMINT, SIGINT, FININT, etc.)
- Confidence levels (High, Medium, Low)
- Classification markings
- Dates (first contact, since, observed, etc.)
- Custom metadata specific to investigation

## 🔍 Use Cases

### Organized Crime Investigations
- Map cartel structures and distribution networks
- Track money laundering operations across jurisdictions
- Identify high-value targets and key facilitators

### Terrorism and Counterintelligence
- Map terrorist cell structures and support networks
- Track recruitment patterns and radicalization
- Identify foreign intelligence service operatives

### Financial Crime
- Visualize complex money laundering schemes
- Track cryptocurrency flows and mixers
- Identify shell companies and beneficial owners

### Transnational Threats
- Map relationships across international borders
- Track human trafficking and smuggling networks
- Identify logistics coordinators and transport routes

## 🔒 Security Considerations

### Data Classification
- Built-in classification level tracking (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP SECRET)
- Support for compartmented information (SCI)
- Proper handling of intelligence sources and methods

### Access Control (Future Enhancement)
- Role-based access control (RBAC)
- Need-to-know enforcement
- Audit logging of all data access

### Deployment Modes
- **Air-Gapped**: SQLite backend for classified networks
- **Cloud**: Databricks for unclassified to SECRET data
- **Hybrid**: Separate instances per classification level

### Compliance
- CJIS Security Policy compliance
- NIST 800-53 controls
- FedRAMP considerations
- Criminal Justice Information Services (CJIS) standards

## 🛠️ Development

### Project Structure
```
crime-graph/
├── src/
│   ├── components/       # Reusable UI components
│   ├── pages/           # Main application pages
│   ├── services/        # API integration layer
│   ├── data/            # Mock data for demo mode
│   ├── types/           # TypeScript type definitions
│   ├── theme/           # MUI theme configuration
│   └── hooks/           # Custom React hooks
├── backend/
│   ├── db/              # Database management
│   ├── server.js        # Express API server
│   └── utils/           # Backend utilities
└── public/              # Static assets
```

### Running Tests
```bash
npm run lint          # Code quality checks
npm run format        # Auto-format code
npm run build         # Production build
npm run preview       # Preview production build
```

### Code Quality
- ESLint for code quality
- Prettier for consistent formatting
- TypeScript for type safety
- Pre-commit hooks via Husky

## 📈 Scalability

The platform is designed to handle:
- **Nodes**: Millions of entities (suspects, organizations, etc.)
- **Edges**: Tens of millions of relationships
- **Properties**: Unlimited custom metadata per entity
- **Concurrent Users**: Hundreds of analysts (with proper backend scaling)

Databricks SQL Warehouse provides:
- Horizontal scalability for large datasets
- Fast query performance on massive graphs
- Integration with data lakes and lakehouses
- Advanced analytics and ML capabilities

## 🤝 Integration Opportunities

### Data Sources
- Case management systems (IBM i2, Palantir)
- Financial intelligence systems
- SIGINT databases
- Open-source intelligence platforms
- Law enforcement databases (NCIC, III, etc.)

### Export Formats
- Intelligence reports (PDF, Word)
- Network diagrams (PNG, SVG)
- Data exports (JSON, CSV)
- Graph databases (Neo4j, TigerGraph)

## 🎓 Training & Support

### Getting Started
1. Review the demo scenario (international organized crime network)
2. Experiment with search, filtering, and graph controls
3. Create test nodes and relationships
4. Explore entity properties and intelligence metadata

### Best Practices
- Document intelligence sources for all relationships
- Use confidence levels to indicate reliability
- Apply proper classification markings
- Regular case reviews and data quality checks

## 🔮 Roadmap

### Phase 1 (Current)
- ✅ Interactive graph visualization
- ✅ Entity and relationship management
- ✅ Change tracking and approval workflow
- ✅ Databricks integration

### Phase 2 (Planned)
- Advanced analytics (centrality metrics, community detection)
- Timeline visualization and temporal queries
- Multi-case support and case comparison
- Enhanced search with fuzzy matching

### Phase 3 (Future)
- Machine learning for link prediction
- Automated entity resolution and deduplication
- Real-time alerts for new connections
- Mobile application for field operations

## 🏛️ Target Agencies

This platform is designed for:
- **ODNI** - Office of the Director of National Intelligence
- **FBI** - Federal Bureau of Investigation
- **DEA** - Drug Enforcement Administration
- **DHS** - Department of Homeland Security
- **NSA** - National Security Agency (network analysis)
- **CIA** - Central Intelligence Agency
- **State/Local Law Enforcement** - Major crimes units
- **International Partners** - Five Eyes and allied agencies

## 📄 License

MIT License - Use and modify as needed for your agency's requirements.

---

## 🚨 Disclaimer

This is a demonstration platform. For operational use in classified environments, additional security hardening, accreditation, and compliance verification is required. Consult your agency's IT security team before deploying with classified data.

**For Official Use Only** - Demonstration purposes with mock data only.

---

Built with advanced graph analytics for the Intelligence Community and Law Enforcement professionals.
