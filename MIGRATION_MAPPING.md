# Mapeamento de Migração de Banco de Dados

## Resumo das Tabelas que Precisam ser Migradas

### Tabelas Principais (Dados de Negócio)

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
21. **opportunity** ← `tb_vaga` (tabela antiga) + `vagas` (tabela nova criada extraindo dados de `tb_vaga`)
22. **signed_internship_commitment_term** ← `tce_docs` (parcial)
23. **refresh_tokens** ← (novo - não existe no banco antigo)

### Tabelas Não Migradas (Sem Correspondência Direta)

- `prorrogacao_de_contrato` - Não há tabela equivalente no novo banco
- `recibo_pagamento_bolsa` - Não há tabela equivalente no novo banco
- `recibo_recesso_remunerado` - Não há tabela equivalente no novo banco
- `tb_categoria` - Não há tabela equivalente no novo banco
- `tb_cursoinfnew` - Não há tabela equivalente no novo banco
- `tb_dados_financeiros` - Não há tabela equivalente no novo banco
- `tb_depoimento` - Não há tabela equivalente no novo banco
- `tb_experprofis` - Não há tabela equivalente no novo banco
- `tb_noticia` - Não há tabela equivalente no novo banco
- `tb_representante` - Substituído por `company_representative` e `institution_representative`
- `tb_supervisor` - Substituído por `company_supervisor` e `institution_supervisor`
- `termo_realizacao_estagios` - Não há tabela equivalente no novo banco

---

## Mapeamento Detalhado de Campos

### 1. users ← tb_usuario

| Campo Novo   | Tipo Novo | Campo Antigo                  | Tipo Antigo  | Observações                                                                                                   |
| ------------ | --------- | ----------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `id`         | text      | `id`                          | char(36)     | UUID mantido                                                                                                  |
| `email`      | text      | `email`                       | varchar(255) |                                                                                                               |
| `name`       | text      | `name`                        | varchar(255) |                                                                                                               |
| `avatar`     | text      | `image`                       | varchar(255) |                                                                                                               |
| `password`   | text      | `password_hash` ou `ds_senha` | varchar(255) | Priorizar `password_hash`, usar `ds_senha` se não existir                                                     |
| `role`       | enum      | `role`                        | enum         | Mapear: 'student'→'student', 'company'→'company', 'institution'→'institution', 'admin'→'admin', 'undefined'→? |
| `created_at` | timestamp | `created_at`                  | datetime     |                                                                                                               |
| `updated_at` | timestamp | `updated_at`                  | datetime     |                                                                                                               |
| `old_id`     | text      | `co_seq_usuario`              | int(11)      | ID sequencial antigo                                                                                          |

### 2. company ← tb_empresa

| Campo Novo           | Tipo Novo   | Campo Antigo                  | Tipo Antigo   | Observações                                          |
| -------------------- | ----------- | ----------------------------- | ------------- | ---------------------------------------------------- |
| `id`                 | text        | `id`                          | char(36)      | UUID mantido                                         |
| `old_id`             | text        | `co_seq_empresa`              | int(10)       |                                                      |
| `user_id`            | text        | `user_id`                     | int(11)       | **ATENÇÃO**: Precisa converter int para UUID do user |
| `notes`              | text        | `ds_obs_futura_emp`           | mediumtext    |                                                      |
| `legal_name`         | text        | `ds_razao_social`             | varchar(191)  |                                                      |
| `trade_name`         | text        | `ds_nome_fantasia`            | varchar(191)  |                                                      |
| `activities`         | text        | `ds_atividade`                | varchar(100)  |                                                      |
| `cnpj_number`        | varchar(18) | `nu_cnpj`                     | varchar(18)   |                                                      |
| `state_registration` | text        | `ds_insc_est`                 | varchar(100)  |                                                      |
| `address`            | text        | `ds_endereco`                 | varchar(191)  |                                                      |
| `city`               | text        | `ds_cidade`                   | varchar(100)  |                                                      |
| `state_id`           | text        | `ds_uf`                       | varchar(2)    | **ATENÇÃO**: Precisa converter para ID do state      |
| `zip_code`           | varchar(9)  | `nu_cep`                      | varchar(10)   |                                                      |
| `phone`              | varchar(20) | `nu_telefone`                 | varchar(16)   |                                                      |
| `whatsapp`           | varchar(20) | -                             | -             | Não existe no antigo, pode ser NULL                  |
| `created_at`         | timestamp   | `dt_cadastro` ou `created_at` | date/datetime | Priorizar `created_at`                               |
| `updated_at`         | timestamp   | `updated_at`                  | datetime      |                                                      |

### 3. institutions ← tb_instituicao

