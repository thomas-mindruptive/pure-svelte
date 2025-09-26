# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Code Quality & Type Safety
- `npm run check` - Run type checking once
- `npm run check:watch` - Run type checking in watch mode
- `npm run lint` - Lint TypeScript and Svelte files
- `npm run lint:fix` - Lint and auto-fix issues

### Testing
- `npm test` - Run tests in watch mode
- `npm run test:run` - Run tests once

### Scaffolding Tools
- `npm run scaffold:page` - Generate new pages using templates (requires building tools first)
- `npm run tools:build` - Build scaffolding tools
- `npm run tools:watch` - Build scaffolding tools in watch mode

## Architecture Overview

### The SupplierBrowser Application

This is a specialized 5-level hierarchical data management system for navigating complex business relationships:

1. **Suppliers** (Master Data) - Independent entities with flexible querying
2. **Categories** (n:m Assignment) - Simple relationships between suppliers and global categories
3. **Offerings** (Attributed n:m) - Master data entity connecting suppliers and products with attributes like price/size
4. **Attributes** (Attributed Assignment) - n:m relationships with business data (attribute values)
5. **Links** (1:n Composition) - Links belonging to specific offerings

### Generic Type System

The application uses a sophisticated generic type system for API requests:

- **`AssignmentRequest<T1, T2, TChild>`** - For n:m relationships between master entities
- **`CreateChildRequest<TParent, TChild>`** - For 1:n hierarchical creation
- **`DeleteRequest<T>`** - For entity deletion with cascade options
- **`QueryRequest<T>`** - For flexible querying with the centralized `/api/query` endpoint

### Key Architectural Patterns

#### API Endpoint Patterns
- **Master Data**: `QueryPayload` for lists + Standard CRUD for individuals
- **Relationships**: `/api/<parent>-<child>` pattern (e.g., `/api/supplier-categories`)
- **Centralized Deletion**: All complex deletion logic in `lib/dataModel/deletes.ts`

#### Frontend Architecture
- **Domain-Driven Structure**: Co-location principle - all files for a domain in `src/lib/domain/[domain]/`
- **Page Delegation Pattern**: Routes in `src/routes/` delegate to domain modules in `src/lib/domain/`
- **"Dumb Shell / Smart Parent" Forms**: Generic `FormShell.svelte` + domain-specific parents (e.g., `SupplierForm.svelte`)

#### Navigation System
- **URL-Driven State**: `url.pathname` is single source of truth
- **Context Preservation**: System remembers deep drill-down paths when navigating to parents
- **Hierarchical Sidebar**: Data-driven navigation with `HierarchyTree` configuration
- **SSR State Isolation**: Critical separation of server-side state to prevent request bleed

### Technology Stack

#### Core Framework
- **SvelteKit** with file-based routing
- **Svelte 5** with runes enabled (`$state`, `$props`, `$derived`)
- **TypeScript** with strict type safety
- **Vite** for build tooling

#### Data & Validation
- **Zod** - Single source of truth for data validation (both client and server)
- **MS SQL Server** backend with `mssql` package
- **Type-Safe Query Builder** - Converts `QueryPayload` objects to parameterized SQL

#### Testing & Quality
- **Vitest** with Node environment and global test configuration
- **ESLint** with TypeScript and Svelte rules
- **Prettier** for code formatting

### Important Development Guidelines

#### Svelte 5 Best Practices
- Use `const { prop1, prop2 }: ComponentProps = $props()` for prop typing (NOT `$props<T>()`)
- Use `$derived.by()` for complex multi-line computations, `$derived()` for simple expressions
- Avoid global `$page` store in components - pass URL data through props from `load` functions

#### Form Architecture
- Context-aware reusable forms (see `OfferingForm.svelte` as example)
- HTML5 validation with CSS `:invalid` styling
- Zod schemas define server-side validation rules

#### Type Safety Approach
- Six pillars of type safety from database to UI
- Generic components with "Controlled Bridge" pattern for type safety
- Runtime validation with Zod schemas matching API validation

#### State Management
- Navigation state in central `navigationState.ts` store
- Component-level reactivity with Svelte 5 runes
- Server-side state isolation to prevent request bleed in SSR

### Database Schema Patterns

The application follows consistent patterns for table relationships:
- Master data tables: `dbo.wholesalers`, `dbo.product_categories`, etc.
- Assignment tables: `dbo.wholesaler_categories`, `dbo.wholesaler_offering_attributes`
- Foreign key naming: `[entity]_id` (e.g., `wholesaler_id`, `category_id`)

### Client-Side Deletion Helpers

Two specialized deletion functions handle different scenarios:
- **`cascadeDelete`** - For master data entities with dependency checking
- **`cascadeDeleteAssignments`** - For n:m relationship removal
Both support multi-stage confirmation dialogs for hard/soft dependencies.