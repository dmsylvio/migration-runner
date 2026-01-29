# Database Migration Mapping

## Summary of Tables That Need to be Migrated

### Main Tables (Business Data)

1. **users** ← `tb_usuario`
2. **company** ← `tb_empresa`
3. **institutions** ← `tb_instituicao`
4. **student** ← `tb_estudante`
5. **state** ← `tb_estados`
6. **course** ← `tb_confcurso`
7. **semester** ← `tb_semestre`
8. **gender** ← `tb_sexo`
9. **marital_status** ← `tb_estado_civil`
10. **education_level** ← `tb_escolaridade`
11. **educational_institution** ← `tb_confinstituicao`
12. **shift** ← `tb_turno`
13. **company_representative** ← `representante_empresas`
14. **company_supervisor** ← `supervisor_empresas`
15. **institution_representative** ← `representante_instituicaos`
16. **institution_supervisor** ← `supervisor_instituicaos`
17. **intern_requests** ← `solicitar_estagiarios`
18. **internship_agreement_requests** ← `solicitar_termos`
19. **internship_commitment_term** ← `tb_termo` + `termos`
20. **internship_termination_requests** ← `solicitar_rescisao_termos`
21. **opportunity** ← `tb_vaga` (old table) + `vagas` (new table created by extracting data from `tb_vaga`)
22. **signed_internship_commitment_term** ← `tce_docs` (partial)
23. **refresh_tokens** ← (new - does not exist in old database)

### Tables Not Migrated (No Direct Correspondence)

- `prorrogacao_de_contrato` - No equivalent table in new database
- `recibo_pagamento_bolsa` - No equivalent table in new database
- `recibo_recesso_remunerado` - No equivalent table in new database
- `tb_categoria` - No equivalent table in new database
- `tb_cursoinfnew` - No equivalent table in new database
- `tb_dados_financeiros` - No equivalent table in new database
- `tb_depoimento` - No equivalent table in new database
- `tb_experprofis` - No equivalent table in new database
- `tb_noticia` - No equivalent table in new database
- `tb_representante` - Replaced by `company_representative` and `institution_representative`
- `tb_supervisor` - Replaced by `company_supervisor` and `institution_supervisor`
- `termo_realizacao_estagios` - No equivalent table in new database

---

## Detailed Field Mapping

### 1. users ← tb_usuario

| New Field    | New Type  | Old Field                     | Old Type     | Notes                                                                                                      |
| ------------ | --------- | ----------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| `id`         | text      | `id`                          | char(36)     | UUID maintained                                                                                            |
| `email`      | text      | `email`                       | varchar(255) |                                                                                                            |
| `name`       | text      | `name`                        | varchar(255) |                                                                                                            |
| `avatar`     | text      | `image`                       | varchar(255) |                                                                                                            |
| `password`   | text      | `password_hash` or `ds_senha` | varchar(255) | Prioritize `password_hash`, use `ds_senha` if it doesn't exist                                             |
| `role`       | enum      | `role`                        | enum         | Map: 'student'→'student', 'company'→'company', 'institution'→'institution', 'admin'→'admin', 'undefined'→? |
| `created_at` | timestamp | `created_at`                  | datetime     |                                                                                                            |
| `updated_at` | timestamp | `updated_at`                  | datetime     |                                                                                                            |
| `old_id`     | text      | `co_seq_usuario`              | int(11)      | Old sequential ID                                                                                          |

### 2. company ← tb_empresa

| New Field            | New Type    | Old Field                     | Old Type      | Notes                                           |
| -------------------- | ----------- | ----------------------------- | ------------- | ----------------------------------------------- |
| `id`                 | text        | `id`                          | char(36)      | UUID maintained                                 |
| `old_id`             | text        | `co_seq_empresa`              | int(10)       |                                                 |
| `user_id`            | text        | `user_id`                     | int(11)       | **ATTENTION**: Need to convert int to user UUID |
| `notes`              | text        | `ds_obs_futura_emp`           | mediumtext    |                                                 |
| `legal_name`         | text        | `ds_razao_social`             | varchar(191)  |                                                 |
| `trade_name`         | text        | `ds_nome_fantasia`            | varchar(191)  |                                                 |
| `activities`         | text        | `ds_atividade`                | varchar(100)  |                                                 |
| `cnpj_number`        | varchar(18) | `nu_cnpj`                     | varchar(18)   |                                                 |
| `state_registration` | text        | `ds_insc_est`                 | varchar(100)  |                                                 |
| `address`            | text        | `ds_endereco`                 | varchar(191)  |                                                 |
| `city`               | text        | `ds_cidade`                   | varchar(100)  |                                                 |
| `state_id`           | text        | `ds_uf`                       | varchar(2)    | **ATTENTION**: Need to convert to state ID      |
| `zip_code`           | varchar(9)  | `nu_cep`                      | varchar(10)   |                                                 |
| `phone`              | varchar(20) | `nu_telefone`                 | varchar(16)   |                                                 |
| `whatsapp`           | varchar(20) | -                             | -             | Doesn't exist in old, can be NULL               |
| `created_at`         | timestamp   | `dt_cadastro` or `created_at` | date/datetime | Prioritize `created_at`                         |
| `updated_at`         | timestamp   | `updated_at`                  | datetime      |                                                 |