| Campo Novo           | Tipo Novo   | Campo Antigo                  | Tipo Antigo  | Observações                                          |
| -------------------- | ----------- | ----------------------------- | ------------ | ---------------------------------------------------- |
| `id`                 | text        | `id`                          | char(36)     | UUID mantido                                         |
| `old_id`             | text        | `co_seq_instituicao`          | int(10)      |                                                      |
| `user_id`            | text        | `user_id`                     | int(11)      | **ATENÇÃO**: Precisa converter int para UUID do user |
| `notes`              | text        | `ds_obs_futura_inst`          | text         |                                                      |
| `legal_name`         | text        | `ds_razao_social`             | varchar(100) |                                                      |
| `trade_name`         | text        | `ds_nome_fantasia`            | varchar(100) |                                                      |
| `activities`         | text        | `ds_atividade`                | varchar(100) |                                                      |
| `cnpj_number`        | varchar(18) | `nu_cnpj`                     | varchar(18)  |                                                      |
| `state_registration` | text        | `ds_insc_est`                 | varchar(100) |                                                      |
| `address`            | text        | `ds_endereco`                 | varchar(100) |                                                      |
| `city`               | text        | `ds_cidade`                   | varchar(100) |                                                      |
| `state_id`           | text        | `ds_uf`                       | char(2)      | **ATENÇÃO**: Precisa converter para ID do state      |
| `zip_code`           | varchar(9)  | `nu_cep`                      | varchar(10)  |                                                      |
| `phone`              | varchar(20) | `nu_telefone`                 | varchar(16)  |                                                      |
| `whatsapp`           | varchar(20) | -                             | -            | Não existe no antigo, pode ser NULL                  |
| `created_at`         | timestamp   | `dt_cadastro` ou `created_at` | datetime     | Priorizar `created_at`                               |
| `updated_at`         | timestamp   | `updated_at`                  | datetime     |                                                      |

### 4. student ← tb_estudante

| Campo Novo                   | Tipo Novo   | Campo Antigo            | Tipo Antigo  | Observações                                                                                             |
| ---------------------------- | ----------- | ----------------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| `id`                         | text        | -                       | -            | **GERAR NOVO UUID**                                                                                     |
| `old_id`                     | text        | `id`                    | int(11)      |                                                                                                         |
| `user_id`                    | text        | `usuario_id`            | int(11)      | **ATENÇÃO**: Precisa converter int para UUID do user                                                    |
| `notes`                      | text        | `notas`                 | text         |                                                                                                         |
| `full_name`                  | text        | `nome_completo`         | varchar(191) |                                                                                                         |
| `birth_date`                 | date        | `data_nascimento`       | date         |                                                                                                         |
| `cpf_number`                 | varchar(14) | `cpf`                   | varchar(14)  |                                                                                                         |
| `rg_number`                  | varchar(20) | `rg`                    | varchar(191) |                                                                                                         |
| `issue_agency`               | text        | `orgao_expedidor`       | varchar(191) |                                                                                                         |
| `has_driver_license`         | boolean     | `possui_cnh`            | tinyint(1)   |                                                                                                         |
| `gender_id`                  | text        | `genero`                | enum         | **ATENÇÃO**: Precisa mapear enum para ID de gender                                                      |
| `marital_status_id`          | text        | `estado_civil_id`       | int(11)      | **ATENÇÃO**: Precisa converter int para ID de marital_status                                            |
| `has_disability`             | boolean     | `possui_deficiencia`    | tinyint(1)   |                                                                                                         |
| `disability_type`            | text        | `tipo_deficiencia`      | varchar(191) |                                                                                                         |
| `father_name`                | text        | `nome_pai`              | varchar(191) |                                                                                                         |
| `mother_name`                | text        | `nome_mae`              | varchar(191) |                                                                                                         |
| `address`                    | text        | `endereco`              | varchar(191) |                                                                                                         |
| `city`                       | text        | `cidade`                | varchar(100) |                                                                                                         |
| `state_id`                   | text        | `estado_id`             | int(11)      | **ATENÇÃO**: Precisa converter int para ID de state                                                     |
| `zip_code`                   | varchar(9)  | `cep`                   | varchar(9)   |                                                                                                         |
| `phone`                      | varchar(20) | `telefone`              | varchar(20)  |                                                                                                         |
| `whatsapp`                   | varchar(20) | `whatsapp`              | varchar(20)  |                                                                                                         |
| `education_level_id`         | text        | `nivel_escolaridade_id` | int(11)      | **ATENÇÃO**: Precisa converter int para ID de education_level                                           |
| `course_id`                  | text        | `curso_id`              | int(11)      | **ATENÇÃO**: Precisa converter int para ID de course                                                    |
| `educational_institution_id` | text        | `instituicao_id`        | int(11)      | **ATENÇÃO**: Precisa converter int para ID de educational_institution                                   |
| `has_oab_license`            | boolean     | `possui_oab`            | int(1)       |                                                                                                         |
| `enrollment`                 | text        | `matricula`             | varchar(100) |                                                                                                         |
| `semester_id`                | text        | `semestre_id`           | int(11)      | **ATENÇÃO**: Precisa converter int para ID de semester                                                  |
| `shift_id`                   | text        | `turno_id`              | int(11)      | **ATENÇÃO**: Precisa converter int para ID de shift                                                     |
| `available_shift_id`         | text        | `horario_disponivel`    | enum         | **ATENÇÃO**: Precisa mapear enum para ID de shift                                                       |
| `english_level`              | enum        | `ingles`                | enum         | Mapear: 'nenhum'→'beginner', 'básico'→'beginner', 'intermediário'→'intermediate', 'avançado'→'advanced' |
| `spanish_level`              | enum        | `espanhol`              | enum         | Mapear: 'nenhum'→'beginner', 'básico'→'beginner', 'intermediário'→'intermediate', 'avançado'→'advanced' |
| `french_level`               | enum        | `frances`               | enum         | Mapear: 'nenhum'→'beginner', 'básico'→'beginner', 'intermediário'→'intermediate', 'avançado'→'advanced' |
| `other_languages`            | text        | `outro_idioma`          | varchar(255) |                                                                                                         |
| `improvement_courses`        | text        | `ImprovementCourse`     | longtext     |                                                                                                         |
| `it_courses`                 | text        | `ITCourse`              | longtext     |                                                                                                         |
| `created_at`                 | timestamp   | `createdAt`             | datetime     |                                                                                                         |
| `updated_at`                 | timestamp   | `updatedAt`             | datetime     |                                                                                                         |

