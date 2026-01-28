# Migration Runner

Sistema de migração de dados do banco MariaDB (antigo) para PostgreSQL (novo), mantendo integridade referencial e convertendo IDs sequenciais para UUIDs.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Características](#características)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Uso](#uso)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Ordem de Migração](#ordem-de-migração)
- [Migradores Implementados](#migradores-implementados)
- [Funcionalidades Especiais](#funcionalidades-especiais)
- [Troubleshooting](#troubleshooting)

## 🎯 Visão Geral

Este projeto migra dados de um banco de dados MariaDB legado para um novo banco PostgreSQL, realizando as seguintes conversões principais:

- **IDs Sequenciais → UUIDs**: Converte IDs `int(11)` para UUIDs v7
- **Foreign Keys**: Resolve e converte todas as referências entre tabelas
- **Enums**: Mapeia valores de enums antigos para novos
- **Tipos de Dados**: Converte tipos MariaDB para PostgreSQL
- **Checkpointing**: Permite retomar migrações de onde parou
- **Sincronização**: Suporta sincronização incremental após migração inicial

## ✨ Características

- ✅ **22 migradores** implementados cobrindo todas as tabelas principais
- ✅ **Execução em ordem** respeitando dependências entre tabelas
- ✅ **Cache de foreign keys** para otimizar performance
- ✅ **Checkpointing** para retomar migrações interrompidas
- ✅ **Logging detalhado** com Pino
- ✅ **Tratamento de erros** robusto com registro de falhas
- ✅ **Batch processing** para gerenciar grandes volumes de dados
- ✅ **Public IDs sequenciais** de 6 dígitos para termos e documentos assinados

## 📦 Pré-requisitos

- Node.js 18+ ou superior
- pnpm 10+ (ou npm/yarn)
- Acesso ao banco MariaDB (antigo)
- Acesso ao banco PostgreSQL (novo)
- TypeScript 5+

## 🚀 Instalação

```bash
# Clone o repositório
git clone <repository-url>
cd migration-runner

# Instale as dependências
pnpm install

# Configure o arquivo .env (veja seção Configuração)
cp .env.example .env  # Se houver exemplo, ou crie manualmente

# Compile o projeto (apenas compila, não executa migrações)
pnpm build
```

### 🚀 Deploy no Servidor

Para executar as migrações no servidor após o build:

```bash
# Opção 1: Build + Seed separadamente
pnpm build
pnpm seed

# Opção 2: Deploy (recomendado - faz tudo em um comando)
pnpm deploy

# Opção 3: Com nix pack (usa script 'start')
pnpm build
pnpm start
```

## ⚙️ Configuração

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Banco MariaDB (antigo)
MARIADB_HOST=localhost
MARIADB_PORT=3306
MARIADB_USER=usuario
MARIADB_PASSWORD=senha
MARIADB_DATABASE=nome_do_banco

# Banco PostgreSQL (novo)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=usuario
POSTGRES_PASSWORD=senha
POSTGRES_DATABASE=nome_do_banco

# Configurações de migração
BATCH_SIZE=1000
```

### Variáveis de Ambiente

| Variável            | Descrição                          | Padrão      |
| ------------------- | ---------------------------------- | ----------- |
| `MARIADB_HOST`      | Host do banco MariaDB              | `localhost` |
| `MARIADB_PORT`      | Porta do banco MariaDB             | `3306`      |
| `MARIADB_USER`      | Usuário do banco MariaDB           | -           |
| `MARIADB_PASSWORD`  | Senha do banco MariaDB             | -           |
| `MARIADB_DATABASE`  | Nome do banco MariaDB              | -           |
| `POSTGRES_HOST`     | Host do banco PostgreSQL           | `localhost` |
| `POSTGRES_PORT`     | Porta do banco PostgreSQL          | `5432`      |
| `POSTGRES_USER`     | Usuário do banco PostgreSQL        | -           |
| `POSTGRES_PASSWORD` | Senha do banco PostgreSQL          | -           |
| `POSTGRES_DATABASE` | Nome do banco PostgreSQL           | -           |
| `BATCH_SIZE`        | Tamanho do lote para processamento | `1000`      |

## 📖 Uso

### ⚠️ Importante: Build vs Execução

- `pnpm build` - **Apenas compila** o TypeScript para JavaScript (não executa migrações)
- `pnpm start` - **Executa** seed de todas as migrações (requer build prévio, usado por nix pack)
- `pnpm seed` ou `pnpm sync` - **Executa** as migrações (requer build prévio)
- `pnpm deploy` - **Compila E executa** seed (recomendado para servidor)

### Executar Todas as Migrações (Seed)

Migra todos os dados do banco antigo para o novo:

```bash
# Opção 1: Build + Seed (recomendado para servidor)
pnpm build
pnpm seed

# Opção 2: Deploy (faz build + seed em um comando)
pnpm deploy

# Opção 3: Com TypeScript (desenvolvimento)
pnpm dev:cli seed --all

# Opção 4: Diretamente com tsx
tsx src/cli.ts seed --all
```

### Executar Todas as Migrações (Sync)

Sincroniza apenas dados novos ou modificados:

```bash
# Opção 1: Build + Sync (recomendado para servidor)
pnpm build
pnpm sync

# Opção 2: Deploy Sync (faz build + sync em um comando)
pnpm deploy:sync

# Opção 3: Com TypeScript (desenvolvimento)
pnpm dev:cli sync --all

# Opção 4: Diretamente com tsx
tsx src/cli.ts sync --all
```

### Executar Migração de uma Entidade Específica

```bash
# Seed de uma entidade específica
pnpm dev:cli seed state
pnpm dev:cli seed student
pnpm dev:cli seed company

# Sync de uma entidade específica
pnpm dev:cli sync student
pnpm dev:cli sync opportunity
```

### Comandos Disponíveis

| Comando         | Descrição                                                |
| --------------- | -------------------------------------------------------- |
| `seed <entity>` | Migra todos os dados de uma entidade específica          |
| `seed --all`    | Migra todos os dados de todas as entidades em ordem      |
| `sync <entity>` | Sincroniza dados novos/modificados de uma entidade       |
| `sync --all`    | Sincroniza dados novos/modificados de todas as entidades |

## 📁 Estrutura do Projeto

```
migration-runner/
├── src/
│   ├── cli.ts                    # CLI principal
│   ├── entities/                 # Migradores por entidade
│   │   ├── index.ts             # Registro de todos os migradores
│   │   ├── types.ts             # Tipos TypeScript
│   │   ├── state.migrator.ts    # Migrador de estados
│   │   ├── users.migrator.ts    # Migrador de usuários
│   │   ├── company.migrator.ts  # Migrador de empresas
│   │   └── ...                  # Outros migradores
│   ├── db/
│   │   ├── mariadb.ts           # Conexão MariaDB
│   │   └── postgres.ts          # Conexão PostgreSQL
│   ├── state/
│   │   ├── checkpoints.ts       # Gerenciamento de checkpoints
│   │   ├── errors.ts            # Registro de erros
│   │   ├── runs.ts              # Controle de execuções
│   │   └── schema.ts            # Schema do banco de migração
│   ├── env.ts                   # Configurações de ambiente
│   └── logger.ts                # Configuração de logging
├── .env                         # Variáveis de ambiente (criar)
├── package.json
├── tsconfig.json
└── README.md
```

## 🔄 Ordem de Migração

As migrações são executadas automaticamente na seguinte ordem, respeitando dependências:

### Fase 1: Tabelas de Referência (Sem Dependências)

1. `state` - Estados brasileiros
2. `gender` - Gêneros
3. `marital_status` - Estados civis
4. `education_level` - Níveis de escolaridade
5. `course` - Cursos
6. `semester` - Semestres
7. `shift` - Turnos
8. `educational_institution` - Instituições de ensino

### Fase 2: Usuários

9. `users` - Usuários do sistema

### Fase 3: Entidades Principais

10. `company` - Empresas
11. `institutions` - Instituições
12. `student` - Estudantes

### Fase 4: Representantes e Supervisores

13. `company_representative` - Representantes de empresas
14. `company_supervisor` - Supervisores de empresas
15. `institution_representative` - Representantes de instituições
16. `institution_supervisor` - Supervisores de instituições

### Fase 5: Solicitações

17. `intern_requests` - Solicitações de estagiários
18. `internship_agreement_requests` - Solicitações de termos de estágio

### Fase 6: Termos

19. `internship_commitment_term` - Termos de compromisso de estágio
20. `internship_termination_requests` - Solicitações de rescisão
21. `signed_internship_commitment_term` - Termos assinados

### Fase 7: Oportunidades

22. `opportunity` - Oportunidades de estágio

## 📊 Migradores Implementados

| #   | Entidade                            | Tabela Antiga                | Status | Observações                           |
| --- | ----------------------------------- | ---------------------------- | ------ | ------------------------------------- |
| 1   | `state`                             | `tb_estados`                 | ✅     | Conversão de IDs                      |
| 2   | `gender`                            | `tb_sexo`                    | ✅     | Mapeamento de enums                   |
| 3   | `marital_status`                    | `tb_estado_civil`            | ✅     | Conversão de IDs                      |
| 4   | `education_level`                   | `tb_escolaridade`            | ✅     | Conversão de IDs                      |
| 5   | `course`                            | `tb_confcurso`               | ✅     | Conversão de IDs                      |
| 6   | `semester`                          | `tb_semestre`                | ✅     | Conversão de IDs                      |
| 7   | `shift`                             | `tb_turno`                   | ✅     | Conversão de IDs                      |
| 8   | `educational_institution`           | `tb_confinstituicao`         | ✅     | Conversão de IDs                      |
| 9   | `users`                             | `tb_usuario`                 | ✅     | Conversão de IDs, hash de senhas      |
| 10  | `company`                           | `tb_empresa`                 | ✅     | Conversão de FKs, UUIDs               |
| 11  | `institutions`                      | `tb_instituicao`             | ✅     | Conversão de FKs, UUIDs               |
| 12  | `student`                           | `tb_estudante`               | ✅     | Múltiplas FKs, enums                  |
| 13  | `company_representative`            | `representante_empresas`     | ✅     | Conversão de UUIDs                    |
| 14  | `company_supervisor`                | `supervisor_empresas`        | ✅     | Conversão de UUIDs                    |
| 15  | `institution_representative`        | `representante_instituicaos` | ✅     | Conversão de UUIDs                    |
| 16  | `institution_supervisor`            | `supervisor_instituicaos`    | ✅     | Conversão de UUIDs                    |
| 17  | `intern_requests`                   | `solicitar_estagiarios`      | ✅     | Mapeamento de enums                   |
| 18  | `internship_agreement_requests`     | `solicitar_termos`           | ✅     | Busca por nomes                       |
| 19  | `internship_commitment_term`        | `tb_termo`                   | ✅     | Public ID sequencial                  |
| 20  | `internship_termination_requests`   | `solicitar_rescisao_termos`  | ✅     | Mapeamento de enums                   |
| 21  | `signed_internship_commitment_term` | `tce_docs`                   | ✅     | Public ID sequencial                  |
| 22  | `opportunity`                       | `vagas`                      | ✅     | Busca por nomes, conversão de valores |

## 🎨 Funcionalidades Especiais

### Public IDs Sequenciais

As tabelas `internship_commitment_term` e `signed_internship_commitment_term` geram automaticamente `public_id` sequenciais de 6 dígitos (ex: `000001`, `000123`).

### Cache de Foreign Keys

Todos os migradores implementam cache para evitar múltiplas queries ao resolver foreign keys, melhorando significativamente a performance.

### Checkpointing

O sistema mantém checkpoints para cada entidade, permitindo:

- Retomar migrações interrompidas
- Sincronização incremental baseada em `updated_at`
- Rastreamento de progresso

### Tratamento de Erros

- Erros são registrados na tabela `migration.migration_errors`
- Execução continua mesmo se uma entidade falhar
- Resumo detalhado ao final da execução

### Fallbacks Inteligentes

Alguns migradores implementam fallbacks quando dados obrigatórios estão ausentes:

- Se `semester_id` estiver vazio, usa o primeiro semestre disponível
- Se `gender_id` estiver vazio, usa o primeiro gênero disponível
- Se `supervisor_id` estiver vazio, usa o primeiro supervisor da empresa/instituição

## 🔧 Troubleshooting

### Erro: "Entity not found"

Verifique se o nome da entidade está correto:

```bash
# Listar entidades disponíveis
grep "export const.*Migrator" src/entities/*.ts
```

### Erro de Conexão com Banco

1. Verifique as variáveis de ambiente no `.env`
2. Teste a conexão manualmente:

```bash
# Teste MariaDB
mysql -h $MARIADB_HOST -u $MARIADB_USER -p$MARIADB_PASSWORD $MARIADB_DATABASE

# Teste PostgreSQL
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DATABASE
```

### Erro: "Foreign key not found"

Isso geralmente indica que uma entidade dependente não foi migrada ainda. Execute as migrações em ordem usando `--all`:

```bash
pnpm dev:cli seed --all
```

### Retomar Migração Interrompida

O sistema usa checkpoints automaticamente. Simplesmente execute novamente:

```bash
# Continuará de onde parou
pnpm dev:cli seed --all
```

### Limpar Checkpoints (Reiniciar Migração)

```sql
-- No PostgreSQL
DELETE FROM migration.migration_checkpoints;
DELETE FROM migration.migration_errors;
```

### Verificar Progresso

```sql
-- Ver checkpoints
SELECT * FROM migration.migration_checkpoints ORDER BY entity;

-- Ver erros
SELECT * FROM migration.migration_errors ORDER BY created_at DESC;

-- Ver execuções
SELECT * FROM migration.migration_runs ORDER BY created_at DESC;
```

## 📝 Logs

Os logs são gerados usando Pino e incluem:

- Início e fim de cada migração
- Progresso por batch
- Erros detalhados
- Estatísticas finais

## 🧪 Desenvolvimento

```bash
# Modo desenvolvimento (com hot reload)
pnpm dev:cli seed state

# Build do projeto
pnpm build

# Verificar tipos
pnpm tsc --noEmit
```

## 📄 Licença

ISC

## 👥 Contribuindo

1. Crie uma branch para sua feature
2. Implemente o migrador seguindo o padrão existente
3. Registre o migrador em `src/entities/index.ts`
4. Adicione à ordem de migração em `src/cli.ts`
5. Teste localmente
6. Abra um Pull Request

## 📚 Documentação Adicional

- [Mapeamento Detalhado](./MIGRATION_MAPPING.md) - Mapeamento campo a campo
- [Resumo da Migração](./MIGRATION_SUMMARY.md) - Resumo executivo

## 🆘 Suporte

Para problemas ou dúvidas:

1. Verifique os logs de erro
2. Consulte a tabela `migration.migration_errors`
3. Verifique os checkpoints em `migration.migration_checkpoints`
4. Abra uma issue no repositório

---

**Última atualização**: Janeiro 2026
