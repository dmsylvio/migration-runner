# Migration Runner

A robust data migration system designed to migrate **over 1 million records** from a legacy MariaDB database (over 20 years old) to a modern PostgreSQL database, maintaining referential integrity and converting sequential IDs to UUIDs.

## 📋 Table of Contents

- [Overview](#-overview)
- [Migration Context](#-migration-context)
- [Key Changes](#-key-changes)
- [Technical Challenges & Solutions](#-technical-challenges--solutions)
- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [Migration Order](#-migration-order)
- [Implemented Migrators](#-implemented-migrators)
- [Special Features](#-special-features)
- [Troubleshooting](#-troubleshooting)

## 🎯 Overview

This project migrates data from a legacy MariaDB database to a new PostgreSQL database, performing the following main conversions:

- **Sequential IDs → UUIDs**: Converts `int(11)` IDs to UUID v7 (which includes timestamp in generation)
- **Foreign Keys**: Resolves and converts all references between tables
- **Enums**: Maps old enum values to new ones
- **Data Types**: Converts MariaDB types to PostgreSQL types
- **Data Validation & Cleaning**: Validates, cleans, and reformats data (e.g., CPF with 11 digits)
- **Checkpointing**: Allows resuming migrations from where they stopped
- **Synchronization**: Supports incremental synchronization after initial migration

## 📊 Migration Context

### Legacy Database (20+ Years Old)

The legacy MariaDB database had several architectural limitations:

- **Auto-increment integers** as primary keys (no timestamp information)
- **String-based foreign keys** instead of proper relational constraints
- **No unique constraints** on critical fields (e.g., email)
- **Inconsistent data formats** (e.g., CPF with varying formats, phone numbers)
- **Lack of proper normalization** and referential integrity
- **Mixed data types** and inconsistent field lengths

### New Database (Modern Architecture)

The new PostgreSQL database follows modern best practices:

- **UUID v7 primary keys** - Includes timestamp in generation, enabling better sorting and distribution
- **Proper foreign key constraints** - Enforced referential integrity
- **Unique constraints** - Email and other critical fields are now unique
- **Normalized structure** - Better planning and organization
- **Data validation** - Proper constraints and data types
- **Consistent formatting** - Standardized field lengths and formats

### Migration Scale

- **Over 1 million records** migrated across 22 tables
- **Complex relationships** between entities
- **Data quality issues** requiring extensive cleaning and validation
- **Zero downtime** migration strategy with checkpointing

## 🔄 Key Changes

### 1. Primary Key Migration: Auto-increment → UUID v7

**Old System:**

```sql
id INT(11) AUTO_INCREMENT PRIMARY KEY
```

**New System:**

```sql
id TEXT PRIMARY KEY -- UUID v7 (includes timestamp)
```

**Why UUID v7?**

- Includes timestamp in generation (better than UUID v4)
- Enables chronological sorting without additional indexes
- Better distribution across distributed systems
- No collision risk

### 2. Foreign Key Resolution

**Old System:**

- Foreign keys stored as strings or integers
- No referential integrity enforcement
- Manual lookups required

**New System:**

- Proper foreign key constraints
- UUID-based relationships
- Automatic referential integrity

**Migration Strategy:**

- Cache foreign key mappings for performance
- Resolve by `old_id` when available
- Fallback to name-based lookups when needed
- Handle missing references gracefully

### 3. Data Cleaning & Validation

**CPF (Brazilian Tax ID):**

- **Old**: Various formats (`123.456.789-00`, `12345678900`, etc.)
- **New**: Standardized to 11 digits (`varchar(11)`)
- **Process**: Remove formatting, validate length, handle edge cases

**Email:**

- **Old**: No unique constraint, duplicates allowed
- **New**: Unique constraint enforced
- **Process**: Handle duplicates during migration

**Passwords:**

- **Old**: Stored as plain text strings without any encryption
- **New**: Hashed using bcryptjs with salt rounds of 12 (`hashSync(password, 12)`)
- **Process**:
  - **Stage 1**: Accounts with passwords are hashed during migration. Accounts without passwords receive the placeholder `MIGRATION_PASSWORD_MISSING`
  - **Stage 2**: In the second migration stage, the system generates a random password with hash (12 salt rounds) for all accounts that have `MIGRATION_PASSWORD_MISSING`, ensuring no password remains unencrypted in the database
- **Security**: All passwords are encrypted. Users must change their password on first login to prevent any security risks from potential password leaks

**Phone Numbers & ZIP Codes:**

- **Old**: Inconsistent formats
- **New**: Standardized lengths and formats
- **Process**: Clean, validate, and truncate when necessary

### 4. Field Reformulation

Many fields were restructured for better organization:

- **Address fields**: Separated into `address`, `city`, `state_id`, `zip_code`
- **Name fields**: Standardized to `full_name`
- **Date fields**: Consistent `timestamp` with timezone support
- **Boolean fields**: Converted from `tinyint(1)` to proper `boolean`

## 🛠️ Technical Challenges & Solutions

### Challenge 1: Performance with 1M+ Records

**Problem:** Migrating over 1 million records requires efficient processing to avoid memory issues and long execution times.

**Solution:**

- **Batch Processing**: Process records in configurable batches (default: 1000)
- **Streaming Queries**: Fetch data in batches instead of loading all at once
- **Connection Pooling**: Efficient database connection management
- **Indexed Queries**: Optimized queries with proper indexes

**Result:** Successfully migrated 400k+ records in reasonable time.

### Challenge 2: Foreign Key Resolution

**Problem:** Old database used strings/integers for foreign keys, new database uses UUIDs. Need to resolve millions of relationships efficiently.

**Solution:**

- **In-Memory Caching**: Cache resolved foreign keys in `Map` objects
- **Batch Lookups**: Group foreign key resolutions when possible
- **Fallback Strategies**: Multiple resolution strategies (by old_id, by name, by UUID)
- **Smart Defaults**: Use first available record when exact match not found

**Result:** Reduced database queries by ~90% through caching.

### Challenge 3: Data Quality Issues

**Problem:** Legacy database had inconsistent data formats, missing values, and invalid references.

**Solution:**

- **Data Cleaning Functions**: Remove formatting, validate lengths, handle nulls
- **Fallback Values**: Provide defaults for required fields (e.g., first semester, first gender)
- **Error Logging**: Record all data quality issues for review
- **Graceful Degradation**: Skip invalid records with warnings instead of failing

**Result:** Successfully handled edge cases while maintaining data integrity.

### Challenge 4: Resumable Migrations

**Problem:** Migrations can take hours. Need to resume from where they stopped if interrupted.

**Solution:**

- **Checkpointing System**: Save progress after each batch
- **State Management**: Track last processed `updated_at` or `id` per entity
- **UPSERT Logic**: Safe to re-run migrations (won't create duplicates)
- **Run Tracking**: Log all migration runs with timestamps

**Result:** Migrations can be safely interrupted and resumed.

### Challenge 5: Incremental Synchronization

**Problem:** After initial migration, need to sync only new/changed records.

**Solution:**

- **Timestamp-Based Sync**: Use `updated_at` to identify changed records
- **Checkpoint Comparison**: Compare last sync checkpoint with source data
- **Efficient Queries**: Use `COALESCE` and proper ordering for sync queries
- **Dual Mode**: Separate `seed` (full migration) and `sync` (incremental) modes

**Result:** Fast incremental updates after initial migration.

### Challenge 6: UUID Generation Strategy

**Problem:** Need to generate UUIDs for all records while maintaining relationships.

**Solution:**

- **UUID v7 Generation**: Use `uuidv7` library for timestamp-based UUIDs
- **Always Generate New**: Never reuse old UUIDs (even if they exist)
- **Relationship Preservation**: Map old IDs to new UUIDs during migration
- **Consistent Strategy**: Same approach across all entities

**Result:** Clean UUID-based primary keys with timestamp information.

### Challenge 7: Public ID Sequences

**Problem:** Some tables need sequential public IDs (6 digits) for user-facing references.

**Solution:**

- **Auto-increment Logic**: Generate sequential 6-digit IDs (`000001`, `000002`, etc.)
- **Database Queries**: Find max existing public_id and increment
- **Thread-Safe**: Handle concurrent inserts safely
- **Preserve Existing**: Keep existing public_ids when updating

**Result:** Sequential public IDs for `internship_commitment_term` and `signed_internship_commitment_term`.

### Challenge 8: Password Security Migration

**Problem:** All passwords in the legacy database were stored as plain text strings without any encryption, creating a critical security vulnerability. We needed to migrate all user accounts and encrypt all passwords while ensuring users change them after login.

**Solution:**

- **Two-Stage Migration Strategy**:
  - **Stage 1**: Hash all existing plain text passwords using `hashSync(password, 12)` from bcryptjs. Accounts without passwords receive the placeholder `MIGRATION_PASSWORD_MISSING`
  - **Stage 2**: Generate random passwords with hash (12 salt rounds) for all accounts that have `MIGRATION_PASSWORD_MISSING`, ensuring no password remains unencrypted in the database
- **Security Measure**: Require password change on first login after migration
- **Fallback Handling**: Use placeholder for accounts with missing passwords, then replace with random hashed password in second stage

**Implementation:**

```typescript
// Stage 1: Hash existing passwords or use placeholder
const password = row.ds_senha
  ? hashSync(row.ds_senha, 12) // Hash with 12 salt rounds
  : "MIGRATION_PASSWORD_MISSING";

// Stage 2: Generate random password for accounts with MIGRATION_PASSWORD_MISSING
// (Implemented in second migration pass)
```

**Security Considerations:**

- All passwords are hashed before being stored in the new database
- Accounts without passwords receive a placeholder initially, then get a random hashed password in the second stage
- No plain text passwords exist in the new system at any point
- Users must change their password on first login to prevent any risk of password leakage
- Salt rounds of 12 provide strong security against brute force attacks

**Result:** All user passwords are securely hashed. Accounts that didn't have passwords in the legacy system receive random hashed passwords in the second migration stage, ensuring no password remains unencrypted in the database. The system enforces password changes on first login to eliminate any security risks from the legacy plain text storage.

## ✨ Features

- ✅ **22 migrators** implemented covering all main tables
- ✅ **Ordered execution** respecting dependencies between tables
- ✅ **Foreign key caching** to optimize performance
- ✅ **Checkpointing** to resume interrupted migrations
- ✅ **Detailed logging** with Pino
- ✅ **Robust error handling** with failure logging
- ✅ **Batch processing** to manage large data volumes
- ✅ **Sequential public IDs** (6 digits) for terms and signed documents
- ✅ **Data validation & cleaning** for CPF, email, phone numbers, ZIP codes
- ✅ **Incremental synchronization** support
- ✅ **Graceful error handling** with fallbacks

## 📦 Prerequisites

- Node.js 18+ or higher
- pnpm 10+ (or npm/yarn)
- Access to MariaDB database (legacy)
- Access to PostgreSQL database (new)
- TypeScript 5+

## 🚀 Installation

```bash
# Clone the repository
git clone https://github.com/dmsylvio/migration-runner
cd migration-runner

# Install dependencies
pnpm install

# Configure .env file (see Configuration section)
cp .env.example .env  # If example exists, or create manually

# Build the project (only compiles, does not execute migrations)
pnpm build
```

### 🚀 Server Deployment

To execute migrations on the server after build:

```bash
# Option 1: Build + Seed separately
pnpm build
pnpm seed

# Option 2: Deploy (recommended - does everything in one command)
pnpm deploy

# Option 3: With nix pack (uses 'start' script)
pnpm build
pnpm start
```

## ⚙️ Configuration

Create a `.env` file in the project root with the following variables:

```env
# MariaDB Database (legacy)
MARIADB_HOST=localhost
MARIADB_PORT=3306
MARIADB_USER=usuario
MARIADB_PASSWORD=senha
MARIADB_DATABASE=nome_do_banco

# PostgreSQL Database (new)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=usuario
POSTGRES_PASSWORD=senha
POSTGRES_DATABASE=nome_do_banco

# Migration settings
BATCH_SIZE=1000
```

### Environment Variables

| Variable            | Description                  | Default     |
| ------------------- | ---------------------------- | ----------- |
| `MARIADB_HOST`      | MariaDB database host        | `localhost` |
| `MARIADB_PORT`      | MariaDB database port        | `3306`      |
| `MARIADB_USER`      | MariaDB database user        | -           |
| `MARIADB_PASSWORD`  | MariaDB database password    | -           |
| `MARIADB_DATABASE`  | MariaDB database name        | -           |
| `POSTGRES_HOST`     | PostgreSQL database host     | `localhost` |
| `POSTGRES_PORT`     | PostgreSQL database port     | `5432`      |
| `POSTGRES_USER`     | PostgreSQL database user     | -           |
| `POSTGRES_PASSWORD` | PostgreSQL database password | -           |
| `POSTGRES_DATABASE` | PostgreSQL database name     | -           |
| `BATCH_SIZE`        | Batch size for processing    | `1000`      |

## 📖 Usage

### ⚠️ Important: Build vs Execution

- `pnpm build` - **Only compiles** TypeScript to JavaScript (does not execute migrations)
- `pnpm start` - **Executes** seed of all migrations (requires previous build, used by nix pack)
- `pnpm seed` or `pnpm sync` - **Executes** migrations (requires previous build)
- `pnpm deploy` - **Compiles AND executes** seed (recommended for server)

### 🔄 Resume Interrupted Migration

**The system automatically resumes from where it stopped!** Simply run the same command again:

```bash
# If interrupted during seed
pnpm start    # or pnpm seed

# If interrupted during sync
pnpm sync
```

The system uses **automatic checkpoints** - each entity saves its progress and continues from where it stopped on the next execution.

### Execute All Migrations (Seed)

Migrates all data from old database to new:

```bash
# Option 1: Build + Seed (recommended for server)
pnpm build
pnpm seed

# Option 2: Deploy (does build + seed in one command)
pnpm deploy

# Option 3: With TypeScript (development)
pnpm dev:cli seed --all

# Option 4: Directly with tsx
tsx src/cli.ts seed --all
```

### Execute All Migrations (Sync)

Synchronizes only new or modified data:

```bash
# Option 1: Build + Sync (recommended for server)
pnpm build
pnpm sync

# Option 2: Deploy Sync (does build + sync in one command)
pnpm deploy:sync

# Option 3: With TypeScript (development)
pnpm dev:cli sync --all

# Option 4: Directly with tsx
tsx src/cli.ts sync --all
```

### Execute Migration for a Specific Entity

```bash
# Seed a specific entity
pnpm dev:cli seed state
pnpm dev:cli seed student
pnpm dev:cli seed company

# Sync a specific entity
pnpm dev:cli sync student
pnpm dev:cli sync opportunity
```

### Available Commands

| Command         | Description                                      |
| --------------- | ------------------------------------------------ |
| `seed <entity>` | Migrates all data from a specific entity         |
| `seed --all`    | Migrates all data from all entities in order     |
| `sync <entity>` | Synchronizes new/modified data from an entity    |
| `sync --all`    | Synchronizes new/modified data from all entities |

## 📁 Project Structure

```
migration-runner/
├── src/
│   ├── cli.ts                    # Main CLI
│   ├── entities/                 # Migrators by entity
│   │   ├── index.ts             # Registration of all migrators
│   │   ├── types.ts             # TypeScript types
│   │   ├── state.migrator.ts    # State migrator
│   │   ├── users.migrator.ts    # User migrator
│   │   ├── company.migrator.ts  # Company migrator
│   │   └── ...                  # Other migrators
│   ├── db/
│   │   ├── mariadb.ts           # MariaDB connection
│   │   └── postgres.ts          # PostgreSQL connection
│   ├── state/
│   │   ├── checkpoints.ts       # Checkpoint management
│   │   ├── errors.ts            # Error logging
│   │   ├── runs.ts              # Execution control
│   │   └── schema.ts            # Migration database schema
│   ├── env.ts                   # Environment configuration
│   └── logger.ts                # Logging configuration
├── .env                         # Environment variables (create)
├── package.json
├── tsconfig.json
└── README.md
```

## 🔄 Migration Order

Migrations are executed automatically in the following order, respecting dependencies:

### Phase 1: Reference Tables (No Dependencies)

1. `state` - Brazilian states
2. `gender` - Genders
3. `marital_status` - Marital statuses
4. `education_level` - Education levels
5. `course` - Courses
6. `semester` - Semesters
7. `shift` - Shifts
8. `educational_institution` - Educational institutions

### Phase 2: Users

9. `users` - System users

### Phase 3: Main Entities

10. `company` - Companies
11. `institutions` - Institutions
12. `student` - Students

### Phase 4: Representatives and Supervisors

13. `company_representative` - Company representatives
14. `company_supervisor` - Company supervisors
15. `institution_representative` - Institution representatives
16. `institution_supervisor` - Institution supervisors

### Phase 5: Requests

17. `intern_requests` - Intern requests
18. `internship_agreement_requests` - Internship agreement requests

### Phase 6: Terms

19. `internship_commitment_term` - Internship commitment terms
20. `internship_termination_requests` - Termination requests
21. `signed_internship_commitment_term` - Signed terms

### Phase 7: Opportunities

22. `opportunity` - Internship opportunities

## 📊 Implemented Migrators

| #   | Entity                              | Old Table                    | Status | Notes                                |
| --- | ----------------------------------- | ---------------------------- | ------ | ------------------------------------ |
| 1   | `state`                             | `tb_estados`                 | ✅     | ID conversion                        |
| 2   | `gender`                            | `tb_sexo`                    | ✅     | Enum mapping                         |
| 3   | `marital_status`                    | `tb_estado_civil`            | ✅     | ID conversion                        |
| 4   | `education_level`                   | `tb_escolaridade`            | ✅     | ID conversion                        |
| 5   | `course`                            | `tb_confcurso`               | ✅     | ID conversion                        |
| 6   | `semester`                          | `tb_semestre`                | ✅     | ID conversion                        |
| 7   | `shift`                             | `tb_turno`                   | ✅     | ID conversion                        |
| 8   | `educational_institution`           | `tb_confinstituicao`         | ✅     | ID conversion                        |
| 9   | `users`                             | `tb_usuario`                 | ✅     | ID conversion, password hashing      |
| 10  | `company`                           | `tb_empresa`                 | ✅     | FK conversion, UUIDs                 |
| 11  | `institutions`                      | `tb_instituicao`             | ✅     | FK conversion, UUIDs                 |
| 12  | `student`                           | `tb_estudante`               | ✅     | Multiple FKs, enums                  |
| 13  | `company_representative`            | `representante_empresas`     | ✅     | UUID conversion                      |
| 14  | `company_supervisor`                | `supervisor_empresas`        | ✅     | UUID conversion                      |
| 15  | `institution_representative`        | `representante_instituicaos` | ✅     | UUID conversion                      |
| 16  | `institution_supervisor`            | `supervisor_instituicaos`    | ✅     | UUID conversion                      |
| 17  | `intern_requests`                   | `solicitar_estagiarios`      | ✅     | Enum mapping                         |
| 18  | `internship_agreement_requests`     | `solicitar_termos`           | ✅     | Name-based lookups                   |
| 19  | `internship_commitment_term`        | `tb_termo`                   | ✅     | Sequential public ID                 |
| 20  | `internship_termination_requests`   | `solicitar_rescisao_termos`  | ✅     | Enum mapping                         |
| 21  | `signed_internship_commitment_term` | `tce_docs`                   | ✅     | Sequential public ID                 |
| 22  | `opportunity`                       | `vagas`                      | ✅     | Name-based lookups, value conversion |

## 🎨 Special Features

### Sequential Public IDs

The `internship_commitment_term` and `signed_internship_commitment_term` tables automatically generate sequential 6-digit `public_id` values (e.g., `000001`, `000123`).

### Foreign Key Caching

All migrators implement caching to avoid multiple queries when resolving foreign keys, significantly improving performance.

### Checkpointing

The system maintains checkpoints for each entity, allowing:

- Resume interrupted migrations
- Incremental synchronization based on `updated_at`
- Progress tracking

### Error Handling

- Errors are logged in the `migration.migration_errors` table
- Execution continues even if an entity fails
- Detailed summary at the end of execution

### Intelligent Fallbacks

Some migrators implement fallbacks when required data is missing:

- If `semester_id` is empty, uses the first available semester
- If `gender_id` is empty, uses the first available gender
- If `supervisor_id` is empty, uses the first supervisor of the company/institution

### Data Cleaning

- **CPF**: Removes formatting, validates to 11 digits
- **ZIP Code**: Removes formatting, validates to 9 characters
- **Phone Numbers**: Standardizes format and length
- **Email**: Validates format and enforces uniqueness
- **Strings**: Trims whitespace and handles null values

## 🔧 Troubleshooting

### Error: "Entity not found"

Verify the entity name is correct:

```bash
# List available entities
grep "export const.*Migrator" src/entities/*.ts
```

### Database Connection Error

1. Check environment variables in `.env`
2. Test connection manually:

```bash
# Test MariaDB
mysql -h $MARIADB_HOST -u $MARIADB_USER -p$MARIADB_PASSWORD $MARIADB_DATABASE

# Test PostgreSQL
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DATABASE
```

### Error: "Foreign key not found"

This usually indicates that a dependent entity hasn't been migrated yet. Run migrations in order using `--all`:

```bash
pnpm dev:cli seed --all
```

### Resume Interrupted Migration

The system uses **automatic checkpoints**. If migration is interrupted, simply run the same command again:

```bash
# Will automatically continue from where it stopped (seed)
pnpm start
# or
pnpm seed

# Will automatically continue from where it stopped (sync)
pnpm sync
```

**How it works:**

- Each migrator saves a checkpoint after processing each batch
- The checkpoint stores the last `updated_at` or `id` processed
- When running again, the system reads the checkpoint and continues from where it stopped
- Doesn't process already migrated data (uses UPSERT)

**Example:**

```bash
# First execution (interrupted in the middle)
pnpm start
# ... migrates state, gender, marital_status ...
# ❌ Interrupted (Ctrl+C or error)

# Second execution (continues automatically)
pnpm start
# ✅ Detects checkpoint, continues from education_level onwards
# Doesn't reprocess state, gender, marital_status
```

### Clear Checkpoints (Restart Migration)

If you want to **restart** a migration from scratch (ignore checkpoints):

```sql
-- In PostgreSQL - Clear all checkpoints
DELETE FROM migration.migration_checkpoints;

-- Clear logged errors (optional)
DELETE FROM migration.migration_errors;

-- Clear execution history (optional)
DELETE FROM migration.migration_runs;
```

Then run again:

```bash
pnpm start  # Will start from scratch again
```

**⚠️ Warning:** Clearing checkpoints will make the system try to migrate all data again. Since it uses UPSERT, it won't create duplicates, but may be slower.

### Check Progress

```sql
-- View checkpoints
SELECT * FROM migration.migration_checkpoints ORDER BY entity;

-- View errors
SELECT * FROM migration.migration_errors ORDER BY created_at DESC;

-- View executions
SELECT * FROM migration.migration_runs ORDER BY created_at DESC;
```

## 📝 Logs

Logs are generated using Pino and include:

- Start and end of each migration
- Progress by batch
- Detailed errors
- Final statistics

## 🧪 Development

```bash
# Development mode (with hot reload)
pnpm dev:cli seed state

# Build project
pnpm build

# Check types
pnpm tsc --noEmit
```

## 📄 License

ISC

## 👥 Contributing

1. Create a branch for your feature
2. Implement the migrator following the existing pattern
3. Register the migrator in `src/entities/index.ts`
4. Add to migration order in `src/cli.ts`
5. Test locally
6. Open a Pull Request

## 📚 Additional Documentation

- [Detailed Mapping](./MIGRATION_MAPPING.md) - Field-by-field mapping
- [Migration Summary](./MIGRATION_SUMMARY.md) - Executive summary

## 🆘 Support

For issues or questions:

1. Check error logs
2. Consult the `migration.migration_errors` table
3. Check checkpoints in `migration.migration_checkpoints`
4. Open an issue in the repository

---

**Last updated**: January 2026