### 5. state ← tb_estados

| Campo Novo   | Tipo Novo  | Campo Antigo | Tipo Antigo | Observações          |
| ------------ | ---------- | ------------ | ----------- | -------------------- |
| `id`         | text       | -            | -           | **GERAR NOVO UUID**  |
| `name`       | text       | `estado`     | varchar(40) |                      |
| `acronym`    | varchar(2) | `uf`         | varchar(2)  |                      |
| `created_at` | timestamp  | -            | -           | Usar timestamp atual |
| `updated_at` | timestamp  | -            | -           | Usar timestamp atual |
| `old_id`     | text       | `id`         | int(11)     |                      |

### 6. course ← tb_confcurso

| Campo Novo   | Tipo Novo | Campo Antigo       | Tipo Antigo  | Observações                          |
| ------------ | --------- | ------------------ | ------------ | ------------------------------------ |
| `id`         | text      | -                  | -            | **GERAR NOVO UUID**                  |
| `name`       | text      | `no_curso`         | varchar(255) |                                      |
| `created_at` | timestamp | `dt_publicado`     | datetime     |                                      |
| `updated_at` | timestamp | -                  | -            | Usar `created_at` ou timestamp atual |
| `old_id`     | text      | `co_seq_confcurso` | int(11)      |                                      |

### 7. semester ← tb_semestre

| Campo Novo   | Tipo Novo | Campo Antigo | Tipo Antigo | Observações          |
| ------------ | --------- | ------------ | ----------- | -------------------- |
| `id`         | text      | -            | -           | **GERAR NOVO UUID**  |
| `name`       | text      | `semestre`   | varchar(30) |                      |
| `created_at` | timestamp | -            | -           | Usar timestamp atual |
| `updated_at` | timestamp | -            | -           | Usar timestamp atual |
| `old_id`     | text      | `id`         | int(11)     |                      |

### 8. gender ← tb_sexo

| Campo Novo   | Tipo Novo | Campo Antigo | Tipo Antigo  | Observações                          |
| ------------ | --------- | ------------ | ------------ | ------------------------------------ |
| `id`         | text      | -            | -            | **GERAR NOVO UUID**                  |
| `name`       | text      | `sexo`       | varchar(255) |                                      |
| `created_at` | timestamp | `created_at` | datetime     |                                      |
| `updated_at` | timestamp | -            | -            | Usar `created_at` ou timestamp atual |
| `old_id`     | text      | `id`         | int(11)      |                                      |

### 9. marital_status ← tb_estado_civil

| Campo Novo   | Tipo Novo | Campo Antigo   | Tipo Antigo  | Observações                          |
| ------------ | --------- | -------------- | ------------ | ------------------------------------ |
| `id`         | text      | -              | -            | **GERAR NOVO UUID**                  |
| `name`       | text      | `estado_civil` | varchar(255) |                                      |
| `created_at` | timestamp | `created_at`   | datetime     |                                      |
| `updated_at` | timestamp | -              | -            | Usar `created_at` ou timestamp atual |
| `old_id`     | text      | `id`           | int(11)      |                                      |

### 10. education_level ← tb_escolaridade

| Campo Novo   | Tipo Novo | Campo Antigo | Tipo Antigo | Observações          |
| ------------ | --------- | ------------ | ----------- | -------------------- |
| `id`         | text      | -            | -           | **GERAR NOVO UUID**  |
| `name`       | text      | `nivel`      | varchar(30) |                      |
| `created_at` | timestamp | -            | -           | Usar timestamp atual |
| `updated_at` | timestamp | -            | -           | Usar timestamp atual |
| `old_id`     | text      | `id`         | int(11)     |                      |

### 11. educational_institution ← tb_confinstituicao