### 3. institutions ← tb_instituicao

| New Field            | New Type    | Old Field                     | Old Type     | Notes                                           |
| -------------------- | ----------- | ----------------------------- | ------------ | ----------------------------------------------- |
| `id`                 | text        | `id`                          | char(36)     | UUID maintained                                 |
| `old_id`             | text        | `co_seq_instituicao`          | int(10)      |                                                 |
| `user_id`            | text        | `user_id`                     | int(11)      | **ATTENTION**: Need to convert int to user UUID |
| `notes`              | text        | `ds_obs_futura_inst`          | text         |                                                 |
| `legal_name`         | text        | `ds_razao_social`             | varchar(100) |                                                 |
| `trade_name`         | text        | `ds_nome_fantasia`            | varchar(100) |                                                 |
| `activities`         | text        | `ds_atividade`                | varchar(100) |                                                 |
| `cnpj_number`        | varchar(18) | `nu_cnpj`                     | varchar(18)  |                                                 |
| `state_registration` | text        | `ds_insc_est`                 | varchar(100) |                                                 |
| `address`            | text        | `ds_endereco`                 | varchar(100) |                                                 |
| `city`               | text        | `ds_cidade`                   | varchar(100) |                                                 |
| `state_id`           | text        | `ds_uf`                       | char(2)      | **ATTENTION**: Need to convert to state ID      |
| `zip_code`           | varchar(9)  | `nu_cep`                      | varchar(10)  |                                                 |
| `phone`              | varchar(20) | `nu_telefone`                 | varchar(16)  |                                                 |
| `whatsapp`           | varchar(20) | -                             | -            | Doesn't exist in old, can be NULL               |
| `created_at`         | timestamp   | `dt_cadastro` or `created_at` | datetime     | Prioritize `created_at`                         |
| `updated_at`         | timestamp   | `updated_at`                  | datetime     |                                                 |

### 4. student ← tb_estudante

| New Field                    | New Type    | Old Field               | Old Type     | Notes                                                                                                |
| ---------------------------- | ----------- | ----------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| `id`                         | text        | -                       | -            | **GENERATE NEW UUID**                                                                                |
| `old_id`                     | text        | `id`                    | int(11)      |                                                                                                      |
| `user_id`                    | text        | `usuario_id`            | int(11)      | **ATTENTION**: Need to convert int to user UUID                                                      |
| `notes`                      | text        | `notas`                 | text         |                                                                                                      |
| `full_name`                  | text        | `nome_completo`         | varchar(191) |                                                                                                      |
| `birth_date`                 | date        | `data_nascimento`       | date         |                                                                                                      |
| `cpf_number`                 | varchar(14) | `cpf`                   | varchar(14)  |                                                                                                      |
| `rg_number`                  | varchar(20) | `rg`                    | varchar(191) |                                                                                                      |
| `issue_agency`               | text        | `orgao_expedidor`       | varchar(191) |                                                                                                      |
| `has_driver_license`         | boolean     | `possui_cnh`            | tinyint(1)   |                                                                                                      |
| `gender_id`                  | text        | `genero`                | enum         | **ATTENTION**: Need to map enum to gender ID                                                         |
| `marital_status_id`          | text        | `estado_civil_id`       | int(11)      | **ATTENTION**: Need to convert int to marital_status ID                                              |
| `has_disability`             | boolean     | `possui_deficiencia`    | tinyint(1)   |                                                                                                      |
| `disability_type`            | text        | `tipo_deficiencia`      | varchar(191) |                                                                                                      |
| `father_name`                | text        | `nome_pai`              | varchar(191) |                                                                                                      |
| `mother_name`                | text        | `nome_mae`              | varchar(191) |                                                                                                      |
| `address`                    | text        | `endereco`              | varchar(191) |                                                                                                      |
| `city`                       | text        | `cidade`                | varchar(100) |                                                                                                      |
| `state_id`                   | text        | `estado_id`             | int(11)      | **ATTENTION**: Need to convert int to state ID                                                       |
| `zip_code`                   | varchar(9)  | `cep`                   | varchar(9)   |                                                                                                      |
| `phone`                      | varchar(20) | `telefone`              | varchar(20)  |                                                                                                      |
| `whatsapp`                   | varchar(20) | `whatsapp`              | varchar(20)  |                                                                                                      |
| `education_level_id`         | text        | `nivel_escolaridade_id` | int(11)      | **ATTENTION**: Need to convert int to education_level ID                                             |
| `course_id`                  | text        | `curso_id`              | int(11)      | **ATTENTION**: Need to convert int to course ID                                                      |
| `educational_institution_id` | text        | `instituicao_id`        | int(11)      | **ATTENTION**: Need to convert int to educational_institution ID                                     |
| `has_oab_license`            | boolean     | `possui_oab`            | int(1)       |                                                                                                      |
| `enrollment`                 | text        | `matricula`             | varchar(100) |                                                                                                      |
| `semester_id`                | text        | `semestre_id`           | int(11)      | **ATTENTION**: Need to convert int to semester ID                                                    |
| `shift_id`                   | text        | `turno_id`              | int(11)      | **ATTENTION**: Need to convert int to shift ID                                                       |
| `available_shift_id`         | text        | `horario_disponivel`    | enum         | **ATTENTION**: Need to map enum to shift ID                                                          |
| `english_level`              | enum        | `ingles`                | enum         | Map: 'nenhum'→'beginner', 'básico'→'beginner', 'intermediário'→'intermediate', 'avançado'→'advanced' |
| `spanish_level`              | enum        | `espanhol`              | enum         | Map: 'nenhum'→'beginner', 'básico'→'beginner', 'intermediário'→'intermediate', 'avançado'→'advanced' |
| `french_level`               | enum        | `frances`               | enum         | Map: 'nenhum'→'beginner', 'básico'→'beginner', 'intermediário'→'intermediate', 'avançado'→'advanced' |
| `other_languages`            | text        | `outro_idioma`          | varchar(255) |                                                                                                      |
| `improvement_courses`        | text        | `ImprovementCourse`     | longtext     |                                                                                                      |
| `it_courses`                 | text        | `ITCourse`              | longtext     |                                                                                                      |
| `created_at`                 | timestamp   | `createdAt`             | datetime     |                                                                                                      |
| `updated_at`                 | timestamp   | `updatedAt`             | datetime     |                                                                                                      |

