# Migration Summary - Tables and Relationships

## 📊 Statistics

- **Total tables in old database**: ~35 tables
- **Total tables in new database**: 24 tables
- **Tables to be migrated**: 23 tables
- **Tables without correspondence**: 11 tables

---

## 🔄 Quick Table Mapping

| #   | New Table                           | Old Table                    | Status     | Notes                                                                                  |
| --- | ----------------------------------- | ---------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| 1   | `users`                             | `tb_usuario`                 | ✅ Migrate | Convert `co_seq_usuario` to UUID                                                       |
| 2   | `company`                           | `tb_empresa`                 | ✅ Migrate | Convert `user_id` (int) to UUID                                                        |
| 3   | `institutions`                      | `tb_instituicao`             | ✅ Migrate | Convert `user_id` (int) to UUID                                                        |
| 4   | `student`                           | `tb_estudante`               | ✅ Migrate | Generate new UUID, convert all FKs                                                     |
| 5   | `state`                             | `tb_estados`                 | ✅ Migrate | Generate new UUID                                                                      |
| 6   | `course`                            | `tb_confcurso`               | ✅ Migrate | Generate new UUID                                                                      |
| 7   | `semester`                          | `tb_semestre`                | ✅ Migrate | Generate new UUID                                                                      |
| 8   | `gender`                            | `tb_sexo`                    | ✅ Migrate | Generate new UUID                                                                      |
| 9   | `marital_status`                    | `tb_estado_civil`            | ✅ Migrate | Generate new UUID                                                                      |
| 10  | `education_level`                   | `tb_escolaridade`            | ✅ Migrate | Generate new UUID                                                                      |
| 11  | `educational_institution`           | `tb_confinstituicao`         | ✅ Migrate | Generate new UUID                                                                      |
| 12  | `shift`                             | `tb_turno`                   | ✅ Migrate | Generate new UUID                                                                      |
| 13  | `company_representative`            | `representante_empresas`     | ✅ Migrate | Generate new UUID                                                                      |
| 14  | `company_supervisor`                | `supervisor_empresas`        | ✅ Migrate | Generate new UUID                                                                      |
| 15  | `institution_representative`        | `representante_instituicaos` | ✅ Migrate | Generate new UUID                                                                      |
| 16  | `institution_supervisor`            | `supervisor_instituicaos`    | ✅ Migrate | Generate new UUID                                                                      |
| 17  | `intern_requests`                   | `solicitar_estagiarios`      | ✅ Migrate | Generate new UUID, map enums                                                           |
| 18  | `internship_agreement_requests`     | `solicitar_termos`           | ✅ Migrate | Generate new UUID, find FKs by name                                                    |
| 19  | `internship_commitment_term`        | `tb_termo` + `termos`        | ✅ Migrate | Use `tb_termo` as main                                                                 |
| 20  | `internship_termination_requests`   | `solicitar_rescisao_termos`  | ✅ Migrate | Generate new UUID, map enums                                                           |
| 21  | `opportunity`                       | `tb_vaga` + `vagas`          | ✅ Migrate | `tb_vaga` was old, `vagas` was created by extracting data from it. Use `vagas` as main |
| 22  | `signed_internship_commitment_term` | `tce_docs`                   | ✅ Migrate | Generate new UUID, convert FKs                                                         |
| 23  | `refresh_tokens`                    | -                            | ⚠️ New     | No old data                                                                            |

---

## ❌ Tables Not Migrated (No Correspondence)

| Old Table                   | Reason                                                                |
| --------------------------- | --------------------------------------------------------------------- |
| `prorrogacao_de_contrato`   | Doesn't exist in new database                                         |
| `recibo_pagamento_bolsa`    | Doesn't exist in new database                                         |
| `recibo_recesso_remunerado` | Doesn't exist in new database                                         |
| `tb_categoria`              | Doesn't exist in new database                                         |
| `tb_cursoinfnew`            | Doesn't exist in new database                                         |
| `tb_dados_financeiros`      | Doesn't exist in new database                                         |
| `tb_depoimento`             | Doesn't exist in new database                                         |
| `tb_experprofis`            | Doesn't exist in new database                                         |
| `tb_noticia`                | Doesn't exist in new database                                         |
| `tb_representante`          | Replaced by `company_representative` and `institution_representative` |
| `tb_supervisor`             | Replaced by `company_supervisor` and `institution_supervisor`         |
| `termo_realizacao_estagios` | Doesn't exist in new database                                         |

---

## 🔑 Main Required Conversions

### 1. Sequential IDs → UUIDs

- `co_seq_*` (int) → `id` (text/UUID)
- Keep old ID in `old_id`

### 2. Foreign Keys (int → UUID)