| Campo Novo   | Tipo Novo | Campo Antigo             | Tipo Antigo | Observações                          |
| ------------ | --------- | ------------------------ | ----------- | ------------------------------------ |
| `id`         | text      | -                        | -           | **GERAR NOVO UUID**                  |
| `name`       | text      | `no_instituicao`         | text        |                                      |
| `created_at` | timestamp | `dt_publicado`           | date        | Converter date para timestamp        |
| `updated_at` | timestamp | -                        | -           | Usar `created_at` ou timestamp atual |
| `old_id`     | text      | `co_seq_confinstituicao` | int(10)     |                                      |

### 12. shift ← tb_turno

| Campo Novo   | Tipo Novo | Campo Antigo | Tipo Antigo  | Observações                          |
| ------------ | --------- | ------------ | ------------ | ------------------------------------ |
| `id`         | text      | -            | -            | **GERAR NOVO UUID**                  |
| `name`       | text      | `turno`      | varchar(255) |                                      |
| `created_at` | timestamp | `created_at` | timestamp    |                                      |
| `updated_at` | timestamp | -            | -            | Usar `created_at` ou timestamp atual |
| `old_id`     | text      | `id`         | int(11)      |                                      |

### 13. company_representative ← representante_empresas

| Campo Novo          | Tipo Novo   | Campo Antigo   | Tipo Antigo  | Observações         |
| ------------------- | ----------- | -------------- | ------------ | ------------------- |
| `id`                | text        | -              | -            | **GERAR NOVO UUID** |
| `old_id`            | text        | `id`           | int(11)      |                     |
| `company_id`        | text        | `empresa_id`   | char(36)     | UUID mantido        |
| `full_name`         | text        | `nomeCompleto` | varchar(255) |                     |
| `cpf_number`        | varchar(11) | `cpf`          | varchar(14)  | Remover formatação  |
| `rg_number`         | varchar(20) | `rg`           | varchar(40)  |                     |
| `issuing_authority` | text        | `orgaoEmissor` | varchar(60)  |                     |
| `phone`             | varchar(20) | `telefone`     | varchar(15)  |                     |
| `whatsapp`          | varchar(20) | `celular`      | varchar(15)  |                     |
| `position`          | text        | `cargo`        | varchar(60)  |                     |
| `created_at`        | timestamp   | `created_at`   | datetime     |                     |
| `updated_at`        | timestamp   | `updated_at`   | datetime     |                     |

### 14. company_supervisor ← supervisor_empresas

| Campo Novo          | Tipo Novo   | Campo Antigo   | Tipo Antigo  | Observações         |
| ------------------- | ----------- | -------------- | ------------ | ------------------- |
| `id`                | text        | -              | -            | **GERAR NOVO UUID** |
| `old_id`            | text        | `id`           | int(11)      |                     |
| `company_id`        | text        | `empresa_id`   | char(36)     | UUID mantido        |
| `full_name`         | text        | `nomeCompleto` | varchar(255) |                     |
| `cpf_number`        | varchar(11) | `cpf`          | varchar(14)  | Remover formatação  |
| `rg_number`         | varchar(20) | `rg`           | varchar(40)  |                     |
| `issuing_authority` | text        | `orgaoEmissor` | varchar(60)  |                     |
| `phone`             | varchar(20) | `telefone`     | varchar(15)  |                     |
| `whatsapp`          | varchar(20) | `celular`      | varchar(15)  |                     |
| `position`          | text        | `cargo`        | varchar(60)  |                     |
| `created_at`        | timestamp   | `created_at`   | datetime     |                     |
| `updated_at`        | timestamp   | `updated_at`   | datetime     |                     |

### 15. institution_representative ← representante_instituicaos

| Campo Novo          | Tipo Novo   | Campo Antigo     | Tipo Antigo  | Observações         |
| ------------------- | ----------- | ---------------- | ------------ | ------------------- |
| `id`                | text        | -                | -            | **GERAR NOVO UUID** |
| `old_id`            | text        | `id`             | int(11)      |                     |
| `institution_id`    | text        | `instituicao_id` | char(36)     | UUID mantido        |
| `full_name`         | text        | `nomeCompleto`   | varchar(255) |                     |
| `cpf_number`        | varchar(11) | `cpf`            | varchar(14)  | Remover formatação  |
| `rg_number`         | varchar(20) | `rg`             | varchar(40)  |                     |
| `issuing_authority` | text        | `orgaoEmissor`   | varchar(60)  |                     |
| `phone`             | varchar(20) | `telefone`       | varchar(15)  |                     |
| `whatsapp`          | varchar(20) | `celular`        | varchar(15)  |                     |
| `position`          | text        | `cargo`          | varchar(60)  |                     |
| `created_at`        | timestamp   | `created_at`     | datetime     |                     |
| `updated_at`        | timestamp   | `updated_at`     | datetime     |                     |

### 16. institution_supervisor ← supervisor_instituicaos