### 5. state ← tb_estados

| New Field    | New Type   | Old Field | Old Type    | Notes                 |
| ------------ | ---------- | --------- | ----------- | --------------------- |
| `id`         | text       | -         | -           | **GENERATE NEW UUID** |
| `name`       | text       | `estado`  | varchar(40) |                       |
| `acronym`    | varchar(2) | `uf`      | varchar(2)  |                       |
| `created_at` | timestamp  | -         | -           | Use current timestamp |
| `updated_at` | timestamp  | -         | -           | Use current timestamp |
| `old_id`     | text       | `id`      | int(11)     |                       |

### 6. course ← tb_confcurso

| New Field    | New Type  | Old Field          | Old Type     | Notes                                 |
| ------------ | --------- | ------------------ | ------------ | ------------------------------------- |
| `id`         | text      | -                  | -            | **GENERATE NEW UUID**                 |
| `name`       | text      | `no_curso`         | varchar(255) |                                       |
| `created_at` | timestamp | `dt_publicado`     | datetime     |                                       |
| `updated_at` | timestamp | -                  | -            | Use `created_at` or current timestamp |
| `old_id`     | text      | `co_seq_confcurso` | int(11)      |                                       |

### 7. semester ← tb_semestre

| New Field    | New Type  | Old Field  | Old Type    | Notes                 |
| ------------ | --------- | ---------- | ----------- | --------------------- |
| `id`         | text      | -          | -           | **GENERATE NEW UUID** |
| `name`       | text      | `semestre` | varchar(30) |                       |
| `created_at` | timestamp | -          | -           | Use current timestamp |
| `updated_at` | timestamp | -          | -           | Use current timestamp |
| `old_id`     | text      | `id`       | int(11)     |                       |

### 8. gender ← tb_sexo

| New Field    | New Type  | Old Field    | Old Type     | Notes                                 |
| ------------ | --------- | ------------ | ------------ | ------------------------------------- |
| `id`         | text      | -            | -            | **GENERATE NEW UUID**                 |
| `name`       | text      | `sexo`       | varchar(255) |                                       |
| `created_at` | timestamp | `created_at` | datetime     |                                       |
| `updated_at` | timestamp | -            | -            | Use `created_at` or current timestamp |
| `old_id`     | text      | `id`         | int(11)      |                                       |

### 9. marital_status ← tb_estado_civil

| New Field    | New Type  | Old Field      | Old Type     | Notes                                 |
| ------------ | --------- | -------------- | ------------ | ------------------------------------- |
| `id`         | text      | -              | -            | **GENERATE NEW UUID**                 |
| `name`       | text      | `estado_civil` | varchar(255) |                                       |
| `created_at` | timestamp | `created_at`   | datetime     |                                       |
| `updated_at` | timestamp | -              | -            | Use `created_at` or current timestamp |
| `old_id`     | text      | `id`           | int(11)      |                                       |

### 10. education_level ← tb_escolaridade

