# Resumo da Migração - Tabelas e Relações

## 📊 Estatísticas

- **Total de tabelas no banco antigo**: ~35 tabelas
- **Total de tabelas no banco novo**: 24 tabelas
- **Tabelas que serão migradas**: 23 tabelas
- **Tabelas sem correspondência**: 11 tabelas

---

## 🔄 Mapeamento Rápido de Tabelas

| #   | Tabela Nova                         | Tabela Antiga                | Status    | Observações                                                                                |
| --- | ----------------------------------- | ---------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| 1   | `users`                             | `tb_usuario`                 | ✅ Migrar | Converter `co_seq_usuario` para UUID                                                       |
| 2   | `company`                           | `tb_empresa`                 | ✅ Migrar | Converter `user_id` (int) para UUID                                                        |
| 3   | `institutions`                      | `tb_instituicao`             | ✅ Migrar | Converter `user_id` (int) para UUID                                                        |
| 4   | `student`                           | `tb_estudante`               | ✅ Migrar | Gerar novo UUID, converter todas FKs                                                       |
| 5   | `state`                             | `tb_estados`                 | ✅ Migrar | Gerar novo UUID                                                                            |
| 6   | `course`                            | `tb_confcurso`               | ✅ Migrar | Gerar novo UUID                                                                            |
| 7   | `semester`                          | `tb_semestre`                | ✅ Migrar | Gerar novo UUID                                                                            |
| 8   | `gender`                            | `tb_sexo`                    | ✅ Migrar | Gerar novo UUID                                                                            |
| 9   | `marital_status`                    | `tb_estado_civil`            | ✅ Migrar | Gerar novo UUID                                                                            |
| 10  | `education_level`                   | `tb_escolaridade`            | ✅ Migrar | Gerar novo UUID                                                                            |
| 11  | `educational_institution`           | `tb_confinstituicao`         | ✅ Migrar | Gerar novo UUID                                                                            |
| 12  | `shift`                             | `tb_turno`                   | ✅ Migrar | Gerar novo UUID                                                                            |
| 13  | `company_representative`            | `representante_empresas`     | ✅ Migrar | Gerar novo UUID                                                                            |
| 14  | `company_supervisor`                | `supervisor_empresas`        | ✅ Migrar | Gerar novo UUID                                                                            |
| 15  | `institution_representative`        | `representante_instituicaos` | ✅ Migrar | Gerar novo UUID                                                                            |
| 16  | `institution_supervisor`            | `supervisor_instituicaos`    | ✅ Migrar | Gerar novo UUID                                                                            |
| 17  | `intern_requests`                   | `solicitar_estagiarios`      | ✅ Migrar | Gerar novo UUID, mapear enums                                                              |
| 18  | `internship_agreement_requests`     | `solicitar_termos`           | ✅ Migrar | Gerar novo UUID, buscar FKs por nome                                                       |
| 19  | `internship_commitment_term`        | `tb_termo` + `termos`        | ✅ Migrar | Usar `tb_termo` como principal                                                             |
| 20  | `internship_termination_requests`   | `solicitar_rescisao_termos`  | ✅ Migrar | Gerar novo UUID, mapear enums                                                              |
| 21  | `opportunity`                       | `tb_vaga` + `vagas`          | ✅ Migrar | `tb_vaga` era antiga, `vagas` foi criada extraindo dados dela. Usar `vagas` como principal |
| 22  | `signed_internship_commitment_term` | `tce_docs`                   | ✅ Migrar | Gerar novo UUID, converter FKs                                                             |
| 23  | `refresh_tokens`                    | -                            | ⚠️ Nova   | Não há dados antigos                                                                       |

---

## ❌ Tabelas Não Migradas (Sem Correspondência)

| Tabela Antiga               | Motivo                                                                  |
| --------------------------- | ----------------------------------------------------------------------- |
| `prorrogacao_de_contrato`   | Não existe no novo banco                                                |
| `recibo_pagamento_bolsa`    | Não existe no novo banco                                                |
| `recibo_recesso_remunerado` | Não existe no novo banco                                                |
| `tb_categoria`              | Não existe no novo banco                                                |
| `tb_cursoinfnew`            | Não existe no novo banco                                                |
| `tb_dados_financeiros`      | Não existe no novo banco                                                |
| `tb_depoimento`             | Não existe no novo banco                                                |
| `tb_experprofis`            | Não existe no novo banco                                                |
| `tb_noticia`                | Não existe no novo banco                                                |
| `tb_representante`          | Substituído por `company_representative` e `institution_representative` |
| `tb_supervisor`             | Substituído por `company_supervisor` e `institution_supervisor`         |
| `termo_realizacao_estagios` | Não existe no novo banco                                                |