| Campo Novo          | Tipo Novo   | Campo Antigo     | Tipo Antigo  | Observações         |
| ------------------- | ----------- | ---------------- | ------------ | ------------------- |
| `id`                | text        | -                | -            | **GERAR NOVO UUID** |
| `old_id`            | text        | `id`             | int(11)      |                     |
| `institution_id`    | text        | `instituicao_id` | char(36)     | UUID mantido        |
| `full_name`         | text        | `nomeCompleto`   | varchar(255) |                     |
| `cpf_number`        | varchar(11) | `cpf`            | varchar(14)  | Remover formatação  |
| `rg_number`         | varchar(20) | `rg`             | varchar(40)  |                     |
| `issuing_authority` | text        | `orgaoEmissor`   | varchar(60)  |                     |
| `phone`             | varchar(20) | `telefone`       | varchar(15)  |                     |
| `whatsapp`          | varchar(20) | `celular`        | varchar(15)  |                     |
| `position`          | text        | `cargo`          | varchar(60)  |                     |
| `created_at`        | timestamp   | `created_at`     | datetime     |                     |
| `updated_at`        | timestamp   | `updated_at`     | datetime     |                     |

### 17. intern_requests ← solicitar_estagiarios

| Campo Novo                        | Tipo Novo   | Campo Antigo                       | Tipo Antigo  | Observações                                         |
| --------------------------------- | ----------- | ---------------------------------- | ------------ | --------------------------------------------------- |
| `id`                              | text        | -                                  | -            | **GERAR NOVO UUID**                                 |
| `old_id`                          | text        | `id`                               | uuid         | UUID mantido como old_id                            |
| `company_id`                      | text        | `empresa_id`                       | char(36)     | UUID mantido                                        |
| `city`                            | text        | `cidade`                           | varchar(191) |                                                     |
| `phone`                           | varchar(20) | `telefone_empresa`                 | varchar(16)  |                                                     |
| `email`                           | text        | `email`                            | varchar(191) |                                                     |
| `interviewer_name`                | text        | `responsavel`                      | varchar(191) |                                                     |
| `interview_availability`          | text        | `hora_entrevista`                  | varchar(191) | Default: 'To be scheduled via email/phone/whatssap' |
| `course_id`                       | text        | `curso_id`                         | int(11)      | **ATENÇÃO**: Converter int para ID de course        |
| `semester_id`                     | text        | `semestre_id`                      | int(11)      | **ATENÇÃO**: Converter int para ID de semester      |
| `number_of_open_positions`        | integer     | `numero_vagas`                     | int(11)      | Default: 1                                          |
| `preferred_gender_id`             | text        | `genero`                           | enum         | **ATENÇÃO**: Mapear enum para ID de gender          |
| `internship_schedule`             | text        | `horario_estagio`                  | varchar(191) |                                                     |
| `stipend_amount`                  | text        | `valor_bolsa_auxilio`              | varchar(191) |                                                     |
| `transportation_allowance_amount` | text        | `valor_vale_transporte`            | varchar(191) |                                                     |
| `meal_allowance_amount`           | text        | `valor_vale_alimentacao`           | varchar(191) |                                                     |
| `other_benefits`                  | text        | -                                  | -            | Não existe no antigo, pode ser NULL                 |
| `required_skills`                 | text        | `conhecimentos_exigidos`           | text         |                                                     |
| `activities_description`          | text        | `atividades_serem_realizadas`      | text         |                                                     |
| `status`                          | enum        | `status_solicitacao`               | enum         | Mapear: 'pendente'→'open', 'concluido'→'filled'     |
| `created_at`                      | timestamp   | `data_solicitacao` ou `created_at` | datetime     | Priorizar `created_at`                              |
| `updated_at`                      | timestamp   | `updated_at`                       | datetime     |                                                     |

### 18. internship_agreement_requests ← solicitar_termos