| New Field    | New Type  | Old Field | Old Type    | Notes                 |
| ------------ | --------- | --------- | ----------- | --------------------- |
| `id`         | text      | -         | -           | **GENERATE NEW UUID** |
| `name`       | text      | `nivel`   | varchar(30) |                       |
| `created_at` | timestamp | -         | -           | Use current timestamp |
| `updated_at` | timestamp | -         | -           | Use current timestamp |
| `old_id`     | text      | `id`      | int(11)     |                       |

### 11. educational_institution ← tb_confinstituicao

| New Field    | New Type  | Old Field                | Old Type | Notes                                 |
| ------------ | --------- | ------------------------ | -------- | ------------------------------------- |
| `id`         | text      | -                        | -        | **GENERATE NEW UUID**                 |
| `name`       | text      | `no_instituicao`         | text     |                                       |
| `created_at` | timestamp | `dt_publicado`           | date     | Convert date to timestamp             |
| `updated_at` | timestamp | -                        | -        | Use `created_at` or current timestamp |
| `old_id`     | text      | `co_seq_confinstituicao` | int(10)  |                                       |

### 12. shift ← tb_turno

| New Field    | New Type  | Old Field    | Old Type     | Notes                                 |
| ------------ | --------- | ------------ | ------------ | ------------------------------------- |
| `id`         | text      | -            | -            | **GENERATE NEW UUID**                 |
| `name`       | text      | `turno`      | varchar(255) |                                       |
| `created_at` | timestamp | `created_at` | timestamp    |                                       |
| `updated_at` | timestamp | -            | -            | Use `created_at` or current timestamp |
| `old_id`     | text      | `id`         | int(11)      |                                       |

### 13. company_representative ← representante_empresas

| New Field           | New Type    | Old Field      | Old Type     | Notes                 |
| ------------------- | ----------- | -------------- | ------------ | --------------------- |
| `id`                | text        | -              | -            | **GENERATE NEW UUID** |
| `old_id`            | text        | `id`           | int(11)      |                       |
| `company_id`        | text        | `empresa_id`   | char(36)     | UUID maintained       |
| `full_name`         | text        | `nomeCompleto` | varchar(255) |                       |
| `cpf_number`        | varchar(11) | `cpf`          | varchar(14)  | Remove formatting     |
| `rg_number`         | varchar(20) | `rg`           | varchar(40)  |                       |
| `issuing_authority` | text        | `orgaoEmissor` | varchar(60)  |                       |
| `phone`             | varchar(20) | `telefone`     | varchar(15)  |                       |
| `whatsapp`          | varchar(20) | `celular`      | varchar(15)  |                       |
| `position`          | text        | `cargo`        | varchar(60)  |                       |
| `created_at`        | timestamp   | `created_at`   | datetime     |                       |
| `updated_at`        | timestamp   | `updated_at`   | datetime     |                       |

### 14. company_supervisor ← supervisor_empresas

| New Field           | New Type    | Old Field      | Old Type     | Notes                 |
| ------------------- | ----------- | -------------- | ------------ | --------------------- |
| `id`                | text        | -              | -            | **GENERATE NEW UUID** |
| `old_id`            | text        | `id`           | int(11)      |                       |
| `company_id`        | text        | `empresa_id`   | char(36)     | UUID maintained       |
| `full_name`         | text        | `nomeCompleto` | varchar(255) |                       |
| `cpf_number`        | varchar(11) | `cpf`          | varchar(14)  | Remove formatting     |
| `rg_number`         | varchar(20) | `rg`           | varchar(40)  |                       |
| `issuing_authority` | text        | `orgaoEmissor` | varchar(60)  |                       |
| `phone`             | varchar(20) | `telefone`     | varchar(15)  |                       |
| `whatsapp`          | varchar(20) | `celular`      | varchar(15)  |                       |
| `position`          | text        | `cargo`        | varchar(60)  |                       |
| `created_at`        | timestamp   | `created_at`   | datetime     |                       |
| `updated_at`        | timestamp   | `updated_at`   | datetime     |                       |

### 15. institution_representative ← representante_instituicaos

| New Field           | New Type    | Old Field        | Old Type     | Notes                 |
| ------------------- | ----------- | ---------------- | ------------ | --------------------- |
| `id`                | text        | -                | -            | **GENERATE NEW UUID** |
| `old_id`            | text        | `id`             | int(11)      |                       |
| `institution_id`    | text        | `instituicao_id` | char(36)     | UUID maintained       |
| `full_name`         | text        | `nomeCompleto`   | varchar(255) |                       |
| `cpf_number`        | varchar(11) | `cpf`            | varchar(14)  | Remove formatting     |
| `rg_number`         | varchar(20) | `rg`             | varchar(40)  |                       |
| `issuing_authority` | text        | `orgaoEmissor`   | varchar(60)  |                       |
| `phone`             | varchar(20) | `telefone`       | varchar(15)  |                       |
| `whatsapp`          | varchar(20) | `celular`        | varchar(15)  |                       |
| `position`          | text        | `cargo`          | varchar(60)  |                       |
| `created_at`        | timestamp   | `created_at`     | datetime     |                       |
| `updated_at`        | timestamp   | `updated_at`     | datetime     |                       |