---

## 🔑 Principais Conversões Necessárias

### 1. IDs Sequenciais → UUIDs

- `co_seq_*` (int) → `id` (text/UUID)
- Manter ID antigo em `old_id`

### 2. Foreign Keys (int → UUID)

- `user_id` (int) → UUID de `users`
- `estado_id` (int) → UUID de `state`
- `curso_id` (int) → UUID de `course`
- `semestre_id` (int) → UUID de `semester`
- `genero` (enum) → UUID de `gender`
- `estado_civil_id` (int) → UUID de `marital_status`
- `nivel_escolaridade_id` (int) → UUID de `education_level`
- `instituicao_id` (int) → UUID de `educational_institution`
- `turno_id` (int) → UUID de `shift`
- `estudante_id` (int) → UUID de `student`
- `empresa_id` (int) → UUID de `company` (quando for int)
- `instituicao_id` (int) → UUID de `institutions` (quando for int)

### 3. Mapeamento de Enums

#### Role (users)

```
'student' → 'student'
'company' → 'company'
'institution' → 'institution'
'admin' → 'admin'
'undefined' → ? (decidir tratamento)
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

## 📋 Ordem de Migração Recomendada

### Fase 1: Tabelas de Referência (Sem Dependências)

1. `state`
2. `gender`
3. `marital_status`
4. `education_level`
5. `course`
6. `semester`
7. `shift`
8. `educational_institution`

### Fase 2: Usuários

9. `users`

### Fase 3: Entidades Principais

10. `company`
11. `institutions`
12. `student`

### Fase 4: Representantes e Supervisores

13. `company_representative`
14. `company_supervisor`
15. `institution_representative`
16. `institution_supervisor`

### Fase 5: Solicitações

17. `intern_requests`
18. `internship_agreement_requests`

### Fase 6: Termos

19. `internship_commitment_term`
20. `internship_termination_requests`
21. `signed_internship_commitment_term`

### Fase 7: Oportunidades

22. `opportunity`

### Fase 8: Autenticação

23. `refresh_tokens` (nova, sem dados)

---

## ⚠️ Pontos de Atenção

1. **Conversão de user_id**: Muitas tabelas têm `user_id` como `int(11)`, precisa buscar o UUID correspondente em `users.old_id`

2. **Busca por Nome**: Algumas FKs no banco antigo são texto (nome), precisam ser buscadas:
   - `solicitar_termos.curso` → buscar em `course.name`
   - `solicitar_termos.semestre` → buscar em `semester.name`
   - `vagas.curso` → buscar em `course.name`
   - `vagas.semestre` → buscar em `semester.name`
   - `vagas.sexo` → buscar em `gender.name`
   - `vagas.supervisor` → buscar em `company_supervisor.full_name`

3. **Cálculos Necessários**:
   - `internship_agreement_requests.proposed_end_date` = `data_inicio_estagio` + `vigencia_estagio` meses

4. **Campos Opcionais**: Alguns campos não existem no banco antigo e podem ser NULL:
   - `company.whatsapp`
   - `institutions.whatsapp`
   - `intern_requests.other_benefits`
   - `internship_agreement_requests.notes`
   - `internship_commitment_term.public_id`
   - `opportunity.application_instructions`
   - `signed_internship_commitment_term.public_id`

5. **Formatação de Dados**:
   - CPF: Remover formatação (pontos e traços)
   - CEP: Ajustar formato
   - Telefone: Padronizar formato
   - Decimal → Text: Converter `decimal(10,2)` para `text` em alguns campos

---

## 📝 Checklist de Migração

- [ ] Criar mapeamento de IDs antigos → novos UUIDs para cada tabela
- [ ] Migrar tabelas de referência (Fase 1)
- [ ] Migrar usuários (Fase 2)
- [ ] Migrar entidades principais (Fase 3)
- [ ] Migrar representantes e supervisores (Fase 4)
- [ ] Migrar solicitações (Fase 5)
- [ ] Migrar termos (Fase 6)
- [ ] Migrar oportunidades (Fase 7)
- [ ] Migrar tokens de autenticação (Fase 8)
- [ ] Validar integridade referencial
- [ ] Validar contagem de registros
- [ ] Testar consultas principais