| Campo Novo                        | Tipo Novo   | Campo Antigo            | Tipo Antigo   | Observações                                                  |
| --------------------------------- | ----------- | ----------------------- | ------------- | ------------------------------------------------------------ |
| `id`                              | text        | -                       | -             | **GERAR NOVO UUID**                                          |
| `old_id`                          | text        | `id`                    | uuid          | UUID mantido como old_id                                     |
| `company_id`                      | text        | `empresa_id`            | varchar(36)   | UUID mantido                                                 |
| `company_representative_id`       | text        | `representante_empresa` | varchar(191)  | **ATENÇÃO**: Precisa buscar ID de company_representative     |
| `company_supervisor_id`           | text        | `supervisor_empresa`    | varchar(191)  | **ATENÇÃO**: Precisa buscar ID de company_supervisor         |
| `company_phone`                   | varchar(20) | `telefone_empresa`      | varchar(16)   |                                                              |
| `company_email`                   | text        | `email_empresa`         | varchar(191)  |                                                              |
| `supervisor_email`                | text        | `email_supervisor`      | varchar(191)  |                                                              |
| `council_number`                  | text        | `numero_conselho`       | varchar(191)  |                                                              |
| `student_name`                    | text        | `nome_estudante`        | varchar(191)  |                                                              |
| `student_phone`                   | varchar(20) | `telefone_estudante`    | varchar(16)   |                                                              |
| `course_id`                       | text        | `curso`                 | varchar(191)  | **ATENÇÃO**: Precisa buscar ID de course pelo nome           |
| `semester_id`                     | text        | `semestre`              | varchar(191)  | **ATENÇÃO**: Precisa buscar ID de semester pelo nome         |
| `proposed_start_date`             | date        | `data_inicio_estagio`   | date          |                                                              |
| `proposed_end_date`               | date        | -                       | -             | **ATENÇÃO**: Calcular a partir de `vigencia_estagio` (meses) |
| `weekly_schedule`                 | text        | `horario_estagio`       | varchar(191)  |                                                              |
| `stipend_amount`                  | text        | `valor_bolsa_auxilio`   | decimal(10,2) | Converter decimal para text                                  |
| `transportation_allowance_amount` | text        | `valor_vale_transporte` | decimal(10,2) | Converter decimal para text                                  |
| `other_benefits`                  | text        | `outros_beneficios`     | text          |                                                              |
| `activities_description`          | text        | `atividades_realizadas` | text          |                                                              |
| `request_date`                    | date        | `data_solicitacao`      | datetime      | Converter datetime para date                                 |
| `status`                          | enum        | `status_solicitacao`    | enum          | Mapear: 'pendente'→'pending', 'concluido'→'accepted'         |
| `notes`                           | text        | -                       | -             | Não existe no antigo, pode ser NULL                          |
| `created_at`                      | timestamp   | `created_at`            | datetime(3)   |                                                              |
| `updated_at`                      | timestamp   | `updated_at`            | datetime(3)   |                                                              |

### 19. internship_commitment_term ← tb_termo + termos

**Fonte Principal: `tb_termo`** (tabela mais completa)

| Campo Novo                            | Tipo Novo | Campo Antigo                      | Tipo Antigo  | Observações                                                                                 |
| ------------------------------------- | --------- | --------------------------------- | ------------ | ------------------------------------------------------------------------------------------- |
| `id`                                  | text      | `id`                              | char(36)     | UUID mantido                                                                                |
| `old_id`                              | text      | `co_seq_termo`                    | int(10)      |                                                                                             |
| `public_id`                           | text      | -                                 | -            | Não existe no antigo, pode ser NULL                                                         |
| `notes`                               | text      | `notas`                           | mediumtext   |                                                                                             |
| `company_id`                          | text      | `empresa_id`                      | char(36)     | UUID mantido                                                                                |
| `company_supervisor_id`               | text      | `supervisor_empresa_id`           | int(11)      | **ATENÇÃO**: Converter int para ID de company_supervisor                                    |
| `company_supervisor_position`         | text      | `cargo_supervisor_empresa`        | varchar(255) |                                                                                             |
| `company_representative_id`           | text      | `representante_empresa_id`        | int(11)      | **ATENÇÃO**: Converter int para ID de company_representative                                |
| `company_representative_position`     | text      | `cargo_representante_empresa`     | varchar(255) |                                                                                             |
| `institution_id`                      | text      | `instituicao_id`                  | char(36)     | UUID mantido                                                                                |
| `institution_supervisor_id`           | text      | `supervisor_instituicao_id`       | int(11)      | **ATENÇÃO**: Converter int para ID de institution_supervisor                                |
| `institution_supervisor_position`     | text      | `cargo_supervisor_instituicao`    | varchar(255) |                                                                                             |
| `institution_representative_id`       | text      | `representante_instituicao_id`    | int(11)      | **ATENÇÃO**: Converter int para ID de institution_representative                            |
| `institution_representative_position` | text      | `cargo_representante_instituicao` | varchar(255) |                                                                                             |
| `student_id`                          | text      | `estudante_id`                    | int(11)      | **ATENÇÃO**: Converter int para ID de student                                               |
| `first_activity`                      | text      | `paragrafo_a`                     | mediumtext   |                                                                                             |
| `second_activity`                     | text      | `paragrafo_b`                     | mediumtext   |                                                                                             |
| `start_commitment_date`               | date      | `data_inicio`                     | date         |                                                                                             |
| `end_commitment_date`                 | date      | `data_fim`                        | date         |                                                                                             |
| `days_and_hours_per_week`             | text      | `hora_especial`                   | mediumtext   |                                                                                             |
| `stipend_amount`                      | text      | `valor_estagio`                   | varchar(191) |                                                                                             |
| `payment_frequency`                   | enum      | `taxa_pagamento`                  | enum         | Mapear: 'Hora'→'hourly', 'Diario'→'daily', 'Semanalmente'→'weekly', 'Mensalmente'→'monthly' |
| `transportation_allowance_amount`     | text      | `vale_transporte`                 | varchar(191) |                                                                                             |
| `term_date`                           | date      | `data`                            | date         |                                                                                             |
| `first_extension_date`                | date      | `prorrogacao1`                    | date         |                                                                                             |
| `second_extension_date`               | date      | `prorrogacao2`                    | date         |                                                                                             |
| `third_extension_date`                | date      | `prorrogacao3`                    | date         |                                                                                             |
| `termination_date`                    | date      | `rescisao`                        | date         |                                                                                             |
| `created_at`                          | timestamp | `created_at`                      | datetime     |                                                                                             |
| `updated_at`                          | timestamp | `updated_at`                      | datetime     |                                                                                             |