### 16. institution_supervisor ← supervisor_instituicaos

| New Field           | New Type    | Old Field        | Old Type     | Notes                 |
| ------------------- | ----------- | ---------------- | ------------ | --------------------- |
| `id`                | text        | -                | -            | **GENERATE NEW UUID** |
| `old_id`            | text        | `id`             | int(11)      |                       |
| `institution_id`    | text        | `instituicao_id` | char(36)     | UUID maintained       |
| `full_name`         | text        | `nomeCompleto`   | varchar(255) |                       |
| `cpf_number`        | varchar(11) | `cpf`            | varchar(14)  | Remove formatting     |
| `rg_number`         | varchar(20) | `rg`             | varchar(40)  |                       |
| `issuing_authority` | text        | `orgaoEmissor`   | varchar(60)  |                       |
| `phone`             | varchar(20) | `telefone`       | varchar(15)  |                       |
| `whatsapp`          | varchar(20) | `celular`        | varchar(15)  |                       |
| `position`          | text        | `cargo`          | varchar(60)  |                       |
| `created_at`        | timestamp   | `created_at`     | datetime     |                       |
| `updated_at`        | timestamp   | `updated_at`     | datetime     |                       |

### 17. intern_requests ← solicitar_estagiarios

| New Field                         | New Type    | Old Field                          | Old Type     | Notes                                               |
| --------------------------------- | ----------- | ---------------------------------- | ------------ | --------------------------------------------------- |
| `id`                              | text        | -                                  | -            | **GENERATE NEW UUID**                               |
| `old_id`                          | text        | `id`                               | uuid         | UUID maintained as old_id                           |
| `company_id`                      | text        | `empresa_id`                       | char(36)     | UUID maintained                                     |
| `city`                            | text        | `cidade`                           | varchar(191) |                                                     |
| `phone`                           | varchar(20) | `telefone_empresa`                 | varchar(16)  |                                                     |
| `email`                           | text        | `email`                            | varchar(191) |                                                     |
| `interviewer_name`                | text        | `responsavel`                      | varchar(191) |                                                     |
| `interview_availability`          | text        | `hora_entrevista`                  | varchar(191) | Default: 'To be scheduled via email/phone/whatssap' |
| `course_id`                       | text        | `curso_id`                         | int(11)      | **ATTENTION**: Convert int to course ID             |
| `semester_id`                     | text        | `semestre_id`                      | int(11)      | **ATTENTION**: Convert int to semester ID           |
| `number_of_open_positions`        | integer     | `numero_vagas`                     | int(11)      | Default: 1                                          |
| `preferred_gender_id`             | text        | `genero`                           | enum         | **ATTENTION**: Map enum to gender ID                |
| `internship_schedule`             | text        | `horario_estagio`                  | varchar(191) |                                                     |
| `stipend_amount`                  | text        | `valor_bolsa_auxilio`              | varchar(191) |                                                     |
| `transportation_allowance_amount` | text        | `valor_vale_transporte`            | varchar(191) |                                                     |
| `meal_allowance_amount`           | text        | `valor_vale_alimentacao`           | varchar(191) |                                                     |
| `other_benefits`                  | text        | -                                  | -            | Doesn't exist in old, can be NULL                   |
| `required_skills`                 | text        | `conhecimentos_exigidos`           | text         |                                                     |
| `activities_description`          | text        | `atividades_serem_realizadas`      | text         |                                                     |
| `status`                          | enum        | `status_solicitacao`               | enum         | Map: 'pendente'→'open', 'concluido'→'filled'        |
| `created_at`                      | timestamp   | `data_solicitacao` or `created_at` | datetime     | Prioritize `created_at`                             |
| `updated_at`                      | timestamp   | `updated_at`                       | datetime     |                                                     |

### 18. internship_agreement_requests ← solicitar_termos