- `user_id` (int) → UUID from `users`
- `estado_id` (int) → UUID from `state`
- `curso_id` (int) → UUID from `course`
- `semestre_id` (int) → UUID from `semester`
- `genero` (enum) → UUID from `gender`
- `estado_civil_id` (int) → UUID from `marital_status`
- `nivel_escolaridade_id` (int) → UUID from `education_level`
- `instituicao_id` (int) → UUID from `educational_institution`
- `turno_id` (int) → UUID from `shift`
- `estudante_id` (int) → UUID from `student`
- `empresa_id` (int) → UUID from `company` (when it's int)
- `instituicao_id` (int) → UUID from `institutions` (when it's int)

### 3. Enum Mapping

#### Role (users)

```
'student' → 'student'
'company' → 'company'
'institution' → 'institution'
'admin' → 'admin'
'undefined' → ? (decide treatment)
```

#### Status (intern_requests)

```
'pendente' → 'open'
'concluido' → 'filled'
```

#### Status (internship_agreement_requests)

```
'pendente' → 'pending'
'concluido' → 'accepted'
```

#### Status (internship_termination_requests)

```
'pendente' → 'pending'
'concluido' → 'approved'
```

#### Status (opportunity)

```
'Visivel' → 'published'
'Aberta' → 'published'
'Fechada' → 'closed'
'Cancelada' → 'cancelled'
```

#### Language Level

```
'nenhum' → 'beginner'
'básico' → 'beginner'
'intermediário' → 'intermediate'
'avançado' → 'advanced'
```

#### Payment Frequency

```
'Hora' → 'hourly'
'Diario' → 'daily'
'Semanalmente' → 'weekly'
'Mensalmente' → 'monthly'
```

#### Termination Reason

```
'TerminoAutomatico' → 'end_of_term'
'IniciativaEstagiario' → 'student_initiative'
'IniciativaEmpresa' → 'company_initiative'
'NaoAssumiuVaga' → 'no_show_did_not_start'
'ConclusaoAbandonoTrancamento' → 'course_completion_or_dropout'
'EfetivadoEmpresa' → 'hired_by_company'
'DescumprimentoContratual' → 'breach_of_contract'
'AusenciaInjustificada' → 'excessive_absences'
'Outros' → 'other'
```

---

## 📋 Recommended Migration Order

### Phase 1: Reference Tables (No Dependencies)

1. `state`
2. `gender`
3. `marital_status`
4. `education_level`
5. `course`
6. `semester`
7. `shift`
8. `educational_institution`

### Phase 2: Users

9. `users`

### Phase 3: Main Entities

10. `company`
11. `institutions`
12. `student`

### Phase 4: Representatives and Supervisors

13. `company_representative`
14. `company_supervisor`
15. `institution_representative`
16. `institution_supervisor`

### Phase 5: Requests

17. `intern_requests`
18. `internship_agreement_requests`

### Phase 6: Terms

19. `internship_commitment_term`
20. `internship_termination_requests`
21. `signed_internship_commitment_term`

### Phase 7: Opportunities

22. `opportunity`

### Phase 8: Authentication

23. `refresh_tokens` (new, no data)

---

## ⚠️ Points of Attention

1. **user_id Conversion**: Many tables have `user_id` as `int(11)`, need to find the corresponding UUID in `users.old_id`

2. **Search by Name**: Some FKs in old database are text (name), need to be searched:
   - `solicitar_termos.curso` → search in `course.name`
   - `solicitar_termos.semestre` → search in `semester.name`
   - `vagas.curso` → search in `course.name`
   - `vagas.semestre` → search in `semester.name`
   - `vagas.sexo` → search in `gender.name`
   - `vagas.supervisor` → search in `company_supervisor.full_name`

3. **Required Calculations**:
   - `internship_agreement_requests.proposed_end_date` = `data_inicio_estagio` + `vigencia_estagio` months

4. **Optional Fields**: Some fields don't exist in old database and can be NULL:
   - `company.whatsapp`
   - `institutions.whatsapp`
   - `intern_requests.other_benefits`
   - `internship_agreement_requests.notes`
   - `internship_commitment_term.public_id`
   - `opportunity.application_instructions`
   - `signed_internship_commitment_term.public_id`

5. **Data Formatting**:
   - CPF: Remove formatting (dots and dashes)
   - ZIP Code: Adjust format
   - Phone: Standardize format
   - Decimal → Text: Convert `decimal(10,2)` to `text` in some fields

---

## 📝 Migration Checklist

- [ ] Create mapping of old IDs → new UUIDs for each table
- [ ] Migrate reference tables (Phase 1)
- [ ] Migrate users (Phase 2)
- [ ] Migrate main entities (Phase 3)
- [ ] Migrate representatives and supervisors (Phase 4)
- [ ] Migrate requests (Phase 5)
- [ ] Migrate terms (Phase 6)
- [ ] Migrate opportunities (Phase 7)
- [ ] Migrate authentication tokens (Phase 8)
- [ ] Validate referential integrity
- [ ] Validate record counts
- [ ] Test main queries