### 20. internship_termination_requests ← solicitar_rescisao_termos

| Campo Novo                      | Tipo Novo | Campo Antigo                       | Tipo Antigo   | Observações                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | --------- | ---------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                            | text      | -                                  | -             | **GERAR NOVO UUID**                                                                                                                                                                                                                                                                                                                                                                               |
| `old_id`                        | text      | `id`                               | uuid          | UUID mantido como old_id                                                                                                                                                                                                                                                                                                                                                                          |
| `company_id`                    | text      | `empresa_id`                       | char(36)      | UUID mantido                                                                                                                                                                                                                                                                                                                                                                                      |
| `internship_commitment_term_id` | text      | `termo_id`                         | char(36)      | UUID mantido                                                                                                                                                                                                                                                                                                                                                                                      |
| `date_of_termination`           | date      | `data_rescisao`                    | date          |                                                                                                                                                                                                                                                                                                                                                                                                   |
| `reason_for_termination`        | enum      | `motivo_rescisao`                  | enum          | Mapear: 'TerminoAutomatico'→'end_of_term', 'IniciativaEstagiario'→'student_initiative', 'IniciativaEmpresa'→'company_initiative', 'NaoAssumiuVaga'→'no_show_did_not_start', 'ConclusaoAbandonoTrancamento'→'course_completion_or_dropout', 'EfetivadoEmpresa'→'hired_by_company', 'DescumprimentoContratual'→'breach_of_contract', 'AusenciaInjustificada'→'excessive_absences', 'Outros'→'other' |
| `status`                        | enum      | `status_solicitacao`               | enum          | Mapear: 'pendente'→'pending', 'concluido'→'approved'                                                                                                                                                                                                                                                                                                                                              |
| `created_at`                    | timestamp | `data_solicitacao` ou `created_at` | date/datetime | Priorizar `created_at`                                                                                                                                                                                                                                                                                                                                                                            |
| `updated_at`                    | timestamp | `updated_at`                       | datetime      |                                                                                                                                                                                                                                                                                                                                                                                                   |

### 21. opportunity ← tb_vaga + vagas

**Fonte Principal: `vagas`** (tabela nova criada extraindo dados de `tb_vaga` - usar `vagas` como principal, `tb_vaga` como fallback se necessário)

| Campo Novo                    | Tipo Novo     | Campo Antigo       | Tipo Antigo  | Observações                                                                                      |
| ----------------------------- | ------------- | ------------------ | ------------ | ------------------------------------------------------------------------------------------------ |
| `id`                          | text          | -                  | -            | **GERAR NOVO UUID**                                                                              |
| `old_id`                      | text          | `id`               | char(36)     | UUID mantido como old_id                                                                         |
| `public_id`                   | text          | `codigo_vaga`      | int(11)      | Converter int para text                                                                          |
| `company_id`                  | text          | `empresa_id`       | char(36)     | UUID mantido                                                                                     |
| `company_supervisor_id`       | text          | `supervisor`       | varchar(255) | **ATENÇÃO**: Precisa buscar ID de company_supervisor pelo nome                                   |
| `status`                      | enum          | `status`           | enum         | Mapear: 'Visivel'→'published', 'Aberta'→'published', 'Fechada'→'closed', 'Cancelada'→'cancelled' |
| `course_id`                   | text          | `curso`            | varchar(255) | **ATENÇÃO**: Precisa buscar ID de course pelo nome                                               |
| `openings`                    | integer       | `qt_vaga`          | int(11)      | Default: 1                                                                                       |
| `contact_name`                | text          | `contato`          | varchar(200) |                                                                                                  |
| `reference_point`             | text          | `ponto_referencia` | text         |                                                                                                  |
| `schedule_text`               | text          | `dia_horario`      | varchar(200) |                                                                                                  |
| `interviewer_name`            | text          | `entrevistador`    | varchar(250) |                                                                                                  |
| `education_level`             | text          | `nivel`            | varchar(200) | **ATENÇÃO**: Texto livre, não é FK                                                               |
| `semester_id`                 | text          | `semestre`         | varchar(100) | **ATENÇÃO**: Precisa buscar ID de semester pelo nome                                             |
| `gender_id`                   | text          | `sexo`             | varchar(50)  | **ATENÇÃO**: Precisa buscar ID de gender pelo nome                                               |
| `accepts_disabled_candidates` | boolean       | `deficiencia`      | tinyint(1)   |                                                                                                  |
| `stipend_amount`              | numeric(10,2) | `bolsa`            | varchar(100) | Converter varchar para numeric                                                                   |
| `benefits_text`               | text          | `beneficio`        | varchar(100) |                                                                                                  |
| `requirements_text`           | text          | `exigencia`        | text         |                                                                                                  |
| `activities_text`             | text          | `atividade`        | text         |                                                                                                  |
| `application_instructions`    | text          | -                  | -            | Não existe no antigo, pode ser NULL                                                              |
| `notes`                       | text          | `observacao`       | text         |                                                                                                  |
| `created_at`                  | timestamp     | `created_at`       | datetime     |                                                                                                  |
| `updated_at`                  | timestamp     | `updated_at`       | datetime     |                                                                                                  |