| New Field                         | New Type    | Old Field               | Old Type      | Notes                                                     |
| --------------------------------- | ----------- | ----------------------- | ------------- | --------------------------------------------------------- |
| `id`                              | text        | -                       | -             | **GENERATE NEW UUID**                                     |
| `old_id`                          | text        | `id`                    | uuid          | UUID maintained as old_id                                 |
| `company_id`                      | text        | `empresa_id`            | varchar(36)   | UUID maintained                                           |
| `company_representative_id`       | text        | `representante_empresa` | varchar(191)  | **ATTENTION**: Need to find company_representative ID     |
| `company_supervisor_id`           | text        | `supervisor_empresa`    | varchar(191)  | **ATTENTION**: Need to find company_supervisor ID         |
| `company_phone`                   | varchar(20) | `telefone_empresa`      | varchar(16)   |                                                           |
| `company_email`                   | text        | `email_empresa`         | varchar(191)  |                                                           |
| `supervisor_email`                | text        | `email_supervisor`      | varchar(191)  |                                                           |
| `council_number`                  | text        | `numero_conselho`       | varchar(191)  |                                                           |
| `student_name`                    | text        | `nome_estudante`        | varchar(191)  |                                                           |
| `student_phone`                   | varchar(20) | `telefone_estudante`    | varchar(16)   |                                                           |
| `course_id`                       | text        | `curso`                 | varchar(191)  | **ATTENTION**: Need to find course ID by name             |
| `semester_id`                     | text        | `semestre`              | varchar(191)  | **ATTENTION**: Need to find semester ID by name           |
| `proposed_start_date`             | date        | `data_inicio_estagio`   | date          |                                                           |
| `proposed_end_date`               | date        | -                       | -             | **ATTENTION**: Calculate from `vigencia_estagio` (months) |
| `weekly_schedule`                 | text        | `horario_estagio`       | varchar(191)  |                                                           |
| `stipend_amount`                  | text        | `valor_bolsa_auxilio`   | decimal(10,2) | Convert decimal to text                                   |
| `transportation_allowance_amount` | text        | `valor_vale_transporte` | decimal(10,2) | Convert decimal to text                                   |
| `other_benefits`                  | text        | `outros_beneficios`     | text          |                                                           |
| `activities_description`          | text        | `atividades_realizadas` | text          |                                                           |
| `request_date`                    | date        | `data_solicitacao`      | datetime      | Convert datetime to date                                  |
| `status`                          | enum        | `status_solicitacao`    | enum          | Map: 'pendente'→'pending', 'concluido'→'accepted'         |
| `notes`                           | text        | -                       | -             | Doesn't exist in old, can be NULL                         |
| `created_at`                      | timestamp   | `created_at`            | datetime(3)   |                                                           |
| `updated_at`                      | timestamp   | `updated_at`            | datetime(3)   |                                                           |

### 19. internship_commitment_term ← tb_termo + termos

**Main Source: `tb_termo`** (most complete table)

| New Field                             | New Type  | Old Field                         | Old Type     | Notes                                                                                    |
| ------------------------------------- | --------- | --------------------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| `id`                                  | text      | `id`                              | char(36)     | UUID maintained                                                                          |
| `old_id`                              | text      | `co_seq_termo`                    | int(10)      |                                                                                          |
| `public_id`                           | text      | -                                 | -            | Doesn't exist in old, can be NULL                                                        |
| `notes`                               | text      | `notas`                           | mediumtext   |                                                                                          |
| `company_id`                          | text      | `empresa_id`                      | char(36)     | UUID maintained                                                                          |
| `company_supervisor_id`               | text      | `supervisor_empresa_id`           | int(11)      | **ATTENTION**: Convert int to company_supervisor ID                                      |
| `company_supervisor_position`         | text      | `cargo_supervisor_empresa`        | varchar(255) |                                                                                          |
| `company_representative_id`           | text      | `representante_empresa_id`        | int(11)      | **ATTENTION**: Convert int to company_representative ID                                  |
| `company_representative_position`     | text      | `cargo_representante_empresa`     | varchar(255) |                                                                                          |
| `institution_id`                      | text      | `instituicao_id`                  | char(36)     | UUID maintained                                                                          |
| `institution_supervisor_id`           | text      | `supervisor_instituicao_id`       | int(11)      | **ATTENTION**: Convert int to institution_supervisor ID                                  |
| `institution_supervisor_position`     | text      | `cargo_supervisor_instituicao`    | varchar(255) |                                                                                          |
| `institution_representative_id`       | text      | `representante_instituicao_id`    | int(11)      | **ATTENTION**: Convert int to institution_representative ID                              |
| `institution_representative_position` | text      | `cargo_representante_instituicao` | varchar(255) |                                                                                          |
| `student_id`                          | text      | `estudante_id`                    | int(11)      | **ATTENTION**: Convert int to student ID                                                 |
| `first_activity`                      | text      | `paragrafo_a`                     | mediumtext   |                                                                                          |
| `second_activity`                     | text      | `paragrafo_b`                     | mediumtext   |                                                                                          |
| `start_commitment_date`               | date      | `data_inicio`                     | date         |                                                                                          |
| `end_commitment_date`                 | date      | `data_fim`                        | date         |                                                                                          |
| `days_and_hours_per_week`             | text      | `hora_especial`                   | mediumtext   |                                                                                          |
| `stipend_amount`                      | text      | `valor_estagio`                   | varchar(191) |                                                                                          |
| `payment_frequency`                   | enum      | `taxa_pagamento`                  | enum         | Map: 'Hora'→'hourly', 'Diario'→'daily', 'Semanalmente'→'weekly', 'Mensalmente'→'monthly' |
| `transportation_allowance_amount`     | text      | `vale_transporte`                 | varchar(191) |                                                                                          |
| `term_date`                           | date      | `data`                            | date         |                                                                                          |
| `first_extension_date`                | date      | `prorrogacao1`                    | date         |                                                                                          |
| `second_extension_date`               | date      | `prorrogacao2`                    | date         |                                                                                          |
| `third_extension_date`                | date      | `prorrogacao3`                    | date         |                                                                                          |
| `termination_date`                    | date      | `rescisao`                        | date         |                                                                                          |
| `created_at`                          | timestamp | `created_at`                      | datetime     |                                                                                          |
| `updated_at`                          | timestamp | `updated_at`                      | datetime     |                                                                                          |

### 20. internship_termination_requests ← solicitar_rescisao_termos

| New Field                       | New Type  | Old Field                          | Old Type      | Notes                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | --------- | ---------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                            | text      | -                                  | -             | **GENERATE NEW UUID**                                                                                                                                                                                                                                                                                                                                                                          |
| `old_id`                        | text      | `id`                               | uuid          | UUID maintained as old_id                                                                                                                                                                                                                                                                                                                                                                      |
| `company_id`                    | text      | `empresa_id`                       | char(36)      | UUID maintained                                                                                                                                                                                                                                                                                                                                                                                |
| `internship_commitment_term_id` | text      | `termo_id`                         | char(36)      | UUID maintained                                                                                                                                                                                                                                                                                                                                                                                |
| `date_of_termination`           | date      | `data_rescisao`                    | date          |                                                                                                                                                                                                                                                                                                                                                                                                |
| `reason_for_termination`        | enum      | `motivo_rescisao`                  | enum          | Map: 'TerminoAutomatico'→'end_of_term', 'IniciativaEstagiario'→'student_initiative', 'IniciativaEmpresa'→'company_initiative', 'NaoAssumiuVaga'→'no_show_did_not_start', 'ConclusaoAbandonoTrancamento'→'course_completion_or_dropout', 'EfetivadoEmpresa'→'hired_by_company', 'DescumprimentoContratual'→'breach_of_contract', 'AusenciaInjustificada'→'excessive_absences', 'Outros'→'other' |
| `status`                        | enum      | `status_solicitacao`               | enum          | Map: 'pendente'→'pending', 'concluido'→'approved'                                                                                                                                                                                                                                                                                                                                              |
| `created_at`                    | timestamp | `data_solicitacao` or `created_at` | date/datetime | Prioritize `created_at`                                                                                                                                                                                                                                                                                                                                                                        |
| `updated_at`                    | timestamp | `updated_at`                       | datetime      |                                                                                                                                                                                                                                                                                                                                                                                                |

### 21. opportunity ← tb_vaga + vagas

**Main Source: `vagas`** (new table created by extracting data from `tb_vaga` - use `vagas` as main, `tb_vaga` as fallback if needed)

| New Field                     | New Type      | Old Field          | Old Type     | Notes                                                                                         |
| ----------------------------- | ------------- | ------------------ | ------------ | --------------------------------------------------------------------------------------------- |
| `id`                          | text          | -                  | -            | **GENERATE NEW UUID**                                                                         |
| `old_id`                      | text          | `id`               | char(36)     | UUID maintained as old_id                                                                     |
| `public_id`                   | text          | `codigo_vaga`      | int(11)      | Convert int to text                                                                           |
| `company_id`                  | text          | `empresa_id`       | char(36)     | UUID maintained                                                                               |
| `company_supervisor_id`       | text          | `supervisor`       | varchar(255) | **ATTENTION**: Need to find company_supervisor ID by name                                     |
| `status`                      | enum          | `status`           | enum         | Map: 'Visivel'→'published', 'Aberta'→'published', 'Fechada'→'closed', 'Cancelada'→'cancelled' |
| `course_id`                   | text          | `curso`            | varchar(255) | **ATTENTION**: Need to find course ID by name                                                 |
| `openings`                    | integer       | `qt_vaga`          | int(11)      | Default: 1                                                                                    |
| `contact_name`                | text          | `contato`          | varchar(200) |                                                                                               |
| `reference_point`             | text          | `ponto_referencia` | text         |                                                                                               |
| `schedule_text`               | text          | `dia_horario`      | varchar(200) |                                                                                               |
| `interviewer_name`            | text          | `entrevistador`    | varchar(250) |                                                                                               |
| `education_level`             | text          | `nivel`            | varchar(200) | **ATTENTION**: Free text, not a FK                                                            |
| `semester_id`                 | text          | `semestre`         | varchar(100) | **ATTENTION**: Need to find semester ID by name                                               |
| `gender_id`                   | text          | `sexo`             | varchar(50)  | **ATTENTION**: Need to find gender ID by name                                                 |
| `accepts_disabled_candidates` | boolean       | `deficiencia`      | tinyint(1)   |                                                                                               |
| `stipend_amount`              | numeric(10,2) | `bolsa`            | varchar(100) | Convert varchar to numeric                                                                    |
| `benefits_text`               | text          | `beneficio`        | varchar(100) |                                                                                               |
| `requirements_text`           | text          | `exigencia`        | text         |                                                                                               |
| `activities_text`             | text          | `atividade`        | text         |                                                                                               |
| `application_instructions`    | text          | -                  | -            | Doesn't exist in old, can be NULL                                                             |
| `notes`                       | text          | `observacao`       | text         |                                                                                               |
| `created_at`                  | timestamp     | `created_at`       | datetime     |                                                                                               |
| `updated_at`                  | timestamp     | `updated_at`       | datetime     |                                                                                               |