### 22. signed_internship_commitment_term ← tce_docs (parcial)

| Campo Novo                      | Tipo Novo | Campo Antigo   | Tipo Antigo  | Observações                                                      |
| ------------------------------- | --------- | -------------- | ------------ | ---------------------------------------------------------------- |
| `id`                            | text      | -              | -            | **GERAR NOVO UUID**                                              |
| `old_id`                        | text      | `id`           | int(11)      |                                                                  |
| `public_id`                     | text      | -              | -            | Não existe no antigo, pode ser NULL                              |
| `internship_commitment_term_id` | text      | `tce_id`       | int(11)      | **ATENÇÃO**: Converter int para ID de internship_commitment_term |
| `company_id`                    | text      | `empresa_id`   | int(11)      | **ATENÇÃO**: Converter int para ID de company                    |
| `student_id`                    | text      | `estudante_id` | int(11)      | **ATENÇÃO**: Converter int para ID de student                    |
| `pdf_url`                       | text      | `documento`    | varchar(255) |                                                                  |
| `created_at`                    | timestamp | `created_at`   | timestamp    |                                                                  |
| `updated_at`                    | timestamp | `updated_at`   | timestamp    |                                                                  |

---

## Observações Importantes

### Conversões Necessárias

1. **IDs Sequenciais → UUIDs**: Muitas tabelas antigas usam `int(11)` como ID, enquanto o novo banco usa `text` (UUID). É necessário:
   - Gerar novos UUIDs para registros que não têm UUID
   - Manter o ID antigo no campo `old_id` para referência

2. **Foreign Keys**: Muitas FKs antigas são `int(11)`, precisam ser convertidas para UUIDs das novas tabelas:
   - `user_id` (int) → UUID de `users`
   - `estado_id` (int) → UUID de `state`
   - `curso_id` (int) → UUID de `course`
   - `semestre_id` (int) → UUID de `semester`
   - etc.

3. **Enums**: Alguns enums mudaram de valores:
   - `role`: 'undefined' não existe no novo banco
   - `status_solicitacao`: 'pendente'/'concluido' → 'open'/'in_progress'/'filled'/'canceled'/'closed'
   - `language_level`: 'nenhum'/'básico'/'intermediário'/'avançado' → 'beginner'/'intermediate'/'advanced'/'native'

4. **Campos de Texto Livre**: Alguns campos que eram FKs agora são texto livre:
   - `opportunity.education_level` (era FK, agora é text)

5. **Campos Calculados**: Alguns campos precisam ser calculados:
   - `internship_agreement_requests.proposed_end_date` a partir de `vigencia_estagio`

### Ordem de Migração Recomendada

1. **Tabelas de Referência** (sem dependências):
   - `state`
   - `gender`
   - `marital_status`
   - `education_level`
   - `course`
   - `semester`
   - `shift`
   - `educational_institution`

2. **Tabelas de Usuários**:
   - `users`

3. **Tabelas de Entidades**:
   - `company`
   - `institutions`
   - `student`

4. **Tabelas de Relacionamento**:
   - `company_representative`
   - `company_supervisor`
   - `institution_representative`
   - `institution_supervisor`

5. **Tabelas de Solicitações**:
   - `intern_requests`
   - `internship_agreement_requests`

6. **Tabelas de Termos**:
   - `internship_commitment_term`
   - `internship_termination_requests`
   - `signed_internship_commitment_term`

7. **Tabelas de Oportunidades**:
   - `opportunity`

8. **Tabelas de Autenticação**:
   - `refresh_tokens` (nova, sem dados antigos)

---

## Tabelas Não Migradas

As seguintes tabelas do banco antigo não têm correspondência direta no novo banco:

1. `prorrogacao_de_contrato` - Solicitações de prorrogação de contrato
2. `recibo_pagamento_bolsa` - Recibos de pagamento de bolsa
3. `recibo_recesso_remunerado` - Recibos de recesso remunerado
4. `tb_categoria` - Categorias de notícias
5. `tb_cursoinfnew` - Informações adicionais de curso
6. `tb_dados_financeiros` - Dados financeiros de empresas
7. `tb_depoimento` - Depoimentos
8. `tb_experprofis` - Experiências profissionais
9. `tb_noticia` - Notícias
10. `termo_realizacao_estagios` - Termos de realização de estágios

**Decisão necessária**: Avaliar se essas tabelas precisam ser migradas ou se os dados devem ser arquivados.