### 22. signed_internship_commitment_term ← tce_docs (partial)

| New Field                       | New Type  | Old Field      | Old Type     | Notes                                                       |
| ------------------------------- | --------- | -------------- | ------------ | ----------------------------------------------------------- |
| `id`                            | text      | -              | -            | **GENERATE NEW UUID**                                       |
| `old_id`                        | text      | `id`           | int(11)      |                                                             |
| `public_id`                     | text      | -              | -            | Doesn't exist in old, can be NULL                           |
| `internship_commitment_term_id` | text      | `tce_id`       | int(11)      | **ATTENTION**: Convert int to internship_commitment_term ID |
| `company_id`                    | text      | `empresa_id`   | int(11)      | **ATTENTION**: Convert int to company ID                    |
| `student_id`                    | text      | `estudante_id` | int(11)      | **ATTENTION**: Convert int to student ID                    |
| `pdf_url`                       | text      | `documento`    | varchar(255) |                                                             |
| `created_at`                    | timestamp | `created_at`   | timestamp    |                                                             |
| `updated_at`                    | timestamp | `updated_at`   | timestamp    |                                                             |

---

## Important Notes

### Required Conversions

1. **Sequential IDs → UUIDs**: Many old tables use `int(11)` as ID, while the new database uses `text` (UUID). It's necessary to:
   - Generate new UUIDs for records that don't have UUID
   - Keep the old ID in the `old_id` field for reference

2. **Foreign Keys**: Many old FKs are `int(11)`, need to be converted to UUIDs from new tables:
   - `user_id` (int) → UUID from `users`
   - `estado_id` (int) → UUID from `state`
   - `curso_id` (int) → UUID from `course`
   - `semestre_id` (int) → UUID from `semester`
   - etc.

3. **Enums**: Some enums changed values:
   - `role`: 'undefined' doesn't exist in new database
   - `status_solicitacao`: 'pendente'/'concluido' → 'open'/'in_progress'/'filled'/'canceled'/'closed'
   - `language_level`: 'nenhum'/'básico'/'intermediário'/'avançado' → 'beginner'/'intermediate'/'advanced'/'native'

4. **Free Text Fields**: Some fields that were FKs are now free text:
   - `opportunity.education_level` (was FK, now is text)

5. **Calculated Fields**: Some fields need to be calculated:
   - `internship_agreement_requests.proposed_end_date` from `vigencia_estagio`

### Recommended Migration Order

1. **Reference Tables** (no dependencies):
   - `state`
   - `gender`
   - `marital_status`
   - `education_level`
   - `course`
   - `semester`
   - `shift`
   - `educational_institution`

2. **User Tables**:
   - `users`

3. **Entity Tables**:
   - `company`
   - `institutions`
   - `student`

4. **Relationship Tables**:
   - `company_representative`
   - `company_supervisor`
   - `institution_representative`
   - `institution_supervisor`

5. **Request Tables**:
   - `intern_requests`
   - `internship_agreement_requests`

6. **Term Tables**:
   - `internship_commitment_term`
   - `internship_termination_requests`
   - `signed_internship_commitment_term`

7. **Opportunity Tables**:
   - `opportunity`

8. **Authentication Tables**:
   - `refresh_tokens` (new, no old data)

---

## Tables Not Migrated

The following tables from the old database don't have direct correspondence in the new database:

1. `prorrogacao_de_contrato` - Contract extension requests
2. `recibo_pagamento_bolsa` - Stipend payment receipts
3. `recibo_recesso_remunerado` - Paid leave receipts
4. `tb_categoria` - News categories
5. `tb_cursoinfnew` - Additional course information
6. `tb_dados_financeiros` - Company financial data
7. `tb_depoimento` - Testimonials
8. `tb_experprofis` - Professional experiences
9. `tb_noticia` - News
10. `termo_realizacao_estagios` - Internship completion terms

**Decision needed**: Evaluate if these tables need to be migrated or if the data should be archived.
